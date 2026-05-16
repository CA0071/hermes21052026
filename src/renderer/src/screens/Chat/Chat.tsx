import { useCallback, useEffect, useRef, useState } from "react";
import { ChatInput, type ChatInputHandle } from "./ChatInput";
import { ChatHeader } from "./ChatHeader";
import { ChatEmptyState } from "./ChatEmptyState";
import { MessageList } from "./MessageList";
import { ModelPicker } from "./ModelPicker";
import { useChatScroll } from "./hooks/useChatScroll";
import { useChatIPC } from "./hooks/useChatIPC";
import { useChatActions } from "./hooks/useChatActions";
import { useModelConfig } from "./hooks/useModelConfig";
import { useFastMode } from "./hooks/useFastMode";
import { useLocalCommands } from "./hooks/useLocalCommands";
import { exportConversationAsHtml } from "./exportConversation";
import type { ChatMessage, UsageState } from "./types";

export type { ChatMessage } from "./types";

interface ChatProps {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  sessionId: string | null;
  sessionTitle?: string | null;
  profile?: string;
  onSessionStarted?: () => void;
  onNewChat?: () => void;
  onRenameSession?: (sessionId: string, newTitle: string) => void;
}

function Chat({
  messages,
  setMessages,
  sessionId,
  sessionTitle,
  profile,
  onSessionStarted,
  onNewChat,
  onRenameSession,
}: ChatProps): React.JSX.Element {
  const [isLoading, setIsLoading] = useState(false);
  const [hermesSessionId, setHermesSessionId] = useState<string | null>(null);
  const [toolProgress, setToolProgress] = useState<string | null>(null);
  const [usage, setUsage] = useState<UsageState | null>(null);
  const chatInputRef = useRef<ChatInputHandle>(null);

  const { containerRef, bottomRef } = useChatScroll(messages);
  const modelConfig = useModelConfig(profile);
  const {
    fastMode,
    toggle: toggleFastMode,
    set: setFastTier,
  } = useFastMode(profile);

  useChatIPC({
    setMessages,
    setHermesSessionId,
    setToolProgress,
    setIsLoading,
    setUsage,
  });

  // Reset hermes session when the parent clears messages (new chat).
  // Effect-driven sync because `messages` is owned by the parent; a key-based
  // remount would discard unrelated local state (model picker, etc.).
  useEffect(() => {
    if (messages.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHermesSessionId(null);
    }
  }, [messages]);

  // Cmd/Ctrl+N → new chat
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if ((e.metaKey || e.ctrlKey) && e.key === "n") {
        e.preventDefault();
        onNewChat?.();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onNewChat]);

  const addAgentMessage = useCallback(
    (content: string) => {
      setMessages((prev) => [
        ...prev,
        { id: `agent-local-${Date.now()}`, role: "agent", content },
      ]);
    },
    [setMessages],
  );

  const handleClear = useCallback(() => {
    if (isLoading) {
      window.hermesAPI.abortChat();
      setIsLoading(false);
    }
    setMessages([]);
    setHermesSessionId(null);
    setUsage(null);
    setToolProgress(null);
  }, [isLoading, setMessages]);

  /**
   * Fork: take all messages before msgIndex as history, send the (possibly
   * edited) prompt as a fresh message in a brand-new session.  Session 1
   * stays untouched in the DB; this creates Session 2.
   */
  const handleFork = useCallback(
    (msgIndex: number, editedText: string) => {
      if (isLoading) return;
      const historyMessages = messages.slice(0, msgIndex);
      const forkedMsg: ChatMessage = {
        id: `fork-${Date.now()}`,
        role: "user",
        content: editedText,
      };
      setHermesSessionId(null);
      setMessages([...historyMessages, forkedMsg]);
      setIsLoading(true);
      setUsage(null);
      setToolProgress(null);
      onSessionStarted?.();
      // Pass a brand-new UUID so hermes receives an unknown session_id
      // and is forced to create a new DB entry instead of appending to
      // the current session (which happens when session_id is omitted).
      const forkSessionId = crypto.randomUUID();
      window.hermesAPI
        .sendMessage(
          editedText,
          profile,
          forkSessionId,
          historyMessages.map((m) => ({ role: m.role, content: m.content })),
          undefined,
        )
        .catch(() => {});
    },
    [isLoading, messages, profile, onSessionStarted, setMessages],
  );

  const localCommands = useLocalCommands({
    profile,
    usage,
    setFastMode: setFastTier,
    onNewChat,
    onClear: handleClear,
    addAgentMessage,
  });

  const actions = useChatActions({
    profile,
    hermesSessionId,
    messages,
    isLoading,
    setIsLoading,
    setMessages,
    onSessionStarted,
    chatInputRef,
    localCommands,
  });

  const handleSuggestion = useCallback((text: string) => {
    chatInputRef.current?.setText(text);
  }, []);

  return (
    <div className="chat-container">
      <ChatHeader
        sessionId={sessionId}
        sessionTitle={sessionTitle}
        usage={usage}
        fastMode={fastMode}
        hasMessages={messages.length > 0}
        onToggleFast={toggleFastMode}
        onNewChat={onNewChat}
        onClear={handleClear}
        onRenameSession={onRenameSession}
        onExport={() => exportConversationAsHtml(messages, sessionId, sessionTitle ?? null)}
      />

      <div className="chat-messages" ref={containerRef}>
        {messages.length === 0 ? (
          <ChatEmptyState onSelectSuggestion={handleSuggestion} />
        ) : (
          <MessageList
            messages={messages}
            isLoading={isLoading}
            toolProgress={toolProgress}
            onApprove={actions.handleApprove}
            onDeny={actions.handleDeny}
            onFork={handleFork}
          />
        )}
        <div ref={bottomRef} />
      </div>

      <div className="chat-input-area">
        <ChatInput
          ref={chatInputRef}
          isLoading={isLoading}
          hasSession={!!hermesSessionId}
          onSubmit={actions.handleSend}
          onQuickAsk={actions.handleQuickAsk}
          onAbort={actions.handleAbort}
        />
        <ModelPicker
          currentModel={modelConfig.currentModel}
          currentProvider={modelConfig.currentProvider}
          currentBaseUrl={modelConfig.currentBaseUrl}
          modelGroups={modelConfig.modelGroups}
          displayModel={modelConfig.displayModel}
          onOpen={modelConfig.reload}
          onSelectModel={modelConfig.selectModel}
        />
      </div>
    </div>
  );
}

export default Chat;
