import { describe, expect, it } from "vitest";

interface ModelConfig {
  provider: string;
  model: string;
  baseUrl: string;
}

interface ModelValidationResult {
  ok: boolean;
  error?: string;
}

type TestState = "idle" | "testing" | "ok" | "failed";

async function testModelOnly(
  input: ModelConfig & { apiKey?: string },
  deps: {
    validateModel: (config: ModelConfig & { apiKey?: string }) => Promise<ModelValidationResult>;
  },
): Promise<{ state: TestState; error?: string }> {
  const result = await deps.validateModel(input);
  if (!result.ok) return { state: "failed", error: result.error || "Model validation failed" };
  return { state: "ok" };
}

async function commitValidatedDefaultModel(
  input: ModelConfig & { name: string; apiKey?: string; envKey?: string; testState: TestState },
  deps: {
    setEnv: (key: string, value: string, profile?: string) => Promise<void>;
    addModel: (name: string, provider: string, model: string, baseUrl: string) => Promise<void>;
    setModelConfig: (provider: string, model: string, baseUrl: string, profile?: string) => Promise<void>;
    getModelConfig: (profile?: string) => Promise<ModelConfig>;
  },
): Promise<void> {
  if (input.testState !== "ok") throw new Error("Test model before continuing");
  if (input.apiKey && input.envKey) await deps.setEnv(input.envKey, input.apiKey, "default");
  await deps.addModel(input.name, input.provider, input.model, input.baseUrl);
  await deps.setModelConfig(input.provider, input.model, input.baseUrl, "default");
  const written = await deps.getModelConfig("default");
  if (
    written.provider !== input.provider ||
    written.model !== input.model ||
    written.baseUrl.replace(/\/+$/, "") !== input.baseUrl.replace(/\/+$/, "")
  ) {
    throw new Error("Could not write model to default profile config");
  }
}

describe("validated model configuration", () => {
  it("test model only validates and does not persist anything", async () => {
    const calls: string[] = [];

    const result = await testModelOnly(
      {
        provider: "custom",
        model: "gpt-4o-mini",
        baseUrl: "https://relay.example/v1",
        apiKey: "sk-test",
      },
      {
        validateModel: async (config) => {
          calls.push(`validate:${config.model}`);
          return { ok: true };
        },
      },
    );

    expect(result.state).toBe("ok");
    expect(calls).toEqual(["validate:gpt-4o-mini"]);
  });

  it("continue writes env, model library, and default profile only after Test OK", async () => {
    const calls: string[] = [];

    await commitValidatedDefaultModel(
      {
        name: "Relay GPT-4o mini",
        provider: "custom",
        model: "gpt-4o-mini",
        baseUrl: "https://relay.example/v1",
        apiKey: "sk-test",
        envKey: "OPENAI_API_KEY",
        testState: "ok",
      },
      {
        setEnv: async (key, _value, profile) => {
          calls.push(`env:${profile}:${key}`);
        },
        addModel: async (_name, _provider, model) => {
          calls.push(`add:${model}`);
        },
        setModelConfig: async (_provider, model, _baseUrl, profile) => {
          calls.push(`default:${profile}:${model}`);
        },
        getModelConfig: async () => ({
          provider: "custom",
          model: "gpt-4o-mini",
          baseUrl: "https://relay.example/v1",
        }),
      },
    );

    expect(calls).toEqual([
      "env:default:OPENAI_API_KEY",
      "add:gpt-4o-mini",
      "default:default:gpt-4o-mini",
    ]);
  });

  it("continue is blocked until Test OK", async () => {
    const calls: string[] = [];

    await expect(
      commitValidatedDefaultModel(
        {
          name: "Broken model",
          provider: "custom",
          model: "wrong-model",
          baseUrl: "https://relay.example/v1",
          testState: "idle",
        },
        {
          setEnv: async () => calls.push("env"),
          addModel: async () => calls.push("add"),
          setModelConfig: async () => calls.push("default"),
          getModelConfig: async () => ({ provider: "auto", model: "", baseUrl: "" }),
        },
      ),
    ).rejects.toThrow("Test model before continuing");

    expect(calls).toEqual([]);
  });

  it("continue fails loudly if the default profile cannot be read back", async () => {
    await expect(
      commitValidatedDefaultModel(
        {
          name: "Relay model",
          provider: "custom",
          model: "gpt-4o-mini",
          baseUrl: "https://relay.example/v1",
          testState: "ok",
        },
        {
          setEnv: async () => {},
          addModel: async () => {},
          setModelConfig: async () => {},
          getModelConfig: async () => ({ provider: "auto", model: "", baseUrl: "" }),
        },
      ),
    ).rejects.toThrow("Could not write model to default profile config");
  });

});
