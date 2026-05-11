import { describe, expect, it } from "vitest";
import {
  createProviderModelStatusItems,
  readyProviderStatuses,
  selectedProviderStatus,
} from "./providerModelStatus";

function items(
  overrides: Partial<Parameters<typeof createProviderModelStatusItems>[0]> = {},
): ReturnType<typeof createProviderModelStatusItems> {
  return createProviderModelStatusItems({
    modelConfig: {
      provider: "openrouter",
      model: "anthropic/claude-opus-4.6",
      baseUrl: "",
    },
    env: {},
    credentialPool: {},
    providerAuth: {},
    ...overrides,
  });
}

describe("provider model status", () => {
  it("marks API-key providers ready from env", () => {
    const status = selectedProviderStatus(
      items({
        env: {
          OPENROUTER_API_KEY: "sk-test",
        },
      }),
    );

    expect(status?.provider).toBe("openrouter");
    expect(status?.ready).toBe(true);
    expect(status?.source).toBe("api-key");
    expect(status?.model).toBe("anthropic/claude-opus-4.6");
  });

  it("marks providers ready from credential pools", () => {
    const status = selectedProviderStatus(
      items({
        credentialPool: {
          openrouter: [{ key: "sk-pool", label: "Pool" }],
        },
      }),
    );

    expect(status?.ready).toBe(true);
    expect(status?.source).toBe("credential-pool");
  });

  it("marks browser auth providers ready from auth status", () => {
    const status = selectedProviderStatus(
      items({
        modelConfig: {
          provider: "openai-codex",
          model: "gpt-5.5",
          baseUrl: "",
        },
        providerAuth: {
          "openai-codex": {
            authenticated: true,
            detail: "signed in",
          },
        },
      }),
    );

    expect(status?.provider).toBe("openai-codex");
    expect(status?.ready).toBe(true);
    expect(status?.source).toBe("browser-auth");
  });

  it("uses configured providers as active when provider is auto", () => {
    const statusItems = items({
      modelConfig: {
        provider: "auto",
        model: "",
        baseUrl: "",
      },
      env: {
        ANTHROPIC_API_KEY: "sk-ant",
      },
    });

    expect(selectedProviderStatus(statusItems)?.provider).toBe("auto");
    expect(selectedProviderStatus(statusItems)?.ready).toBe(true);
    expect(
      readyProviderStatuses(statusItems).map((item) => item.provider),
    ).toContain("anthropic");
  });

  it("does not mark inactive no-key providers ready by default", () => {
    const statusItems = items({
      modelConfig: {
        provider: "auto",
        model: "",
        baseUrl: "",
      },
    });

    expect(selectedProviderStatus(statusItems)?.provider).toBe("auto");
    expect(selectedProviderStatus(statusItems)?.ready).toBe(false);
    expect(readyProviderStatuses(statusItems)).toEqual([]);
  });

  it("marks selected included providers ready", () => {
    const status = selectedProviderStatus(
      items({
        modelConfig: {
          provider: "nous",
          model: "",
          baseUrl: "",
        },
      }),
    );

    expect(status?.provider).toBe("nous");
    expect(status?.ready).toBe(true);
    expect(status?.source).toBe("included");
  });

  it("requires a base URL for custom providers", () => {
    const missing = selectedProviderStatus(
      items({
        modelConfig: {
          provider: "custom",
          model: "",
          baseUrl: "",
        },
      }),
    );
    const configured = selectedProviderStatus(
      items({
        modelConfig: {
          provider: "custom",
          model: "",
          baseUrl: "http://localhost:1234/v1",
        },
      }),
    );

    expect(missing?.ready).toBe(false);
    expect(missing?.source).toBe("missing");
    expect(configured?.ready).toBe(true);
    expect(configured?.source).toBe("custom");
  });

  it("tolerates sparse persisted values", () => {
    const status = selectedProviderStatus(
      items({
        env: {
          OPENROUTER_API_KEY: undefined,
        } as unknown as Record<string, string>,
        credentialPool: {
          openrouter: [{ key: undefined, label: "Empty" }],
        } as unknown as Parameters<
          typeof createProviderModelStatusItems
        >[0]["credentialPool"],
      }),
    );

    expect(status?.ready).toBe(false);
    expect(status?.source).toBe("missing");
  });
});
