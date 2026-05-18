export interface ChatMessage {
  id: string;
  role: "user" | "agent";
  content: string;
  /**
   * Chain-of-thought / "thinking" content from reasoning models, accumulated
   * via the `chat-reasoning` IPC channel. Surfaced in the chat bubble as a
   * collapsible block above the main response. Issue #223.
   */
  reasoning?: string;
}

export interface ModelGroup {
  provider: string;
  providerLabel: string;
  models: {
    provider: string;
    model: string;
    label: string;
    baseUrl: string;
  }[];
}

export interface UsageState {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost?: number;
}
