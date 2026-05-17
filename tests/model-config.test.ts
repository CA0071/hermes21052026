import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

let testHome: string;

async function loadConfigModule(): Promise<typeof import("../src/main/config")> {
  vi.resetModules();
  vi.doMock("../src/main/installer", () => ({ HERMES_HOME: testHome }));
  vi.doMock("../src/main/hermes", () => ({
    getApiUrl: () => "http://127.0.0.1:8642",
    getRemoteAuthHeader: () => ({}),
    isGatewayRunning: () => false,
  }));
  return await import("../src/main/config");
}

describe("model config persistence", () => {
  beforeEach(() => {
    testHome = mkdtempSync(join(tmpdir(), "hermes-model-config-"));
  });

  afterEach(() => {
    vi.doUnmock("../src/main/installer");
    vi.doUnmock("../src/main/hermes");
    rmSync(testHome, { recursive: true, force: true });
  });

  it("creates config.yaml when saving the first model config", async () => {
    const { getModelConfig, setModelConfig } = await loadConfigModule();

    await setModelConfig("openai", "gpt-4o-mini", "https://api.openai.com/v1");

    const configPath = join(testHome, "config.yaml");
    expect(existsSync(configPath)).toBe(true);
    expect(readFileSync(configPath, "utf-8")).toContain("model:");
    expect(getModelConfig()).toEqual({
      provider: "openai",
      model: "gpt-4o-mini",
      baseUrl: "https://api.openai.com/v1",
    });
  });

  it("only reads and updates values inside the model section", async () => {
    const { getModelConfig, setModelConfig } = await loadConfigModule();
    const configPath = join(testHome, "config.yaml");

    await setModelConfig("anthropic", "claude-sonnet-4-5", "");
    expect(getModelConfig()).toEqual({
      provider: "anthropic",
      model: "claude-sonnet-4-5",
      baseUrl: "",
    });

    const content = readFileSync(configPath, "utf-8");
    expect(content).toContain('provider: "anthropic"');
    expect(content).toContain('default: "claude-sonnet-4-5"');
  });

  it("preserves an existing default model when provider changes with an empty model", async () => {
    const { getModelConfig, setModelConfig } = await loadConfigModule();
    const configPath = join(testHome, "config.yaml");

    writeFileSync(
      configPath,
      [
        "model:",
        '  provider: "gemini"',
        '  default: "gemini-2.5-flash"',
        "",
      ].join("\n"),
      "utf-8",
    );

    await setModelConfig("google", "", "");

    expect(getModelConfig()).toEqual({
      provider: "google",
      model: "gemini-2.5-flash",
      baseUrl: "",
    });

    const content = readFileSync(configPath, "utf-8");
    expect(content).toContain('provider: "google"');
    expect(content).toContain('default: "gemini-2.5-flash"');
  });

  it("still persists provider and model to config when gateway api update succeeds", async () => {
    vi.resetModules();
    vi.doMock("../src/main/installer", () => ({ HERMES_HOME: testHome }));
    vi.doMock("../src/main/hermes", () => ({
      getApiUrl: () => "http://127.0.0.1:8642",
      getRemoteAuthHeader: () => ({}),
      isGatewayRunning: () => true,
    }));

    const { getModelConfig, setModelConfig } = await import("../src/main/config");

    await setModelConfig("google", "gemini-2.5-flash", "");

    expect(getModelConfig()).toEqual({
      provider: "google",
      model: "gemini-2.5-flash",
      baseUrl: "",
    });

    const content = readFileSync(join(testHome, "config.yaml"), "utf-8");
    expect(content).toContain('provider: "google"');
    expect(content).toContain('default: "gemini-2.5-flash"');
  });
});
