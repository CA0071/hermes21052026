/**
 * Default models seeded on first install.
 *
 * Contributors: add new models here! They'll be available to all users
 * on fresh install. Format:
 *   { name: "Display Name", provider: "provider-key", model: "model-id", baseUrl: "" }
 *
 * Provider keys: openrouter, anthropic, openai, custom
 * For openrouter models, use the full path (e.g. "anthropic/claude-sonnet-4-20250514")
 * For direct provider models, use the provider's model ID (e.g. "claude-sonnet-4-20250514")
 */

export interface DefaultModel {
  name: string;
  provider: string;
  model: string;
  baseUrl: string;
}

const DEFAULT_MODELS: DefaultModel[] = [
  // ── OpenRouter (200+ models via single API key) ──────────────────────
  {
    name: "Claude Sonnet 4",
    provider: "openrouter",
    model: "anthropic/claude-sonnet-4-20250514",
    baseUrl: "",
  },

  // ── China-friendly OpenAI-compatible APIs ─────────────────────────────
  {
    name: "DeepSeek Chat",
    provider: "custom",
    model: "deepseek-chat",
    baseUrl: "https://api.deepseek.com/v1",
  },
  {
    name: "Qwen Plus (DashScope)",
    provider: "custom",
    model: "qwen-plus",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  },
  {
    name: "Kimi K2 (Moonshot)",
    provider: "custom",
    model: "kimi-k2-0711-preview",
    baseUrl: "https://api.moonshot.cn/v1",
  },
  {
    name: "GLM 4.5 (Zhipu)",
    provider: "custom",
    model: "glm-4.5",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
  },
  {
    name: "MiniMax M1",
    provider: "custom",
    model: "MiniMax-M1",
    baseUrl: "https://api.minimax.chat/v1",
  },

  // ── Anthropic (direct) ───────────────────────────────────────────────
  {
    name: "Claude Sonnet 4",
    provider: "anthropic",
    model: "claude-sonnet-4-20250514",
    baseUrl: "",
  },

  // ── OpenAI (direct) ──────────────────────────────────────────────────
  {
    name: "GPT-4.1",
    provider: "openai",
    model: "gpt-4.1",
    baseUrl: "",
  },

];

export default DEFAULT_MODELS;
