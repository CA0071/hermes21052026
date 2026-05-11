import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  shell: { openExternal: vi.fn() },
}));

import {
  isProviderAuthenticated,
  parseProviderLoginOutput,
} from "../src/main/providerLogin";

describe("provider login output parsing", () => {
  it("extracts OpenAI Codex device login URL and user code", () => {
    const output = `
Signing in to OpenAI Codex...
To continue, follow these steps:

  1. Open this URL in your browser:
     \u001b[94mhttps://auth.openai.com/codex/device\u001b[0m

  2. Enter this code:
     \u001b[94mABCD-EFGH\u001b[0m

Waiting for sign-in... (press Ctrl+C to cancel)
`;

    expect(parseProviderLoginOutput(output)).toEqual({
      verificationUrl: "https://auth.openai.com/codex/device",
      userCode: "ABCD-EFGH",
    });
  });

  it("recognizes explicit provider logged-in status", () => {
    expect(isProviderAuthenticated("openai-codex: logged in")).toBe(true);
  });

  it("does not treat logged-out or negative status as signed in", () => {
    expect(
      isProviderAuthenticated(
        "openai-codex: logged out (No Codex credentials stored.)",
      ),
    ).toBe(false);
    expect(isProviderAuthenticated("Nous Portal   ✗ not logged in")).toBe(
      false,
    );
  });
});
