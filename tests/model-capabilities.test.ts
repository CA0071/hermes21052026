import { describe, expect, it } from "vitest";
import { modelSupportsFastMode } from "../src/shared/modelCapabilities";

describe("model capability detection", () => {
  it("allows OpenAI flagship models", () => {
    expect(modelSupportsFastMode("gpt-5.2")).toBe(true);
    expect(modelSupportsFastMode("openai/o4-mini")).toBe(true);
    expect(modelSupportsFastMode("o3")).toBe(true);
  });

  it("allows Claude models", () => {
    expect(modelSupportsFastMode("claude-opus-4-6")).toBe(true);
    expect(modelSupportsFastMode("anthropic/claude-sonnet-4-5")).toBe(true);
  });

  it("excludes Codex and unrelated models", () => {
    expect(modelSupportsFastMode("gpt-5-codex")).toBe(false);
    expect(modelSupportsFastMode("openai/gpt-5.3-codex")).toBe(false);
    expect(modelSupportsFastMode("llama-3.3-70b")).toBe(false);
    expect(modelSupportsFastMode("")).toBe(false);
  });
});
