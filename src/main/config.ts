import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { HERMES_HOME } from "./installer";
import { profileHome, escapeRegex, safeWriteFile } from "./utils";

// ── Connection Config (local vs remote) ─────────────────

export interface ConnectionConfig {
  mode: "local" | "remote";
  remoteUrl: string;
  apiKey: string;
}

// Lazy getter — avoids circular dependency with installer.ts
// (HERMES_HOME may not be assigned yet when this module first loads)
function desktopConfigFile(): string {
  return join(HERMES_HOME, "desktop.json");
}

function readDesktopConfig(): Record<string, unknown> {
  try {
    const f = desktopConfigFile();
    if (!existsSync(f)) return {};
    return JSON.parse(readFileSync(f, "utf-8"));
  } catch {
    return {};
  }
}

function writeDesktopConfig(data: Record<string, unknown>): void {
  if (!existsSync(HERMES_HOME)) {
    mkdirSync(HERMES_HOME, { recursive: true });
  }
  writeFileSync(desktopConfigFile(), JSON.stringify(data, null, 2), "utf-8");
}

export function getConnectionConfig(): ConnectionConfig {
  const data = readDesktopConfig();
  return {
    mode: (data.connectionMode as "local" | "remote") || "local",
    remoteUrl: (data.remoteUrl as string) || "",
    apiKey: (data.remoteApiKey as string) || "",
  };
}

export function setConnectionConfig(config: ConnectionConfig): void {
  const data = readDesktopConfig();
  data.connectionMode = config.mode;
  data.remoteUrl = config.remoteUrl;
  data.remoteApiKey = config.apiKey;
  writeDesktopConfig(data);
}

// ── In-memory cache with TTL ─────────────────────────────
const CACHE_TTL = 5000; // 5 seconds
const _cache = new Map<string, { data: unknown; ts: number }>();

function getCached<T>(key: string): T | undefined {
  const entry = _cache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.ts > CACHE_TTL) {
    _cache.delete(key);
    return undefined;
  }
  return entry.data as T;
}

function setCache(key: string, data: unknown): void {
  _cache.set(key, { data, ts: Date.now() });
}

function invalidateCache(prefix: string): void {
  for (const key of _cache.keys()) {
    if (key.startsWith(prefix)) _cache.delete(key);
  }
}

function yamlQuote(value: string): string {
  return JSON.stringify(value);
}

function sectionBlock(content: string, section: string): string | null {
  const re = new RegExp(
    `^${escapeRegex(section)}:[ \\t]*\\n((?:[ \\t]+.*(?:\\r?\\n|$))*)`,
    "m",
  );
  return content.match(re)?.[1] || null;
}

function sectionValue(
  content: string,
  section: string,
  key: string,
): string | null {
  const block = sectionBlock(content, section);
  if (!block) return null;
  const re = new RegExp(
    `^[ \\t]*${escapeRegex(key)}:[ \\t]*["']?([^"'\\n#]*)["']?`,
    "m",
  );
  const match = block.match(re);
  const value = match?.[1]?.trim();
  return match ? value || "" : null;
}

function scalarSectionValue(content: string, section: string): string | null {
  const re = new RegExp(
    `^${escapeRegex(section)}:[ \\t]*["']?([^"'\\n#]+)["']?`,
    "m",
  );
  const value = content.match(re)?.[1]?.trim();
  return value || null;
}

function upsertModelSection(
  content: string,
  provider: string,
  model: string,
  baseUrl: string,
): string {
  const values = {
    default: model,
    provider,
    base_url: baseUrl,
  };
  const blockRe = /^model:\s*\n((?:[ \t]+.*(?:\r?\n|$))*)/m;

  function upsertBlockValue(block: string, key: string, value: string): string {
    const lineRe = new RegExp(
      `^([ \\t]*${escapeRegex(key)}:[ \\t]*)["']?[^"'\\n#]*["']?`,
      "m",
    );
    if (lineRe.test(block)) {
      return block.replace(lineRe, `$1${yamlQuote(value)}`);
    }
    const suffix = block.endsWith("\n") || block.length === 0 ? "" : "\n";
    return `${block}${suffix}  ${key}: ${yamlQuote(value)}\n`;
  }

  const blockMatch = content.match(blockRe);
  if (blockMatch) {
    const blockStart = blockMatch.index ?? 0;
    let block = blockMatch[1];
    for (const [key, value] of Object.entries(values)) {
      block = upsertBlockValue(block, key, value);
    }
    return (
      content.slice(0, blockStart) +
      `model:\n${block}` +
      content.slice(blockStart + blockMatch[0].length)
    );
  }

  const scalarRe = /^model:[ \t]*["']?[^"'\n#]*["']?.*$/m;
  const modelBlock = `model:\n  default: ${yamlQuote(model)}\n  provider: ${yamlQuote(provider)}\n  base_url: ${yamlQuote(baseUrl)}\n`;
  if (scalarRe.test(content)) {
    return content.replace(scalarRe, modelBlock.trimEnd());
  }

  const prefix = content.trimEnd();
  return `${prefix}${prefix ? "\n\n" : ""}${modelBlock}`;
}

