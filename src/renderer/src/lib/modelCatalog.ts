export interface ResolvedCatalogTarget {
  baseUrl: string;
  apiKey: string;
}

function trimUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

export function resolveCatalogEnvKey(
  provider: string,
  baseUrl: string,
): string | null {
  if (provider === "openrouter") return "OPENROUTER_API_KEY";
  if (provider === "openai") return "OPENAI_API_KEY";
  if (provider === "anthropic") return "ANTHROPIC_API_KEY";
  if (provider === "xai") return "XAI_API_KEY";
  if (provider === "google") return "GOOGLE_API_KEY";
  if (provider === "minimax") return "MINIMAX_API_KEY";

  const url = trimUrl(baseUrl).toLowerCase();
  if (!url) return "CUSTOM_API_KEY";
  if (url.includes("openrouter.ai")) return "OPENROUTER_API_KEY";
  if (url.includes("openai.com")) return "OPENAI_API_KEY";
  if (url.includes("anthropic.com")) return "ANTHROPIC_API_KEY";
  if (url.includes("x.ai")) return "XAI_API_KEY";
  if (url.includes("googleapis.com") || url.includes("google.com")) {
    return "GOOGLE_API_KEY";
  }
  if (url.includes("groq.com")) return "GROQ_API_KEY";
  if (url.includes("deepseek.com")) return "DEEPSEEK_API_KEY";
  if (url.includes("together.xyz")) return "TOGETHER_API_KEY";
  if (url.includes("fireworks.ai")) return "FIREWORKS_API_KEY";
  if (url.includes("cerebras.ai")) return "CEREBRAS_API_KEY";
  if (url.includes("mistral.ai")) return "MISTRAL_API_KEY";
  if (url.includes("perplexity.ai")) return "PERPLEXITY_API_KEY";
  if (url.includes("huggingface.co")) return "HF_TOKEN";
  if (url.includes("minimax")) return "MINIMAX_API_KEY";
  if (url.includes("opencode") && url.includes("zen")) {
    return "OPENCODE_ZEN_API_KEY";
  }
  if (url.includes("opencode")) return "OPENCODE_GO_API_KEY";
  return "CUSTOM_API_KEY";
}

export function resolveCatalogTarget(
  provider: string,
  baseUrl: string,
  env: Record<string, string>,
): ResolvedCatalogTarget | null {
  let resolvedBaseUrl = trimUrl(baseUrl);
  if (!resolvedBaseUrl) {
    if (provider === "openrouter") resolvedBaseUrl = "https://openrouter.ai/api/v1";
    else if (provider === "openai") resolvedBaseUrl = "https://api.openai.com/v1";
  }
  if (!resolvedBaseUrl) return null;

  const envKey = resolveCatalogEnvKey(provider, resolvedBaseUrl);
  return {
    baseUrl: resolvedBaseUrl,
    apiKey: envKey ? env[envKey] || "" : "",
  };
}
