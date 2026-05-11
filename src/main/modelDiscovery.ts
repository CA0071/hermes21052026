import http from "http";
import https from "https";
import { URL } from "url";
import { getCredentialPool, getModelConfig, readEnv } from "./config";
import { getProviderAuthStatus } from "./providerLogin";

const MODELS_DEV_URL = "https://models.dev/api.json";
const MODELS_DEV_CACHE_TTL = 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15000;

type JsonObject = Record<string, unknown>;

interface ProviderDefinition {
  provider: string;
  envKeys: string[];
  poolProvider?: string;
  modelsDevProvider?: string;
  endpoint?: string;
  auth: "none" | "bearer" | "anthropic" | "google-key";
  parser: "openai" | "anthropic" | "google" | "models-dev";
}

export interface DiscoveredModel {
  provider: string;
  model: string;
  name: string;
  baseUrl: string;
  source: "live" | "models.dev" | "endpoint";
}

export interface ProviderModelCatalog {
  provider: string;
  active: boolean;
  authSource: string;
  source: "live" | "models.dev" | "endpoint" | "none";
  models: DiscoveredModel[];
  error?: string;
}

export interface DiscoverModelsOptions {
  provider?: string;
  profile?: string;
  baseUrl?: string;
}

export interface ActiveProviderInput {
  env: Record<string, string>;
  credentialPool: Record<string, Array<{ key: string; label: string }>>;
  modelProvider?: string;
  modelBaseUrl?: string;
  authenticatedProviders?: string[];
}

const PROVIDER_DEFINITIONS: Record<string, ProviderDefinition> = {
  openrouter: {
    provider: "openrouter",
    envKeys: ["OPENROUTER_API_KEY"],
    modelsDevProvider: "openrouter",
    endpoint: "https://openrouter.ai/api/v1/models",
    auth: "bearer",
    parser: "openai",
  },
  anthropic: {
    provider: "anthropic",
    envKeys: ["ANTHROPIC_API_KEY"],
    modelsDevProvider: "anthropic",
    endpoint: "https://api.anthropic.com/v1/models?limit=1000",
    auth: "anthropic",
    parser: "anthropic",
  },
  openai: {
    provider: "openai",
    envKeys: ["OPENAI_API_KEY"],
    modelsDevProvider: "openai",
    endpoint: "https://api.openai.com/v1/models",
    auth: "bearer",
    parser: "openai",
  },
  "openai-codex": {
    provider: "openai-codex",
    envKeys: [],
    modelsDevProvider: "openai",
    auth: "none",
    parser: "models-dev",
  },
  google: {
    provider: "google",
    envKeys: ["GOOGLE_API_KEY"],
    modelsDevProvider: "google",
    endpoint: "https://generativelanguage.googleapis.com/v1beta/models",
    auth: "google-key",
    parser: "google",
  },
  xai: {
    provider: "xai",
    envKeys: ["XAI_API_KEY"],
    modelsDevProvider: "xai",
    endpoint: "https://api.x.ai/v1/models",
    auth: "bearer",
    parser: "openai",
  },
  groq: {
    provider: "groq",
    envKeys: ["GROQ_API_KEY"],
    modelsDevProvider: "groq",
    endpoint: "https://api.groq.com/openai/v1/models",
    auth: "bearer",
    parser: "openai",
  },
  minimax: {
    provider: "minimax",
    envKeys: ["MINIMAX_API_KEY", "MINIMAX_CN_API_KEY"],
    modelsDevProvider: "minimax",
    auth: "none",
    parser: "models-dev",
  },
  qwen: {
    provider: "qwen",
    envKeys: ["DASHSCOPE_API_KEY", "QWEN_API_KEY", "ALIBABA_API_KEY"],
    modelsDevProvider: "alibaba",
    auth: "none",
    parser: "models-dev",
  },
  nous: {
    provider: "nous",
    envKeys: [],
    modelsDevProvider: "openrouter",
    auth: "none",
    parser: "models-dev",
  },
};

