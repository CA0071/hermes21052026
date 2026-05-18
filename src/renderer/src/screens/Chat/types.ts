export interface Attachment {
  /** Unique id for React keys */
  id: string;
  /** Original filename */
  name: string;
  /** MIME type, e.g. "image/png", "application/pdf" */
  mimeType: string;
  /** Base64-encoded file contents (no data-URI prefix) */
  data: string;
  /** Pre-built data-URI for display (includes "data:<mime>;base64,") */
  dataUrl: string;
  /** True if mimeType starts with "image/" */
  isImage: boolean;
}

export interface ChatMessage {
  id: string;
  role: "user" | "agent";
  content: string;
  /** Attachments shown alongside this user message */
  attachments?: Attachment[];
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
