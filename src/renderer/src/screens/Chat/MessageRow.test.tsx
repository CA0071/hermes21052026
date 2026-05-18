import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { I18nProvider } from "../../components/I18nProvider";
import { MessageRow } from "./MessageRow";
import type { ChatMessage } from "./types";

// Regression tests for issue #223: reasoning_content from thinking-mode
// models is now plumbed through the renderer and displayed in a
// collapsible block above the main response.

beforeEach(() => {
  (window as unknown as { hermesAPI: unknown }).hermesAPI = {
    getLocale: vi.fn().mockResolvedValue("en"),
    setLocale: vi.fn().mockResolvedValue("en"),
  };
});

function renderRow(
  msg: ChatMessage,
  overrides: Partial<{
    isLast: boolean;
    isLoading: boolean;
    onApprove: () => void;
    onDeny: () => void;
  }> = {},
): void {
  return void render(
    <I18nProvider>
      <MessageRow
        msg={msg}
        isLast={overrides.isLast ?? true}
        isLoading={overrides.isLoading ?? false}
        onApprove={overrides.onApprove ?? (() => {})}
        onDeny={overrides.onDeny ?? (() => {})}
      />
    </I18nProvider>,
  );
}

describe("MessageRow — reasoning display (issue #223)", () => {
  it("doesn't render a reasoning block when the message has no reasoning", async () => {
    await act(async () => {
      renderRow({
        id: "m1",
        role: "agent",
        content: "Just a normal reply.",
      });
    });
    expect(screen.queryByTestId("chat-reasoning")).toBeNull();
  });

  it("doesn't render a reasoning block for user messages even if a field is present", async () => {
    await act(async () => {
      renderRow({
        id: "u1",
        role: "user",
        content: "hi",
        // Defensive — reasoning is only meaningful for agent replies; the
        // UI should treat it as not-present on user rows.
        reasoning: "this should be ignored",
      });
    });
    expect(screen.queryByTestId("chat-reasoning")).toBeNull();
  });

  it("renders a collapsed reasoning block by default once the answer has arrived", async () => {
    await act(async () => {
      renderRow({
        id: "a1",
        role: "agent",
        content: "The answer is 42.",
        reasoning: "Step 1. Consider 41. Step 2. Add one. Therefore: 42.",
      });
    });

    expect(screen.getByTestId("chat-reasoning")).toBeInTheDocument();
    // Toggle button visible with the collapsed label ("Reasoning").
    const toggle = screen.getByRole("button", { name: /reasoning/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    // Body is NOT rendered while collapsed.
    expect(screen.queryByTestId("chat-reasoning-body")).toBeNull();
  });

  it("expands the reasoning block when the user clicks the toggle", async () => {
    await act(async () => {
      renderRow({
        id: "a2",
        role: "agent",
        content: "Final answer.",
        reasoning: "Internal monologue here.",
      });
    });

    const toggle = screen.getByRole("button", { name: /reasoning/i });
    await act(async () => {
      fireEvent.click(toggle);
    });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("chat-reasoning-body")).toHaveTextContent(
      "Internal monologue here.",
    );
  });

  it("auto-expands the reasoning while still streaming with no answer yet (Thinking… label)", async () => {
    // Simulate the in-flight state: isLast + isLoading and content is
    // still empty but reasoning has started arriving. The block should
    // be visible without the user clicking, and labelled "Thinking…".
    await act(async () => {
      renderRow(
        {
          id: "a3",
          role: "agent",
          content: "",
          reasoning: "Considering the problem…",
        },
        { isLast: true, isLoading: true },
      );
    });

    expect(screen.getByTestId("chat-reasoning")).toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: /thinking/i });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("chat-reasoning-body")).toHaveTextContent(
      "Considering the problem…",
    );
  });

  it("flips to collapsed-by-default once the answer starts arriving", async () => {
    // Same in-flight scenario but content has now started — the block
    // should switch to the "Reasoning" label and collapse by default
    // (the user can still click to re-expand).
    await act(async () => {
      renderRow(
        {
          id: "a4",
          role: "agent",
          content: "Th",
          reasoning: "Considering the problem…",
        },
        { isLast: true, isLoading: true },
      );
    });

    const toggle = screen.getByRole("button", { name: /reasoning/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("chat-reasoning-body")).toBeNull();
  });

  it("treats whitespace-only reasoning as no reasoning", async () => {
    await act(async () => {
      renderRow({
        id: "a5",
        role: "agent",
        content: "Hi.",
        reasoning: "   \n   \n   ",
      });
    });
    expect(screen.queryByTestId("chat-reasoning")).toBeNull();
  });
});
