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

async function configureValidatedDefaultModel(
  input: ModelConfig & { name: string; apiKey?: string },
  deps: {
    validateModel: (config: ModelConfig & { apiKey?: string }) => Promise<ModelValidationResult>;
    addModel: (name: string, provider: string, model: string, baseUrl: string) => Promise<void>;
    setModelConfig: (provider: string, model: string, baseUrl: string, profile?: string) => Promise<void>;
  },
): Promise<void> {
  const result = await deps.validateModel(input);
  if (!result.ok) {
    throw new Error(result.error || "Model validation failed");
  }
  await deps.addModel(input.name, input.provider, input.model, input.baseUrl);
  await deps.setModelConfig(input.provider, input.model, input.baseUrl, "default");
}

describe("validated model configuration", () => {
  it("validates before adding to model library and default profile", async () => {
    const calls: string[] = [];

    await configureValidatedDefaultModel(
      {
        name: "Relay GPT-4o mini",
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
        addModel: async (_name, _provider, model) => {
          calls.push(`add:${model}`);
        },
        setModelConfig: async (_provider, model, _baseUrl, profile) => {
          calls.push(`default:${profile}:${model}`);
        },
      },
    );

    expect(calls).toEqual([
      "validate:gpt-4o-mini",
      "add:gpt-4o-mini",
      "default:default:gpt-4o-mini",
    ]);
  });

  it("does not add or write default profile when validation fails", async () => {
    const calls: string[] = [];

    await expect(
      configureValidatedDefaultModel(
        {
          name: "Broken model",
          provider: "custom",
          model: "wrong-model",
          baseUrl: "https://relay.example/v1",
        },
        {
          validateModel: async () => {
            calls.push("validate");
            return { ok: false, error: "model_not_found" };
          },
          addModel: async () => {
            calls.push("add");
          },
          setModelConfig: async () => {
            calls.push("default");
          },
        },
      ),
    ).rejects.toThrow("model_not_found");

    expect(calls).toEqual(["validate"]);
  });
});
