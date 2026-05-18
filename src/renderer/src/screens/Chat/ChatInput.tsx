import {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";
import { Send, Square as Stop, Slash, Paperclip, X, FileText } from "lucide-react";
import { isImeComposing } from "./keyboard";
import { useI18n } from "../../components/useI18n";
import { SLASH_COMMANDS, type SlashCommand } from "./slashCommands";
import { useInputHistory } from "./hooks/useInputHistory";
import type { Attachment } from "./types";

export interface ChatInputHandle {
  setText(text: string): void;
  clear(): void;
  focus(): void;
}

interface ChatInputProps {
  isLoading: boolean;
  hasSession: boolean;
  onSubmit: (text: string, attachments?: Attachment[]) => void;
  onQuickAsk: (text: string) => void;
  onAbort: () => void;
}

/** Read a File as base64, returning an Attachment */
function readFileAsAttachment(file: File): Promise<Attachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(",")[1];
      resolve({
        id: `att-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        data: base64,
        dataUrl,
        isImage: file.type.startsWith("image/"),
      });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(
  function ChatInput(
    { isLoading, hasSession, onSubmit, onQuickAsk, onAbort },
    ref,
  ): React.JSX.Element {
    const { t } = useI18n();
    const [input, setInput] = useState("");
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const [slashMenuOpen, setSlashMenuOpen] = useState(false);
    const [slashFilter, setSlashFilter] = useState("");
    const [slashSelectedIndex, setSlashSelectedIndex] = useState(0);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const slashMenuRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const autoResize = useCallback((): void => {
      const el = inputRef.current;
      if (!el) return;
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    }, []);

    const applyHistoryText = useCallback(
      (text: string): void => {
        setInput(text);
        requestAnimationFrame(() => {
          autoResize();
          inputRef.current?.setSelectionRange(text.length, text.length);
        });
      },
      [autoResize],
    );

    const history = useInputHistory({
      currentInput: input,
      applyText: applyHistoryText,
    });

    useImperativeHandle(
      ref,
      () => ({
        setText(text: string): void {
          setInput(text);
          requestAnimationFrame(() => {
            autoResize();
            if (inputRef.current) {
              inputRef.current.setSelectionRange(text.length, text.length);
              inputRef.current.focus();
            }
          });
        },
        clear(): void {
          setInput("");
          setAttachments([]);
          if (inputRef.current) inputRef.current.style.height = "auto";
        },
        focus(): void {
          inputRef.current?.focus();
        },
      }),
      [autoResize],
    );

    // Refocus the textarea when a streaming response ends
    useEffect(() => {
      if (!isLoading) inputRef.current?.focus();
    }, [isLoading]);

    // Close slash menu on click outside
    useEffect(() => {
      if (!slashMenuOpen) return;
      function handleClickOutside(e: MouseEvent): void {
        if (
          slashMenuRef.current &&
          !slashMenuRef.current.contains(e.target as Node)
        ) {
          setSlashMenuOpen(false);
        }
      }
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }, [slashMenuOpen]);

    // Scroll active slash menu item into view
    useEffect(() => {
      if (!slashMenuOpen) return;
      const active = slashMenuRef.current?.querySelector(
        ".slash-menu-item-active",
      );
      active?.scrollIntoView({ block: "nearest" });
    }, [slashSelectedIndex, slashMenuOpen]);

    // Paste handler — pick up images pasted from clipboard
    useEffect(() => {
      async function handlePaste(e: ClipboardEvent): Promise<void> {
        const items = Array.from(e.clipboardData?.items ?? []);
        const fileItems = items.filter((i) => i.kind === "file");
        if (fileItems.length === 0) return;
        const files = fileItems.map((i) => i.getAsFile()).filter(Boolean) as File[];
        const newAtts = await Promise.all(files.map(readFileAsAttachment));
        setAttachments((prev) => [...prev, ...newAtts]);
      }
      document.addEventListener("paste", handlePaste);
      return () => document.removeEventListener("paste", handlePaste);
    }, []);

    // Drag-and-drop onto the whole input area
    function handleDragOver(e: React.DragEvent): void {
      e.preventDefault();
    }
    async function handleDrop(e: React.DragEvent): Promise<void> {
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files);
      if (files.length === 0) return;
      const newAtts = await Promise.all(files.map(readFileAsAttachment));
      setAttachments((prev) => [...prev, ...newAtts]);
    }

    const filteredSlashCommands = useMemo(
      () =>
        slashMenuOpen
          ? SLASH_COMMANDS.filter((cmd) =>
              cmd.name.toLowerCase().startsWith(slashFilter.toLowerCase()),
            )
          : [],
      [slashMenuOpen, slashFilter],
    );

    function clearAfterSend(text: string): void {
      history.push(text);
      setInput("");
      setAttachments([]);
      if (inputRef.current) inputRef.current.style.height = "auto";
    }

    function handleSend(): void {
      const text = input.trim();
      if ((!text && attachments.length === 0) || isLoading) return;
      setSlashMenuOpen(false);
      const atts = attachments.length > 0 ? [...attachments] : undefined;
      clearAfterSend(text);
      onSubmit(text, atts);
    }

    function handleQuickAsk(): void {
      const text = input.trim();
      if (!text || isLoading) return;
      clearAfterSend(text);
      onQuickAsk(text);
    }

    function handleSlashSelect(cmd: SlashCommand): void {
      setSlashMenuOpen(false);
      if (cmd.local || cmd.category === "info") {
        setInput("");
        if (inputRef.current) inputRef.current.style.height = "auto";
        onSubmit(cmd.name);
        return;
      }
      setInput(cmd.name + " ");
      inputRef.current?.focus();
    }

    function handleInputChange(
      e: React.ChangeEvent<HTMLTextAreaElement>,
    ): void {
      const value = e.target.value;
      setInput(value);

      const target = e.target;
      requestAnimationFrame(() => {
        target.style.height = "auto";
        target.style.height = `${Math.min(target.scrollHeight, 120)}px`;
      });

      if (value.startsWith("/") && !value.includes(" ")) {
        const query = value.split(" ")[0];
        setSlashMenuOpen(true);
        setSlashFilter(query);
        setSlashSelectedIndex(0);
      } else if (slashMenuOpen) {
        setSlashMenuOpen(false);
      }
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>): void {
      if (isImeComposing(e)) return;

      if (slashMenuOpen && filteredSlashCommands.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSlashSelectedIndex((i) =>
            i < filteredSlashCommands.length - 1 ? i + 1 : 0,
          );
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setSlashSelectedIndex((i) =>
            i > 0 ? i - 1 : filteredSlashCommands.length - 1,
          );
          return;
        }
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          handleSlashSelect(filteredSlashCommands[slashSelectedIndex]);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setSlashMenuOpen(false);
          return;
        }
      }

      if (!slashMenuOpen && (history.isNavigating() || !input.includes("\n"))) {
        if (e.key === "ArrowUp" && history.size() > 0) {
          if (history.recallPrev()) {
            e.preventDefault();
            return;
          }
        }
        if (e.key === "ArrowDown" && history.isNavigating()) {
          if (history.recallNext()) {
            e.preventDefault();
            return;
          }
        }
      }

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    }

    async function handleFileChange(
      e: React.ChangeEvent<HTMLInputElement>,
    ): Promise<void> {
      const files = Array.from(e.target.files ?? []);
      if (files.length === 0) return;
      const newAtts = await Promise.all(files.map(readFileAsAttachment));
      setAttachments((prev) => [...prev, ...newAtts]);
      // Reset so the same file can be picked again
      e.target.value = "";
    }

    function removeAttachment(id: string): void {
      setAttachments((prev) => prev.filter((a) => a.id !== id));
    }

    const canSend = (input.trim().length > 0 || attachments.length > 0) && !isLoading;

    return (
      <>
        {slashMenuOpen && filteredSlashCommands.length > 0 && (
          <div className="slash-menu" ref={slashMenuRef}>
            <div className="slash-menu-header">
              <Slash size={12} />
              {t("chat.commandsTitle")}
            </div>
            <div className="slash-menu-list">
              {filteredSlashCommands.map((cmd, i) => (
                <button
                  key={cmd.name}
                  className={`slash-menu-item ${i === slashSelectedIndex ? "slash-menu-item-active" : ""}`}
                  onMouseEnter={() => setSlashSelectedIndex(i)}
                  onClick={() => handleSlashSelect(cmd)}
                >
                  <span className="slash-menu-item-name">{cmd.name}</span>
                  <span className="slash-menu-item-desc">
                    {cmd.description}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Attachment previews */}
        {attachments.length > 0 && (
          <div className="chat-attachments">
            {attachments.map((att) => (
              <div key={att.id} className="chat-attachment-chip">
                {att.isImage ? (
                  <img
                    src={att.dataUrl}
                    alt={att.name}
                    className="chat-attachment-thumb"
                  />
                ) : (
                  <FileText size={14} className="chat-attachment-icon" />
                )}
                <span className="chat-attachment-name" title={att.name}>
                  {att.name.length > 20
                    ? att.name.slice(0, 9) + "…" + att.name.slice(-8)
                    : att.name}
                </span>
                <button
                  className="chat-attachment-remove"
                  onClick={() => removeAttachment(att.id)}
                  title="Remove"
                >
                  <X size={11} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div
          className="chat-input-wrapper"
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          {/* Hidden real file input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,application/pdf,text/*,.csv,.json,.md,.txt,.py,.js,.ts,.tsx,.jsx,.yaml,.yml"
            style={{ display: "none" }}
            onChange={handleFileChange}
          />

          {/* Attach button */}
          <button
            className="chat-attach-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
            title="Attach file or image"
          >
            <Paperclip size={15} />
          </button>

          <textarea
            ref={inputRef}
            className="chat-input"
            placeholder={t("chat.typeMessage")}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            rows={1}
            autoFocus
          />
          {isLoading ? (
            <button
              className="chat-send-btn chat-stop-btn"
              onClick={onAbort}
              title={t("common.stop")}
            >
              <Stop size={14} />
            </button>
          ) : (
            <>
              {input.trim() && hasSession && (
                <button
                  className="chat-btw-btn"
                  onClick={handleQuickAsk}
                  title={t("chat.quickAskTitle")}
                >
                  💭
                </button>
              )}
              <button
                className="chat-send-btn"
                onClick={handleSend}
                disabled={!canSend}
                title={t("chat.send")}
              >
                <Send size={16} />
              </button>
            </>
          )}
        </div>
      </>
    );
  },
);