function profilePaths(profile?: string): {
  envFile: string;
  configFile: string;
  home: string;
} {
  const home = profileHome(profile);
  return {
    home,
    envFile: join(home, ".env"),
    configFile: join(home, "config.yaml"),
  };
}

export function readEnv(profile?: string): Record<string, string> {
  const cacheKey = `env:${profile || "default"}`;
  const cached = getCached<Record<string, string>>(cacheKey);
  if (cached) return cached;

  const { envFile } = profilePaths(profile);
  if (!existsSync(envFile)) return {};

  const content = readFileSync(envFile, "utf-8");
  const result: Record<string, string> = {};

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#") || !trimmed.includes("=")) continue;

    const eqIndex = trimmed.indexOf("=");
    const key = trimmed.substring(0, eqIndex).trim();
    let value = trimmed.substring(eqIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (value) result[key] = value;
  }

  setCache(cacheKey, result);
  return result;
}

export function setEnvValue(
  key: string,
  value: string,
  profile?: string,
): void {
  const { envFile } = profilePaths(profile);
  invalidateCache(`env:${profile || "default"}`);

  if (!existsSync(envFile)) {
    safeWriteFile(envFile, `${key}=${value}\n`);
    return;
  }

  const content = readFileSync(envFile, "utf-8");
  const lines = content.split("\n");
  let found = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.match(new RegExp(`^#?\\s*${escapeRegex(key)}\\s*=`))) {
      lines[i] = `${key}=${value}`;
      found = true;
      break;
    }
  }

  if (!found) {
    lines.push(`${key}=${value}`);
  }

  safeWriteFile(envFile, lines.join("\n"));
}

export function getConfigValue(key: string, profile?: string): string | null {
  const { configFile } = profilePaths(profile);
  if (!existsSync(configFile)) return null;

  const content = readFileSync(configFile, "utf-8");
  const regex = new RegExp(
    `^\\s*${escapeRegex(key)}:\\s*["']?([^"'\\n#]+)["']?`,
    "m",
  );
  const match = content.match(regex);
  return match ? match[1].trim() : null;
}

export function setConfigValue(
  key: string,
  value: string,
  profile?: string,
): void {
  const { configFile } = profilePaths(profile);
  if (!existsSync(configFile)) return;

  let content = readFileSync(configFile, "utf-8");
  const regex = new RegExp(
    `^(\\s*#?\\s*${escapeRegex(key)}:\\s*)["']?[^"'\\n#]*["']?`,
    "m",
  );

  if (regex.test(content)) {
    content = content.replace(regex, `$1"${value}"`);
  }

  safeWriteFile(configFile, content);
}

export function getModelConfig(profile?: string): {
  provider: string;
  model: string;
  baseUrl: string;
} {
  const cacheKey = `mc:${profile || "default"}`;
  const cached = getCached<{
    provider: string;
    model: string;
    baseUrl: string;
  }>(cacheKey);
  if (cached) return cached;

  const { configFile } = profilePaths(profile);
  const defaults = { provider: "auto", model: "", baseUrl: "" };
  if (!existsSync(configFile)) return defaults;

  const content = readFileSync(configFile, "utf-8");

  const provider =
    sectionValue(content, "model", "provider") ??
    sectionValue(content, "models", "provider");
  const model =
    sectionValue(content, "model", "default") ??
    scalarSectionValue(content, "model") ??
    sectionValue(content, "models", "default");
  const baseUrl =
    sectionValue(content, "model", "base_url") ??
    sectionValue(content, "models", "base_url");

  const result = {
    provider: provider || defaults.provider,
    model: model ?? defaults.model,
    baseUrl: baseUrl ?? defaults.baseUrl,
  };

  setCache(cacheKey, result);
  return result;
}