const CUSTOM_PROVIDERS = new Set([
  "custom",
  "local",
  "lmstudio",
  "ollama",
  "vllm",
  "llamacpp",
]);
const OAUTH_PROVIDERS = ["openai-codex", "nous"];
const MODEL_NOISE_PATTERN =
  /embedding|embed-|rerank|moderation|whisper|tts\b|speech|transcrib|audio|image-generation|image-preview|-image\b|dall-e/i;

let modelsDevCache: JsonObject | null = null;
let modelsDevCacheTime = 0;

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeProvider(provider?: string): string {
  const value = (provider || "").trim().toLowerCase();
  if (value === "gemini") return "google";
  if (value === "together" || value === "togetherai") return "togetherai";
  return value;
}

function humanizeModelId(modelId: string): string {
  const bare = modelId.split("/").pop() || modelId;
  return bare
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace(/\bGpt\b/g, "GPT")
    .replace(/\bAi\b/g, "AI");
}

function shouldHideModel(modelId: string, modelData?: JsonObject): boolean {
  if (!modelId || MODEL_NOISE_PATTERN.test(modelId)) return true;
  const modalities = modelData?.modalities;
  if (isObject(modalities)) {
    const output = modalities.output;
    if (
      Array.isArray(output) &&
      output.length > 0 &&
      output.includes("image") &&
      !output.includes("text")
    ) {
      return true;
    }
  }
  return false;
}

function dedupeAndSort(models: DiscoveredModel[]): DiscoveredModel[] {
  const byKey = new Map<string, DiscoveredModel>();
  for (const model of models) {
    byKey.set(`${model.provider}:${model.model}:${model.baseUrl}`, model);
  }
  return [...byKey.values()].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}

function requestJson(
  url: string,
  headers: Record<string, string> = {},
  redirects = 0,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const requester = target.protocol === "http:" ? http : https;
    const req = requester.request(
      target,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": "Hermes Desktop",
          ...headers,
        },
        timeout: REQUEST_TIMEOUT_MS,
      },
      (res) => {
        const location = res.headers.location;
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          location &&
          redirects < 3
        ) {
          res.resume();
          const nextUrl = new URL(location, target).toString();
          requestJson(nextUrl, headers, redirects + 1).then(resolve, reject);
          return;
        }

        let raw = "";
        res.setEncoding("utf-8");
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => {
          if (
            !res.statusCode ||
            res.statusCode < 200 ||
            res.statusCode >= 300
          ) {
            reject(
              new Error(
                `HTTP ${res.statusCode || "error"} from ${target.hostname}`,
              ),
            );
            return;
          }
          try {
            resolve(JSON.parse(raw));
          } catch {
            reject(new Error(`Invalid JSON from ${target.hostname}`));
          }
        });
      },
    );

    req.on("timeout", () => {
      req.destroy(new Error(`Timed out fetching ${target.hostname}`));
    });
    req.on("error", reject);
    req.end();
  });
}

async function fetchModelsDev(): Promise<JsonObject> {
  const now = Date.now();
  if (modelsDevCache && now - modelsDevCacheTime < MODELS_DEV_CACHE_TTL) {
    return modelsDevCache;
  }
  const payload = await requestJson(MODELS_DEV_URL);
  if (!isObject(payload)) return {};
  modelsDevCache = payload;
  modelsDevCacheTime = now;
  return payload;
}

export function parseModelsDevCatalog(
  provider: string,
  providerData: unknown,
): DiscoveredModel[] {
  if (!isObject(providerData) || !isObject(providerData.models)) return [];
  const baseUrl = typeof providerData.api === "string" ? providerData.api : "";
  const models: DiscoveredModel[] = [];

  for (const [modelId, rawModel] of Object.entries(providerData.models)) {
    const modelData = isObject(rawModel) ? rawModel : {};
    if (shouldHideModel(modelId, modelData)) continue;
    const name =
      typeof modelData.name === "string" && modelData.name.trim()
        ? modelData.name.trim()
        : humanizeModelId(modelId);
    models.push({
      provider,
      model: modelId,
      name,
      baseUrl,
      source: "models.dev",
    });
  }

  return dedupeAndSort(models);
}

