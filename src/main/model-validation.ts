import * as http from "http";
import * as https from "https";
import { readEnv } from "./config";

export interface ModelValidationInput {
  provider: string;
  model: string;
  baseUrl: string;
  apiKey?: string;
  profile?: string;
}

export interface ModelValidationResult {
  ok: boolean;
  error?: string;
  status?: number;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "");
}

function chatCompletionsUrl(baseUrl: string): string {
  const normalized = normalizeBaseUrl(baseUrl);
  if (/\/chat\/completions$/i.test(normalized)) return normalized;
  if (/\/v1$/i.test(normalized)) return `${normalized}/chat/completions`;
  return `${normalized}/v1/chat/completions`;
}

function resolveCustomEnvKey(url: string): string {
  if (!url) return "CUSTOM_API_KEY";
  if (/openrouter\.ai/i.test(url)) return "OPENROUTER_API_KEY";
  if (/anthropic\.com/i.test(url)) return "ANTHROPIC_API_KEY";
  if (/openai\.com/i.test(url)) return "OPENAI_API_KEY";
  if (/huggingface\.co/i.test(url)) return "HF_TOKEN";
  if (/api\.groq\.com/i.test(url)) return "GROQ_API_KEY";
  if (/api\.deepseek\.com/i.test(url)) return "DEEPSEEK_API_KEY";
  if (/api\.together\.xyz/i.test(url)) return "TOGETHER_API_KEY";
  if (/api\.fireworks\.ai/i.test(url)) return "FIREWORKS_API_KEY";
  if (/api\.cerebras\.ai/i.test(url)) return "CEREBRAS_API_KEY";
  if (/api\.mistral\.ai/i.test(url)) return "MISTRAL_API_KEY";
  if (/api\.perplexity\.ai/i.test(url)) return "PERPLEXITY_API_KEY";
  if (/dashscope\.aliyuncs\.com/i.test(url)) return "DASHSCOPE_API_KEY";
  if (/bigmodel\.cn|zhipuai|glm/i.test(url)) return "GLM_API_KEY";
  if (/moonshot\.cn|kimi/i.test(url)) return "KIMI_API_KEY";
  if (/minimax\.chat|minimaxi\.com/i.test(url)) return "MINIMAX_CN_API_KEY";
  return "CUSTOM_API_KEY";
}

function getStoredApiKey(baseUrl: string, profile?: string): string {
  const env = readEnv(profile);
  const preferred = resolveCustomEnvKey(baseUrl);
  return env[preferred] || env.CUSTOM_API_KEY || env.OPENAI_API_KEY || "";
}

function parseProviderError(raw: string, statusCode?: number): string {
  const fallback = statusCode
    ? `Model validation failed with HTTP ${statusCode}`
    : "Model validation failed";
  if (!raw.trim()) return fallback;
  try {
    const parsed = JSON.parse(raw) as {
      error?: { message?: string; code?: string; type?: string } | string;
      message?: string;
    };
    if (typeof parsed.error === "string") return parsed.error;
    if (parsed.error?.message) return parsed.error.message;
    if (parsed.message) return parsed.message;
  } catch {
    // keep fallback below
  }
  return raw.slice(0, 300) || fallback;
}

export function validateModelConnection(
  input: ModelValidationInput,
): Promise<ModelValidationResult> {
  const model = input.model.trim();
  const baseUrl = input.baseUrl.trim();
  if (!model) return Promise.resolve({ ok: false, error: "Model is required" });
  if (!baseUrl) return Promise.resolve({ ok: false, error: "Base URL is required" });

  let url: string;
  try {
    url = chatCompletionsUrl(baseUrl);
    // Validate URL early for clear feedback.
    new URL(url);
  } catch {
    return Promise.resolve({ ok: false, error: "Base URL is invalid" });
  }

  const apiKey = (input.apiKey || getStoredApiKey(baseUrl, input.profile)).trim();
  const body = JSON.stringify({
    model,
    messages: [{ role: "user", content: "Reply with OK." }],
    max_tokens: 8,
    temperature: 0,
    stream: false,
  });

  const headers: Record<string, string | number> = {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  return new Promise((resolve) => {
    const requester = url.startsWith("https") ? https.request : http.request;
    const req = requester(
      url,
      {
        method: "POST",
        headers,
        timeout: 20000,
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => {
          raw += chunk.toString();
        });
        res.on("end", () => {
          const status = res.statusCode || 0;
          if (status < 200 || status >= 300) {
            resolve({ ok: false, status, error: parseProviderError(raw, status) });
            return;
          }
          try {
            const parsed = JSON.parse(raw) as {
              choices?: Array<{ message?: { content?: string }; delta?: { content?: string } }>;
              error?: { message?: string } | string;
            };
            if (parsed.error) {
              resolve({ ok: false, status, error: parseProviderError(raw, status) });
              return;
            }
            if (Array.isArray(parsed.choices)) {
              resolve({ ok: true, status });
              return;
            }
            resolve({ ok: false, status, error: "Provider response did not include choices" });
          } catch {
            resolve({ ok: false, status, error: "Provider returned invalid JSON" });
          }
        });
      },
    );

    req.on("timeout", () => {
      req.destroy(new Error("Model validation timed out"));
    });
    req.on("error", (err) => {
      resolve({ ok: false, error: err.message || "Model validation request failed" });
    });
    req.write(body);
    req.end();
  });
}
