import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { join } from "path";
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "fs";

const { TEST_HOME } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require("path");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const os = require("os");
  return {
    TEST_HOME: path.join(os.tmpdir(), `hermes-config-test-${Date.now()}`),
  };
});

vi.mock("../src/main/installer", () => ({
  HERMES_HOME: TEST_HOME,
}));

import { getModelConfig, setModelConfig } from "../src/main/config";

const CONFIG_FILE = join(TEST_HOME, "config.yaml");

beforeEach(() => {
  mkdirSync(TEST_HOME, { recursive: true });
});

afterEach(() => {
  if (existsSync(TEST_HOME)) {
    rmSync(TEST_HOME, { recursive: true, force: true });
  }
});

describe("model config", () => {
  it("creates config.yaml when saving a model provider on a fresh profile", () => {
    setModelConfig("openai-codex", "", "");

    expect(existsSync(CONFIG_FILE)).toBe(true);
    expect(getModelConfig()).toEqual({
      provider: "openai-codex",
      model: "",
      baseUrl: "",
    });
  });

  it("writes the current Hermes model section when config has no model block", () => {
    const profileDir = join(TEST_HOME, "profiles", "mcp-only");
    mkdirSync(profileDir, { recursive: true });
    writeFileSync(
      join(profileDir, "config.yaml"),
      "mcp_servers:\n  pinecone:\n    command: cmd\n",
    );

    setModelConfig("openai-codex", "", "", "mcp-only");

    const content = readFileSync(join(profileDir, "config.yaml"), "utf-8");
    expect(content).toContain(
      'model:\n  default: ""\n  provider: "openai-codex"',
    );
    expect(getModelConfig("mcp-only")).toEqual({
      provider: "openai-codex",
      model: "",
      baseUrl: "",
    });
  });

  it("reads legacy models blocks without treating memory.provider as the model provider", () => {
    const profileDir = join(TEST_HOME, "profiles", "legacy");
    mkdirSync(profileDir, { recursive: true });
    writeFileSync(
      join(profileDir, "config.yaml"),
      "memory:\n  provider: honcho\nmodels:\n  default: gpt-4.1\n  provider: openai\n",
    );

    expect(getModelConfig("legacy")).toEqual({
      provider: "openai",
      model: "gpt-4.1",
      baseUrl: "",
    });
  });
});
