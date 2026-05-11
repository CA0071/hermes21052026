import { describe, expect, it } from "vitest";
import {
  createHermesReadinessSnapshot,
  type ReadinessSource,
} from "./readiness";

const t = (key: string): string => key;

const readyInstall = {
  installed: true,
  configured: true,
  hasApiKey: true,
  verified: true,
};

function source(overrides: Partial<ReadinessSource> = {}): ReadinessSource {
  return {
    profile: "default",
    installStatus: readyInstall,
    modelConfig: {
      provider: "openrouter",
      model: "anthropic/claude-opus-4.6",
      baseUrl: "",
    },
    profiles: [],
    env: {
      OPENROUTER_API_KEY: "sk-test",
    },
    credentialPool: {},
    providerAuth: {},
    gatewayRunning: false,
    connMode: "local",
    connRemoteUrl: "",
    hermesVersion: "Hermes Agent v0.11.0 (2026.4.23)",
    ...overrides,
  };
}

describe("Hermes readiness snapshot", () => {
  it("reports ready when install and provider setup are available", () => {
    const snapshot = createHermesReadinessSnapshot(source(), t);

    expect(snapshot.ready).toBe(true);
    expect(snapshot.chatIssue).toBeNull();
    expect(snapshot.currentProvider).toBe("openrouter");
  });

  it("blocks chat when OpenAI Codex is selected but signed out", () => {
    const snapshot = createHermesReadinessSnapshot(
      source({
        installStatus: {
          installed: true,
          configured: true,
          hasApiKey: false,
          verified: true,
        },
        modelConfig: {
          provider: "openai-codex",
          model: "",
          baseUrl: "",
        },
        providerAuth: {
          "openai-codex": {
            authenticated: false,
            detail: "not signed in",
          },
        },
      }),
      t,
    );

    expect(snapshot.ready).toBe(false);
    expect(snapshot.chatIssue?.id).toBe("provider-signin");
    expect(snapshot.chatIssue?.target).toBe("providers");
  });

  it("routes remote mode without a URL back to Settings", () => {
    const snapshot = createHermesReadinessSnapshot(
      source({
        connMode: "remote",
        connRemoteUrl: "",
      }),
      t,
    );

    expect(snapshot.ready).toBe(false);
    expect(snapshot.chatIssue?.id).toBe("remote-url");
    expect(snapshot.chatIssue?.target).toBe("settings");
  });

  it("tolerates sparse persisted config values", () => {
    const snapshot = createHermesReadinessSnapshot(
      source({
        env: {
          OPENROUTER_API_KEY: undefined,
        } as unknown as ReadinessSource["env"],
        credentialPool: {
          openrouter: [
            {
              key: undefined,
              label: "empty",
            },
          ],
        } as unknown as ReadinessSource["credentialPool"],
        connMode: "remote",
        connRemoteUrl: undefined as unknown as string,
      }),
      t,
    );

    expect(snapshot.ready).toBe(false);
    expect(snapshot.chatIssue?.id).toBe("remote-url");
  });

  it("requires provider-specific credentials for known API key providers", () => {
    const snapshot = createHermesReadinessSnapshot(
      source({
        installStatus: {
          installed: true,
          configured: true,
          hasApiKey: true,
          verified: true,
        },
        env: {
          ANTHROPIC_API_KEY: "sk-ant-test",
        },
        modelConfig: {
          provider: "openrouter",
          model: "openai/gpt-4.1",
          baseUrl: "",
        },
      }),
      t,
    );

    expect(snapshot.ready).toBe(false);
    expect(snapshot.chatIssue?.id).toBe("provider-setup");
  });

  it("does not treat generic install credentials as auto provider readiness", () => {
    const snapshot = createHermesReadinessSnapshot(
      source({
        installStatus: {
          installed: true,
          configured: true,
          hasApiKey: true,
          verified: true,
        },
        env: {},
        modelConfig: {
          provider: "openrouter",
          model: "openai/gpt-4.1",
          baseUrl: "",
        },
      }),
      t,
    );

    expect(snapshot.ready).toBe(false);
    expect(snapshot.chatIssue?.id).toBe("provider-setup");
  });

  it("allows selected included providers without API keys", () => {
    const snapshot = createHermesReadinessSnapshot(
      source({
        env: {},
        modelConfig: {
          provider: "nous",
          model: "",
          baseUrl: "",
        },
      }),
      t,
    );

    expect(snapshot.ready).toBe(true);
    expect(snapshot.chatIssue).toBeNull();
  });

  it("requires a base URL for custom providers", () => {
    const snapshot = createHermesReadinessSnapshot(
      source({
        env: {},
        modelConfig: {
          provider: "custom",
          model: "",
          baseUrl: "",
        },
      }),
      t,
    );

    expect(snapshot.ready).toBe(false);
    expect(snapshot.chatIssue?.id).toBe("provider-setup");
  });
});
