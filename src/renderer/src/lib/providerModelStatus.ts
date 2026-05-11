import { PROVIDERS } from "../constants";
import type {
  CredentialPoolSnapshot,
  ModelConfigSnapshot,
  ProviderAuthSnapshot,
  ReadinessTone,
} from "./readiness";

export type ProviderAuthStatusMap = Record<
  string,
  ProviderAuthSnapshot | null | undefined
>;

export type ProviderAuthSource =
  | "api-key"
  | "credential-pool"
  | "browser-auth"
  | "included"
  | "custom"
  | "auto"
  | "missing";

export type ProviderModelStatusItem = {
  provider: string;
  labelKey: string;
  selected: boolean;
  ready: boolean;
  activeForFetch: boolean;
  source: ProviderAuthSource;
  sourceLabelKey: string;
  statusLabelKey: string;
  tone: ReadinessTone;
  model: string;
  baseUrl: string;
};

export type ProviderModelStatusSource = {
  modelConfig: ModelConfigSnapshot | null;
  env: Record<string, string>;
  credentialPool: CredentialPoolSnapshot;
  providerAuth?: ProviderAuthStatusMap;
};

const SOURCE_LABEL_KEYS: Record<ProviderAuthSource, string> = {
  "api-key": "providers.authSourceApiKey",
  "credential-pool": "providers.authSourceCredentialPool",
  "browser-auth": "providers.authSourceBrowserAuth",
  included: "providers.authSourceIncluded",
  custom: "providers.authSourceCustom",
  auto: "providers.authSourceAuto",
  missing: "providers.authSourceMissing",
};

const BROWSER_AUTH_PROVIDERS = new Set(["openai-codex"]);

function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function hasPoolKey(
  provider: string,
  credentialPool: CredentialPoolSnapshot,
): boolean {
  return (credentialPool[provider] || []).some((entry) => hasText(entry.key));
}

function setupForProvider(
  provider: string,
): (typeof PROVIDERS.setup)[number] | undefined {
  return PROVIDERS.setup.find(
    (item) => item.id === provider || item.configProvider === provider,
  );
}

function providerSource(
  provider: string,
  source: ProviderModelStatusSource,
): ProviderAuthSource {
  if (provider === "auto") return "auto";

  const currentProvider = source.modelConfig?.provider || "auto";
  const selected = provider === currentProvider;
  const currentBaseUrl = source.modelConfig?.baseUrl || "";

  if (provider === "custom") {
    const autoCustom = currentProvider === "auto" && hasText(currentBaseUrl);
    return (selected || autoCustom) && hasText(currentBaseUrl)
      ? "custom"
      : "missing";
  }

  const auth = source.providerAuth?.[provider];
  if (BROWSER_AUTH_PROVIDERS.has(provider)) {
    return auth?.authenticated ? "browser-auth" : "missing";
  }

  if (hasPoolKey(provider, source.credentialPool)) {
    return "credential-pool";
  }

  const setup = setupForProvider(provider);
  if (setup?.envKey && hasText(source.env[setup.envKey])) {
    return "api-key";
  }

  if (setup && !setup.needsKey && selected) {
    return "included";
  }

  return "missing";
}

function sourceReady(source: ProviderAuthSource): boolean {
  return source !== "missing";
}

export function createProviderModelStatusItems(
  source: ProviderModelStatusSource,
): ProviderModelStatusItem[] {
  const currentProvider = source.modelConfig?.provider || "auto";
  const currentModel = source.modelConfig?.model || "";
  const currentBaseUrl = source.modelConfig?.baseUrl || "";

  const baseItems = PROVIDERS.options.map((option) => {
    const provider = option.value;
    const authSource = providerSource(provider, source);
    const ready = sourceReady(authSource);
    const selected = provider === currentProvider;
    const activeForFetch = provider !== "auto" && (ready || selected);

    return {
      provider,
      labelKey: option.label,
      selected,
      ready,
      activeForFetch,
      source: authSource,
      sourceLabelKey: SOURCE_LABEL_KEYS[authSource],
      statusLabelKey: ready
        ? "providers.statusReady"
        : "providers.statusNeedsSetup",
      tone: ready ? ("ok" as const) : ("warning" as const),
      model: selected ? currentModel : "",
      baseUrl: selected ? currentBaseUrl : "",
    };
  });

  if (currentProvider !== "auto") return baseItems;

  const hasReadyProvider = baseItems.some(
    (item) => item.provider !== "auto" && item.ready,
  );

  return baseItems.map((item) => {
    if (item.provider !== "auto") return item;
    return {
      ...item,
      ready: hasReadyProvider,
      activeForFetch: false,
      statusLabelKey: hasReadyProvider
        ? "providers.statusReady"
        : "providers.statusNeedsSetup",
      tone: hasReadyProvider ? ("ok" as const) : ("warning" as const),
    };
  });
}

export function readyProviderStatuses(
  items: ProviderModelStatusItem[],
): ProviderModelStatusItem[] {
  return items.filter((item) => item.provider !== "auto" && item.ready);
}

export function selectedProviderStatus(
  items: ProviderModelStatusItem[],
): ProviderModelStatusItem | null {
  return items.find((item) => item.selected) || null;
}