function parseOpenAiCatalog(
  provider: string,
  payload: unknown,
  baseUrl: string,
): DiscoveredModel[] {
  if (!isObject(payload) || !Array.isArray(payload.data)) return [];
  const models: DiscoveredModel[] = [];
  for (const rawModel of payload.data) {
    if (!isObject(rawModel) || typeof rawModel.id !== "string") continue;
    if (shouldHideModel(rawModel.id, rawModel)) continue;
    models.push({
      provider,
      model: rawModel.id,
      name:
        typeof rawModel.name === "string" && rawModel.name.trim()
          ? rawModel.name.trim()
          : humanizeModelId(rawModel.id),
      baseUrl,
      source: "live",
    });
  }
  return dedupeAndSort(models);
}

function parseAnthropicCatalog(
  provider: string,
  payload: unknown,
  baseUrl: string,
): DiscoveredModel[] {
  if (!isObject(payload) || !Array.isArray(payload.data)) return [];
  const models: DiscoveredModel[] = [];
  for (const rawModel of payload.data) {
    if (!isObject(rawModel) || typeof rawModel.id !== "string") continue;
    if (shouldHideModel(rawModel.id, rawModel)) continue;
    models.push({
      provider,
      model: rawModel.id,
      name:
        typeof rawModel.display_name === "string" &&
        rawModel.display_name.trim()
          ? rawModel.display_name.trim()
          : humanizeModelId(rawModel.id),
      baseUrl,
      source: "live",
    });
  }
  return dedupeAndSort(models);
}

