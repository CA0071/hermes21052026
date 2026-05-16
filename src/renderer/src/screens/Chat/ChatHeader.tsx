import { memo, useState, useRef, useEffect } from "react";
import { Trash2 as Trash, Plus, Zap, Pencil, Download } from "lucide-react";
import { useI18n } from "../../components/useI18n";
import type { UsageState } from "./types";

interface ChatHeaderProps {
  sessionId: string | null;
  sessionTitle?: string | null;
  usage: UsageState | null;
  fastMode: boolean;
  hasMessages: boolean;
  onToggleFast: () => void;
  onNewChat?: () => void;
  onClear: () => void;
  onRenameSession?: (sessionId: string, newTitle: string) => void;
  onExport?: () => void;
}

function UsageBadge({ usage }: { usage: UsageState }): React.JSX.Element {
  const tooltip =
    `Prompt: ${usage.promptTokens.toLocaleString()} | ` +
    `Completion: ${usage.completionTokens.toLocaleString()}` +
    (usage.cost != null ? ` | Cost: $${usage.cost.toFixed(4)}` : "");

  return (
    <span className="chat-token-counter" title={tooltip}>
      {usage.totalTokens.toLocaleString()} tokens
      {usage.cost != null && (
        <span className="chat-cost"> · ${usage.cost.toFixed(4)}</span>
      )}
    </span>
  );
}

export const ChatHeader = memo(function ChatHeader({
  sessionId,
  sessionTitle,
  usage,
  fastMode,
  hasMessages,
  onToggleFast,
  onNewChat,
  onClear,
  onRenameSession,
  onExport,
}: ChatHeaderProps): React.JSX.Element {
  const { t } = useI18n();
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renaming]);

  function startRename(): void {
    const current = sessionTitle || (sessionId ? t("chat.sessionTitle", { id: sessionId.slice(-6) }) : "");
    setRenameValue(current);
    setRenaming(true);
  }

  function commitRename(): void {
    const trimmed = renameValue.trim();
    if (trimmed && sessionId && onRenameSession) {
      onRenameSession(sessionId, trimmed);
    }
    setRenaming(false);
  }

  function handleRenameKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === "Enter") { e.preventDefault(); commitRename(); }
    if (e.key === "Escape") { e.preventDefault(); setRenaming(false); }
  }

  const displayTitle = sessionTitle
    ? sessionTitle
    : sessionId
    ? t("chat.sessionTitle", { id: sessionId.slice(-6) })
    : t("chat.title");

  return (
    <div className="chat-header">
      <div className="chat-header-left">
        {renaming ? (
          <input
            ref={renameInputRef}
            className="chat-header-rename-input"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={handleRenameKeyDown}
            onBlur={commitRename}
          />
        ) : (
          <div className="chat-header-title-group">
            <div className="chat-header-title">{displayTitle}</div>
            {sessionId && (
              <span className="chat-header-session-id">#{sessionId.slice(-6)}</span>
            )}
            {sessionId && onRenameSession && (
              <button
                className="btn-ghost chat-rename-btn"
                onClick={startRename}
                title="Rename session"
              >
                <Pencil size={13} />
              </button>
            )}
          </div>
        )}
        {usage && !renaming && <UsageBadge usage={usage} />}
      </div>
      <div className="chat-header-actions">
        <div className="chat-fast-wrapper">
          <button
            className={`btn-ghost chat-fast-btn ${fastMode ? "chat-fast-active" : ""}`}
            onClick={onToggleFast}
          >
            <Zap size={14} />
          </button>
          <div className="chat-fast-popover">
            <strong>
              {fastMode ? t("chat.fastModeOn") : t("chat.fastMode")}
            </strong>
            <span>
              {fastMode ? t("chat.fastModeActive") : t("chat.fastModeInactive")}
            </span>
          </div>
        </div>
        {hasMessages && onExport && (
          <button
            className="btn-ghost chat-clear-btn"
            onClick={onExport}
            title="Export as HTML"
          >
            <Download size={16} />
          </button>
        )}
        {onNewChat && (
          <button
            className="btn-ghost chat-clear-btn"
            onClick={onNewChat}
            title={t("chat.newChat")}
          >
            <Plus size={16} />
          </button>
        )}
        {hasMessages && (
          <button
            className="btn-ghost chat-clear-btn"
            onClick={onClear}
            title={t("chat.clearChat")}
          >
            <Trash size={16} />
          </button>
        )}
      </div>
    </div>
  );
});
