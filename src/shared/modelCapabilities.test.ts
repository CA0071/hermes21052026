import { describe, expect, it } from "vitest";
import {
  modelDefaultReasoningEffort,
  modelReasoningEffortOptions,
  modelSupportsFastMode,
  normalizeReasoningEffort,
} from "./modelCapabilities";

describe("modelCapabilities", () => {
  it("keeps fast mode available for supported GPT and Claude models", () => {
    expect(modelSupportsFastMode("openai/gpt-5.5")).toBe(true);
    expect(modelSupportsFastMode("anthropic/claude-opus-4-6")).toBe(true);
    expect(modelSupportsFastMode("openai/gpt-5.1-codex")).toBe(false);
  });

  it("returns OpenAI reasoning efforts for reasoning and Codex models", () => {
    expect(modelReasoningEffortOptions("gpt-5.5", "openai")).toEqual([
      "none",
      "low",
      "medium",
      "high",
    ]);
    expect(
      modelReasoningEffortOptions("openai/gpt-5.1-codex", "openai-codex"),
    ).toEqual(["none", "low", "medium", "high"]);
    expect(modelReasoningEffortOptions("gpt-4o", "openai")).toEqual([]);
  });

  it("returns Claude reasoning efforts with xhigh only for 4.7 models", () => {
    expect(
      modelReasoningEffortOptions("claude-sonnet-4-6", "anthropic"),
    ).toEqual(["none", "minimal", "low", "medium", "high"]);
    expect(modelReasoningEffortOptions("claude-opus-4.7", "anthropic")).toEqual(
      ["none", "minimal", "low", "medium", "high", "xhigh"],
    );
    expect(modelReasoningEffortOptions("claude-3-haiku", "anthropic")).toEqual(
      [],
    );
  });

  it("returns Gemini effort options that match Hermes transport behavior", () => {
    expect(modelReasoningEffortOptions("google/gemini-2.5-pro")).toEqual([
      "none",
      "medium",
    ]);
    expect(modelReasoningEffortOptions("gemini-3-pro")).toEqual([
      "none",
      "low",
      "high",
    ]);
    expect(modelReasoningEffortOptions("gemini-3-flash")).toEqual([
      "none",
      "low",
      "medium",
      "high",
    ]);
  });

  it("keeps Grok effort selection conservative", () => {
    expect(modelReasoningEffortOptions("x-ai/grok-3-mini-fast")).toEqual([
      "none",
      "low",
      "medium",
      "high",
    ]);
    expect(modelReasoningEffortOptions("x-ai/grok-4")).toEqual([]);
  });

  it("normalizes saved effort values and derives a valid model default", () => {
    expect(normalizeReasoningEffort("XHIGH")).toBe("xhigh");
    expect(normalizeReasoningEffort("turbo")).toBe("medium");
    expect(modelDefaultReasoningEffort("gemini-3-pro")).toBe("low");
  });
});
