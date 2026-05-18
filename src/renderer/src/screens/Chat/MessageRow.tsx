import { memo, useState } from "react";
import icon from "../../assets/icon.png";
import { AgentMarkdown } from "../../components/AgentMarkdown";
import { useI18n } from "../../components/useI18n";
import type { ChatMessage } from "./types";

export const APPROVAL_RE =
  /⚠️.*dangerous|requires? (your )?approval|\/approve.*\/deny|do you want (me )?to (proceed|continue|run|execute)/i;

export const HermesAvatar = memo(function HermesAvatar({
  size = 30,
}: {
  size?: number;
}): React.JSX.Element {
  return (
    <div className="chat-avatar chat-avatar-agent">
      <img src={icon} width={size} height={size} alt="" />
    </div>
  );
});

interface MessageRowProps {
  msg: ChatMessage;
  isLast: boolean;
  isLoading: boolean;
  onApprove: () => void;
  onDeny: () => void;
}

export const MessageRow = memo(function MessageRow({
  msg,
  isLast,
  isLoading,
  onApprove,
  onDeny,
}: MessageRowProps): React.JSX.Element {
  const { t } = useI18n();
  const showApprovalBar =
    msg.role === "agent" &&
    !isLoading &&
    isLast &&
    APPROVAL_RE.test(msg.content);
  const hasReasoning =
    msg.role === "agent" && !!msg.reasoning && msg.reasoning.trim().length > 0;
  // Auto-expand while the model is still streaming reasoning and no
  // visible answer has arrived yet — gives the user immediate feedback
  // that "thinking" is happening. Once content starts, collapse.
  const isStreamingReasoning = hasReasoning && isLast && isLoading && !msg.content;
  const [expanded, setExpanded] = useState(false);
  const open = expanded || isStreamingReasoning;

  return (
    <div className={`chat-message chat-message-${msg.role}`}>
      {msg.role === "user" ? (
        <div className="chat-avatar chat-avatar-user">U</div>
      ) : (
        <HermesAvatar />
      )}
      <div className={`chat-bubble chat-bubble-${msg.role}`}>
        {hasReasoning && (
          <ReasoningBlock
            text={msg.reasoning as string}
            open={open}
            onToggle={() => setExpanded((v) => !v)}
            streaming={isStreamingReasoning}
            t={t}
          />
        )}
        {msg.role === "agent" ? (
          <AgentMarkdown>{msg.content}</AgentMarkdown>
        ) : (
          msg.content
        )}
      </div>
      {showApprovalBar && (
        <div className="chat-approval-bar">
          <button
            className="chat-approval-btn chat-approve"
            onClick={onApprove}
          >
            {t("chat.approve")}
          </button>
          <button className="chat-approval-btn chat-deny" onClick={onDeny}>
            {t("chat.deny")}
          </button>
        </div>
      )}
    </div>
  );
});

/**
 * Collapsible "Thinking…" block that renders chain-of-thought from
 * reasoning models above the main response. Defaults collapsed once the
 * answer starts arriving; auto-expanded while reasoning is still streaming
 * with no visible answer yet, so the user gets immediate feedback that
 * the model is working. Issue #223.
 */
const ReasoningBlock = memo(function ReasoningBlock({
  text,
  open,
  onToggle,
  streaming,
  t,
}: {
  text: string;
  open: boolean;
  onToggle: () => void;
  streaming: boolean;
  t: (key: string) => string;
}): React.JSX.Element {
  return (
    <div
      className={`chat-reasoning${open ? " chat-reasoning-open" : ""}${streaming ? " chat-reasoning-streaming" : ""}`}
      data-testid="chat-reasoning"
    >
      <button
        type="button"
        className="chat-reasoning-toggle"
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className="chat-reasoning-chevron" aria-hidden>
          {open ? "▾" : "▸"}
        </span>
        <span className="chat-reasoning-label">
          {streaming ? t("chat.thinking") : t("chat.reasoning")}
        </span>
      </button>
      {open && (
        <div className="chat-reasoning-body" data-testid="chat-reasoning-body">
          {text}
        </div>
      )}
    </div>
  );
});