export function setModelConfig(
  provider: string,
  model: string,
  baseUrl: string,
  profile?: string,
): void {
  invalidateCache(`mc:${profile || "default"}`);
  const { configFile } = profilePaths(profile);
  let content = existsSync(configFile) ? readFileSync(configFile, "utf-8") : "";
  content = upsertModelSection(content, provider, model, baseUrl);

  // Disable smart_model_routing
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (
      /^\s*enabled:\s*(true|false)/.test(lines[i]) &&
      i > 0 &&
      /smart_model_routing/.test(lines[i - 1])
    ) {
      lines[i] = lines[i].replace(/(enabled:\s*)(true|false)/, "$1false");
    }
  }
  content = lines.join("\n");

  // Enable streaming
  const streamingRegex = /^(\s*streaming:\s*)(\S+)/m;
  if (streamingRegex.test(content)) {
    content = content.replace(streamingRegex, "$1true");
  }

  safeWriteFile(configFile, content);
}

export function getHermesHome(profile?: string): string {
  return profilePaths(profile).home;
}

// ── Platform enabled/disabled in config.yaml ────────────

const SUPPORTED_PLATFORMS = [
  "telegram",
  "discord",
  "slack",
  "whatsapp",
  "signal",
];

export function getPlatformEnabled(profile?: string): Record<string, boolean> {
  const { configFile } = profilePaths(profile);
  if (!existsSync(configFile)) return {};

  const content = readFileSync(configFile, "utf-8");
  const result: Record<string, boolean> = {};

  for (const platform of SUPPORTED_PLATFORMS) {
    // Match "  platform:\n    enabled: true/false" under the platforms: block
    const re = new RegExp(
      `^[ \\t]+${platform}:\\s*\\n[ \\t]+enabled:\\s*(true|false)`,
      "m",
    );
    const match = content.match(re);
    result[platform] = match ? match[1] === "true" : false;
  }

  return result;
}

export function setPlatformEnabled(
  platform: string,
  enabled: boolean,
  profile?: string,
): void {
  if (!SUPPORTED_PLATFORMS.includes(platform)) return;

  const { configFile } = profilePaths(profile);
  if (!existsSync(configFile)) return;

  let content = readFileSync(configFile, "utf-8");

  // Check if the platform entry already exists under platforms:
  const existingRe = new RegExp(
    `^([ \\t]+${platform}:\\s*\\n[ \\t]+enabled:\\s*)(?:true|false)`,
    "m",
  );

  if (existingRe.test(content)) {
    // Update existing entry
    content = content.replace(existingRe, `$1${enabled}`);
  } else {
    // Append new platform entry after the platforms: block
    // Find the platforms: line and insert after the last existing platform entry
    const platformsIdx = content.indexOf("\nplatforms:");
    if (platformsIdx === -1) {
      // No platforms section at all — append one
      content += `\nplatforms:\n  ${platform}:\n    enabled: ${enabled}\n`;
    } else {
      // Insert the new platform at the end of the platforms block.
      // Find the next top-level key (non-indented, non-comment, non-empty line)
      // after the platforms: line.
      const afterPlatforms = content.substring(platformsIdx + 1);
      const lines = afterPlatforms.split("\n");
      let insertOffset = platformsIdx + 1; // after the \n
      // Skip the "platforms:" line itself
      insertOffset += lines[0].length + 1;

      // Skip all indented lines (children of platforms:)
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim() === "" || /^\s/.test(line)) {
          insertOffset += line.length + 1;
        } else {
          break;
        }
      }

      const entry = `  ${platform}:\n    enabled: ${enabled}\n`;
      content =
        content.substring(0, insertOffset) +
        entry +
        content.substring(insertOffset);
    }
  }

  safeWriteFile(configFile, content);
}

// ── Credential Pool (auth.json) ──────────────────────────

function authFilePath(): string {
  return join(HERMES_HOME, "auth.json");
}

interface CredentialEntry {
  key: string;
  label: string;
}

function readAuthStore(): Record<string, unknown> {
  try {
    const p = authFilePath();
    if (!existsSync(p)) return {};
    return JSON.parse(readFileSync(p, "utf-8"));
  } catch {
    return {};
  }
}

function writeAuthStore(store: Record<string, unknown>): void {
  safeWriteFile(authFilePath(), JSON.stringify(store, null, 2));
}

export function getCredentialPool(): Record<string, CredentialEntry[]> {
  const store = readAuthStore();
  const pool = store.credential_pool;
  if (!pool || typeof pool !== "object") return {};
  return pool as Record<string, CredentialEntry[]>;
}

export function setCredentialPool(
  provider: string,
  entries: CredentialEntry[],
): void {
  const store = readAuthStore();
  if (!store.credential_pool || typeof store.credential_pool !== "object") {
    store.credential_pool = {};
  }
  (store.credential_pool as Record<string, CredentialEntry[]>)[provider] =
    entries;
  writeAuthStore(store);
}
