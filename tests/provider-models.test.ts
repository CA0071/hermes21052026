import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchAvailableModels } from "../src/main/provider-models";
import {
  resolveCatalogEnvKey,
  resolveCatalogTarget,
} from "../src/renderer/src/lib/modelCatalog";

describe("fetchAvailableModels", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads and normalizes an OpenAI-compatible /models response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            { id: "z-model" },
            { id: "a-model" },
            { id: "a-model" },
            { id: "folder/b-model" },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const models = await fetchAvailableModels("https://example.com/v1/", "sk-test");

    expect(fetchMock).toHaveBeenCalledWith("https://example.com/v1/models", {
      headers: {
        Accept: "application/json",
        Authorization: "Bearer sk-test",
      },
    });
    expect(models).toEqual([
      { id: "a-model", name: "a-model" },
      { id: "folder/b-model", name: "b-model" },
      { id: "z-model", name: "z-model" },
    ]);
  });
});

describe("model catalog target resolution", () => {
  it("maps known custom endpoints to the matching environment variable", () => {
    expect(resolveCatalogEnvKey("custom", "https://api.opencode.ai/v1")).toBe(
      "OPENCODE_GO_API_KEY",
    );
    expect(resolveCatalogEnvKey("custom", "https://openrouter.ai/api/v1")).toBe(
      "OPENROUTER_API_KEY",
    );
  });

  it("fills default base URLs for supported providers", () => {
    expect(resolveCatalogTarget("openrouter", "", { OPENROUTER_API_KEY: "x" })).toEqual({
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "x",
    });
    expect(resolveCatalogTarget("openai", "", { OPENAI_API_KEY: "y" })).toEqual({
      baseUrl: "https://api.openai.com/v1",
      apiKey: "y",
    });
  });
});
