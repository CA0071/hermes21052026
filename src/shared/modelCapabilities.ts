const OPENAI_FAST_MODE_PREFIXES = ["gpt-", "o1", "o3", "o4"] as const;

function stripVendorPrefix(modelId: string): string {
  const raw = modelId.trim().toLowerCase();
  return raw.includes("/") ? raw.split("/", 2)[1] : raw;
}

function normalizedBaseModel(modelId: string): string {
  return stripVendorPrefix(modelId).split(":", 1)[0] || "";
}

export function modelSupportsFastMode(modelId?: string | null): boolean {
  const base = normalizedBaseModel(String(modelId || ""));
  if (!base) return false;
  if (base.includes("codex")) return false;
  if (base.startsWith("claude-")) return true;
  return OPENAI_FAST_MODE_PREFIXES.some((prefix) => base.startsWith(prefix));
}
