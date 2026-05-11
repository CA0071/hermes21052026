const OPENAI_FAST_MODE_PREFIXES = ["gpt-", "o1", "o3", "o4"] as const;
const OPENAI_REASONING_PREFIXES = ["gpt-5", "gpt-6", "o1", "o3", "o4"] as const;

export type ReasoningEffort =
  | "none"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh";

export const REASONING_EFFORTS = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
] as const satisfies readonly ReasoningEffort[];

const OPENAI_REASONING_EFFORTS = [
  "none",
  "low",
  "medium",
  "high",
] as const satisfies readonly ReasoningEffort[];

const CLAUDE_REASONING_EFFORTS = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
] as const satisfies readonly ReasoningEffort[];

const CLAUDE_XHIGH_REASONING_EFFORTS = [
  ...CLAUDE_REASONING_EFFORTS,
  "xhigh",
] as const satisfies readonly ReasoningEffort[];

const GEMINI_25_REASONING_EFFORTS = [
  "none",
  "medium",
] as const satisfies readonly ReasoningEffort[];

const GEMINI_3_PRO_REASONING_EFFORTS = [
  "none",
  "low",
  "high",
] as const satisfies readonly ReasoningEffort[];

const GEMINI_3_FLASH_REASONING_EFFORTS = [
  "none",
  "low",
  "medium",
  "high",
] as const satisfies readonly ReasoningEffort[];

const GROK_EFFORT_CAPABLE_PREFIXES = [
  "grok-3-mini",
  "grok-4.20-multi-agent",
  "grok-4.3",
] as const;

const REASONING_EFFORT_SET = new Set<ReasoningEffort>(REASONING_EFFORTS);

function stripVendorPrefix(modelId: string): string {
  const raw = modelId.trim().toLowerCase();
  if (!raw.includes("/")) return raw;
  const parts = raw.split("/");
  return parts[parts.length - 1] || raw;
}

function normalizedBaseModel(modelId: string): string {
  return stripVendorPrefix(modelId).split(":", 1)[0] || "";
}

function normalizedProvider(provider?: string | null): string {
  return String(provider || "")
    .trim()
    .toLowerCase();
}

function supportsOpenAIReasoningEffort(
  base: string,
  provider?: string | null,
): boolean {
  const providerId = normalizedProvider(provider);
  if (providerId === "openai-codex" || base.includes("codex")) return true;
  return OPENAI_REASONING_PREFIXES.some((prefix) => base.startsWith(prefix));
}

function supportsGrokReasoningEffort(base: string): boolean {
  return GROK_EFFORT_CAPABLE_PREFIXES.some((prefix) => base.startsWith(prefix));
}

export function modelSupportsFastMode(modelId?: string | null): boolean {
  const base = normalizedBaseModel(String(modelId || ""));
  if (!base) return false;
  if (base.includes("codex")) return false;
  if (base.startsWith("claude-")) return true;
  return OPENAI_FAST_MODE_PREFIXES.some((prefix) => base.startsWith(prefix));
}

export function normalizeReasoningEffort(
  value?: string | null,
): ReasoningEffort {
  const normalized = String(value || "")
    .trim()
    .toLowerCase() as ReasoningEffort;
  return REASONING_EFFORT_SET.has(normalized) ? normalized : "medium";
}

export function modelReasoningEffortOptions(
  modelId?: string | null,
  provider?: string | null,
): ReasoningEffort[] {
  const base = normalizedBaseModel(String(modelId || ""));
  if (!base) return [];

  if (supportsOpenAIReasoningEffort(base, provider)) {
    return [...OPENAI_REASONING_EFFORTS];
  }

  if (base.startsWith("claude-") && !base.includes("haiku")) {
    return base.includes("4-7") || base.includes("4.7")
      ? [...CLAUDE_XHIGH_REASONING_EFFORTS]
      : [...CLAUDE_REASONING_EFFORTS];
  }

  if (base.startsWith("gemini-2.5-")) {
    return [...GEMINI_25_REASONING_EFFORTS];
  }

  if (base.startsWith("gemini-3") || base.startsWith("gemini-3.1")) {
    return base.includes("flash")
      ? [...GEMINI_3_FLASH_REASONING_EFFORTS]
      : [...GEMINI_3_PRO_REASONING_EFFORTS];
  }

  if (supportsGrokReasoningEffort(base)) {
    return [...OPENAI_REASONING_EFFORTS];
  }

  return [];
}

export function modelDefaultReasoningEffort(
  modelId?: string | null,
  provider?: string | null,
): ReasoningEffort {
  const options = modelReasoningEffortOptions(modelId, provider);
  if (options.includes("medium")) return "medium";
  return options.find((option) => option !== "none") || "medium";
}