function parseGoogleCatalog(
  provider: string,
  payload: unknown,
  baseUrl: string,
): DiscoveredModel[] {
  if (!isObject(payload) || !Array.isArray(payload.models)) return [];
  const models: DiscoveredModel[] = [];
  for (const rawModel of payload.models) {
    if (!isObject(rawModel) || typeof rawModel.name !== "string") continue;
    const supported = rawModel.supportedGenerationMethods;
    if (
      Array.isArray(supported) &&
      !supported.includes("generateContent") &&
      !supported.includes("streamGenerateContent")
    ) {
      continue;
    }
    const modelId = rawModel.name.replace(/^models\//, "");
    if (shouldHideModel(modelId, rawModel)) continue;
    models.push({
      provider,
      model: modelId,
      name:
        typeof rawModel.displayName === "string" && rawModel.displayName.trim()
          ? rawModel.displayName.trim()
          : humanizeModelId(modelId),
      baseUrl,
      source: "live",
    });
  }
  return dedupeAndSort(models);
}

function firstCredential(
  provider: string,
  env: Record<string, string>,
  pool: Record<string, Array<{ key: string; label: string }>>,
  envKeys: string[] = [],
): { key: string; source: string } {
  for (const envKey of envKeys) {
    if (env[envKey]) return { key: env[envKey], source: envKey };
  }
  const poolEntry = pool[provider]?.find((entry) => entry.key);
  if (poolEntry?.key) {
    return {
      key: poolEntry.key,
      source: poolEntry.label
        ? `credential pool: ${poolEntry.label}`
        : "credential pool",
    };
  }
  return { key: "", source: "" };
}

export function detectActiveModelProviders(
  input: ActiveProviderInput,
): string[] {
  const active = new Set<string>();
  const modelProvider = normalizeProvider(input.modelProvider);

  for (const def of Object.values(PROVIDER_DEFINITIONS)) {
    const hasEnv = def.envKeys.some((key) => Boolean(input.env[key]));
    const hasPool = Boolean(
      input.credentialPool[def.poolProvider || def.provider]?.some(
        (entry) => entry.key,
      ),
    );
    if (hasEnv || hasPool) active.add(def.provider);
  }

  for (const provider of input.authenticatedProviders || []) {
    active.add(normalizeProvider(provider));
  }

  if (modelProvider && modelProvider !== "auto") {
    active.add(modelProvider);
  }

  if (!modelProvider && input.modelBaseUrl) {
    active.add("custom");
  }

  return [...active];
}

async function authenticatedOAuthProviders(): Promise<string[]> {
  const statuses = await Promise.all(
    OAUTH_PROVIDERS.map(async (provider) => {
      try {
        const status = await getProviderAuthStatus(provider);
        return status.authenticated ? provider : "";
      } catch {
        return "";
      }
    }),
  );
  return statuses.filter(Boolean);
}

function authHeaders(
  def: ProviderDefinition,
  apiKey: string,
): Record<string, string> {
  if (!apiKey) return {};
  if (def.auth === "bearer") return { Authorization: `Bearer ${apiKey}` };
  if (def.auth === "anthropic") {
    return {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    };
  }
  return {};
}

function endpointWithKey(def: ProviderDefinition, apiKey: string): string {
  if (!def.endpoint) return "";
  if (def.auth !== "google-key") return def.endpoint;
  const url = new URL(def.endpoint);
  if (apiKey) url.searchParams.set("key", apiKey);
  return url.toString();
}

async function fetchLiveProviderModels(
  def: ProviderDefinition,
  apiKey: string,
): Promise<DiscoveredModel[]> {
  if (!def.endpoint || (def.auth !== "none" && !apiKey)) return [];
  const url = endpointWithKey(def, apiKey);
  const payload = await requestJson(url, authHeaders(def, apiKey));
  const baseUrl = def.endpoint
    .replace(/\/models(?:\?.*)?$/, "")
    .replace(/\/+$/, "");
  if (def.parser === "anthropic") {
    return parseAnthropicCatalog(def.provider, payload, baseUrl);
  }
  if (def.parser === "google") {
    return parseGoogleCatalog(
      def.provider,
      payload,
      "https://generativelanguage.googleapis.com/v1beta",
    );
  }
  return parseOpenAiCatalog(def.provider, payload, baseUrl);
}

function normalizeEndpointBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  return trimmed || "";
}

async function fetchEndpointModels(
  provider: string,
  baseUrl: string,
  apiKey: string,
): Promise<DiscoveredModel[]> {
  const normalized = normalizeEndpointBaseUrl(baseUrl);
  if (!normalized) return [];
  const candidates = [normalized];
  if (normalized.endsWith("/v1")) {
    candidates.push(normalized.slice(0, -3).replace(/\/+$/, ""));
  } else {
    candidates.push(`${normalized}/v1`);
  }

  let lastError: Error | null = null;
  for (const candidate of [...new Set(candidates)]) {
    try {
      const payload = await requestJson(
        `${candidate}/models`,
        apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      );
      const models = parseOpenAiCatalog(provider, payload, candidate);
      if (models.length > 0) {
        return models.map((model) => ({ ...model, source: "endpoint" }));
      }
    } catch (err) {
      lastError = err as Error;
    }
  }
  if (lastError) throw lastError;
  return [];
}

async function fetchModelsDevCatalog(
  provider: string,
  modelsDevProvider?: string,
): Promise<DiscoveredModel[]> {
  if (!modelsDevProvider) return [];
  const registry = await fetchModelsDev();
  return parseModelsDevCatalog(provider, registry[modelsDevProvider]);
}

