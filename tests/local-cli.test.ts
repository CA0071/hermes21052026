import { describe, expect, it } from "vitest";
import { normalizeLocalCliConfig } from "../src/main/config";
import {
  LOCAL_CLI_PROVIDER,
  buildLocalCliArgs,
  buildLocalCliPrompt,
  normalizeLocalCliCommand,
  normalizeLocalCliModel,
} from "../src/main/local-cli";

describe("local CLI provider", () => {
  it("uses one provider id for local CLI adapters", () => {
    expect(LOCAL_CLI_PROVIDER).toBe("cli");
  });

  it("defaults to the Codex CLI preset", () => {
    expect(normalizeLocalCliConfig()).toEqual({
      preset: "codex",
      command: "codex",
    });
  });

  it("builds safe Codex exec arguments", () => {
    const args = buildLocalCliArgs(
      { preset: "codex" },
      "C:/Temp/hermes-cli/last-message.txt",
      " gpt-5.1-codex ",
    );

    expect(args).toEqual([
      "exec",
      "--skip-git-repo-check",
      "--ephemeral",
      "--sandbox",
      "read-only",
      "--color",
      "never",
      "--output-last-message",
      "C:/Temp/hermes-cli/last-message.txt",
      "-m",
      "gpt-5.1-codex",
      "-",
    ]);
  });

  it("omits blank models for Codex exec", () => {
    const args = buildLocalCliArgs(
      { preset: "codex" },
      "C:/Temp/hermes-cli/last-message.txt",
      "  ",
    );

    expect(args).not.toContain("-m");
  });

  it("treats the Hermes codex placeholder as the Codex CLI default model", () => {
    const args = buildLocalCliArgs(
      { preset: "codex" },
      "C:/Temp/hermes-cli/last-message.txt",
      "codex",
    );

    expect(normalizeLocalCliModel("codex", "codex")).toBeUndefined();
    expect(args).not.toContain("-m");
  });

  it("keeps custom stdin CLI arguments empty", () => {
    expect(
      buildLocalCliArgs(
        { preset: "custom" },
        "C:/Temp/hermes-cli/last-message.txt",
        "ignored-model",
      ),
    ).toEqual([]);
  });

  it("rejects shell fragments in command fields", () => {
    expect(normalizeLocalCliCommand("codex")).toBe("codex");
    expect(normalizeLocalCliCommand('"C:/Tools/codex.exe"')).toBe(
      "C:/Tools/codex.exe",
    );
    expect(normalizeLocalCliCommand("codex && whoami")).toBe("");
    expect(normalizeLocalCliCommand("codex | tee out.txt")).toBe("");
  });

  it("wraps recent chat history into the prompt", () => {
    const prompt = buildLocalCliPrompt("latest", [
      { role: "user", content: "first" },
      { role: "agent", content: "second" },
    ]);

    expect(prompt).toContain("Previous conversation:");
    expect(prompt).toContain("user: first");
    expect(prompt).toContain("assistant: second");
    expect(prompt).toContain("Latest user message:\nlatest");
  });
});
