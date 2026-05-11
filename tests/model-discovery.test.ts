import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  shell: { openExternal: vi.fn() },
}));

import {
  detectActiveModelProviders,
  parseModelsDevCatalog,
} from "../src/main/modelDiscovery";

describe("model discovery", () => {
  it("detects active providers from env, credential pool, oauth, and config", () => {
    const active = detectActiveModelProviders({
      env: {
        OPENAI_API_KEY: "sk-test",
        GOOGLE_API_KEY: "AIza-test",
      },
      credentialPool: {
        anthropic: [{ key: "sk-ant-test", label: "Team key" }],
      },
      authenticatedProviders: ["openai-codex"],
      modelProvider: "custom",
      modelBaseUrl: "http://localhost:1234/v1",
    });

    expect(active).toEqual(
      expect.arrayContaining([
        "openai",
        "google",
        "anthropic",
        "openai-codex",
        "custom",
      ]),
    );
  });

  it("turns models.dev provider data into visible model choices", () => {
    const models = parseModelsDevCatalog("openai", {
      api: "https://api.openai.com/v1",
      models: {
        "gpt-5.1": {
          name: "GPT-5.1",
          modalities: { output: ["text"] },
        },
        "text-embedding-3-large": {
          name: "Embedding",
          modalities: { output: ["embedding"] },
        },
        "gpt-image-1": {
          name: "Image",
          modalities: { output: ["image"] },
        },
      },
    });

    expect(models).toEqual([
      {
        provider: "openai",
        model: "gpt-5.1",
        name: "GPT-5.1",
        baseUrl: "https://api.openai.com/v1",
        source: "models.dev",
      },
    ]);
  });
});