async function discoverOneProvider(
  provider: string,
  context: {
    env: Record<string, string>;
    pool: Record<string, Array<{ key: string; label: string }>>;
    activeProviders: Set<string>;
    modelBaseUrl: string;
    requestedBaseUrl?: string;
    explicit: boolean;
  },
): Promise<ProviderModelCatalog> {
  const normalizedProvider = normalizeProvider(provider);
  const def = PROVIDER_DEFINITIONS[normalizedProvider];
  const isCustom = CUSTOM_PROVIDERS.has(normalizedProvider);
  const active = context.activeProviders.has(normalizedProvider);

  if (isCustom) {
    const baseUrl = context.requestedBaseUrl || context.modelBaseUrl;
    const credential = firstCredential("custom", context.env, context.pool, [
      "CUSTOM_API_KEY",
      "OPENAI_API_KEY",
    ]);
    if (!baseUrl) {
      return {
        provider: normalizedProvider,
        active,
        authSource: "custom endpoint",
        source: "none",
        models: [],
        error: "No custom provider Base URL is configured.",
      };
    }
    try {
      const models = await fetchEndpointModels(
        normalizedProvider,
        baseUrl,
        credential.key,
      );
      return {
        provider: normalizedProvider,
        active: true,
        authSource: credential.source || "custom endpoint",
        source: "endpoint",
        models,
      };
    } catch (err) {
      return {
        provider: normalizedProvider,
        active: true,
        authSource: credential.source || "custom endpoint",
        source: "endpoint",
        models: [],
        error: (err as Error).message,
      };
    }
  }

  if (!def) {
    return {
      provider: normalizedProvider || provider,
      active,
      authSource: "",
      source: "none",
      models: [],
      error: `No model catalog is configured for ${provider}.`,
    };
  }

  const credential = firstCredential(
    def.poolProvider || def.provider,
    context.env,
    context.pool,
    def.envKeys,
  );

  try {
    const liveModels = await fetchLiveProviderModels(def, credential.key);
    if (liveModels.length > 0) {
      return {
        provider: def.provider,
        active: active || context.explicit,
        authSource: credential.source || (active ? "authenticated" : ""),
        source: "live",
        models: liveModels,
      };
    }
  } catch {
    // Fall back to models.dev below. Provider endpoints can fail because of
    // rate limits, key scope, or offline mode; the registry still gives users a
    // useful no-manual-typing path.
  }

  try {
    const fallbackModels = await fetchModelsDevCatalog(
      def.provider,
      def.modelsDevProvider,
    );
    return {
      provider: def.provider,
      active: active || context.explicit,
      authSource: credential.source || (active ? "authenticated" : ""),
      source: "models.dev",
      models: fallbackModels,
    };
  } catch (err) {
    return {
      provider: def.provider,
      active: active || context.explicit,
      authSource: credential.source || "",
      source: "none",
      models: [],
      error: (err as Error).message,
    };
  }
}

export async function discoverModels(
  options: DiscoverModelsOptions = {},
): Promise<ProviderModelCatalog[]> {
  const provider = normalizeProvider(options.provider);
  const env = readEnv(options.profile);
  const pool = getCredentialPool();
  const modelConfig = getModelConfig(options.profile);
  const authenticatedProviders = await authenticatedOAuthProviders();
  const activeProviders = new Set(
    detectActiveModelProviders({
      env,
      credentialPool: pool,
      modelProvider: modelConfig.provider,
      modelBaseUrl: modelConfig.baseUrl,
      authenticatedProviders,
    }),
  );

  const providers =
    provider && provider !== "auto"
      ? [provider]
      : [...activeProviders].filter((item) => item && item !== "auto");

  const catalogs = await Promise.all(
    providers.map((item) =>
      discoverOneProvider(item, {
        env,
        pool,
        activeProviders,
        modelBaseUrl: modelConfig.baseUrl,
        requestedBaseUrl: options.baseUrl,
        explicit: Boolean(provider),
      }),
    ),
  );

  return catalogs.filter(
    (catalog) => catalog.models.length > 0 || catalog.error || provider,
  );
}
