import { useState, useCallback, useEffect } from "react";
import Chat, { ChatMessage } from "../Chat/Chat";
import Sessions from "../Sessions/Sessions";
import Agents from "../Agents/Agents";
import Settings from "../Settings/Settings";
import Skills from "../Skills/Skills";
import Soul from "../Soul/Soul";
import Memory from "../Memory/Memory";
import Tools from "../Tools/Tools";
import Gateway from "../Gateway/Gateway";
import Models from "../Models/Models";
import Providers from "../Providers/Providers";
import Schedules from "../Schedules/Schedules";
import RemoteNotice from "../../components/RemoteNotice";
import HermesLogo from "../../components/common/HermesLogo";
import {
  ChatBubble,
  Clock,
  Users,
  Settings as SettingsIcon,
  Puzzle,
  Sparkles,
  Brain,
  Wrench,
  Signal,
  Layers,
  KeyRound,
  Timer,
  Download,
  Refresh,
  Plus,
} from "../../assets/icons";
import type { LucideIcon } from "lucide-react";

type EngineStatus = {
  mode: "remote" | "local";
  state: "ready" | "starting" | "offline" | "fallback";
  apiReady: boolean;
  gatewayRunning: boolean;
  path: "api" | "cli" | "remote-api";
  latencyMs?: number;
};

type EngineBenchmark = {
  ok: boolean;
  mode: "remote" | "local";
  path: "api" | "cli" | "remote-api";
  healthLatencyMs: number | null;
  error?: string;
};
import { useI18n } from "../../components/useI18n";

type View =
  | "chat"
  | "sessions"
  | "agents"
  | "models"
  | "providers"
  | "skills"
  | "soul"
  | "memory"
  | "tools"
  | "schedules"
  | "gateway"
  | "settings";



type ChatThread = {
  id: string;
  title: string;
  messages: ChatMessage[];
  sessionId: string | null;
  profile: string;
  running: boolean;
  updatedAt: number;
};

function createThread(profile = "default"): ChatThread {
  const now = Date.now();
  return {
    id: `thread-${now}-${Math.random().toString(16).slice(2)}`,
    title: "新对话",
    messages: [],
    sessionId: null,
    profile,
    running: false,
    updatedAt: now,
  };
}

function getThreadPreview(thread: ChatThread): string {
  const last = [...thread.messages].reverse().find((m) => m.content.trim());
  if (!last) return "新的 Yat Studio 对话";
  return last.content.replace(/\s+/g, " ").slice(0, 44);
}

function getThreadTitle(thread: ChatThread): string {
  const firstUser = thread.messages.find((m) => m.role === "user" && m.content.trim());
  if (!firstUser) return thread.title;
  return firstUser.content.replace(/\s+/g, " ").slice(0, 18);
}

const NAV_ITEMS: { view: View; icon: LucideIcon; labelKey: string }[] = [
  { view: "chat", icon: ChatBubble, labelKey: "navigation.chat" },
  { view: "sessions", icon: Clock, labelKey: "navigation.sessions" },
  { view: "agents", icon: Users, labelKey: "navigation.agents" },
  { view: "models", icon: Layers, labelKey: "navigation.models" },
  { view: "providers", icon: KeyRound, labelKey: "navigation.providers" },
  { view: "skills", icon: Puzzle, labelKey: "navigation.skills" },
  { view: "soul", icon: Sparkles, labelKey: "navigation.soul" },
  { view: "memory", icon: Brain, labelKey: "navigation.memory" },
  { view: "tools", icon: Wrench, labelKey: "navigation.tools" },
  { view: "schedules", icon: Timer, labelKey: "navigation.schedules" },
  { view: "gateway", icon: Signal, labelKey: "navigation.gateway" },
  { view: "settings", icon: SettingsIcon, labelKey: "navigation.settings" },
];

function Layout(): React.JSX.Element {
  const { t } = useI18n();
  const [view, setView] = useState<View>("chat");
  const [threads, setThreads] = useState<ChatThread[]>(() => [createThread()]);
  const [activeThreadId, setActiveThreadId] = useState(() => threads[0]?.id || "");
  const activeThread = threads.find((thread) => thread.id === activeThreadId) || threads[0];
  const activeProfile = activeThread?.profile || "default";
  // Remote mode — many screens show "not available" instead of empty data
  const [remoteMode, setRemoteMode] = useState(false);

  // Re-check remote mode on tab switch (picks up Settings changes)
  useEffect(() => {
    window.hermesAPI.isRemoteMode().then(setRemoteMode);
  }, [view]);

  // Auto-update state
  const [appVersion, setAppVersion] = useState<string>("");
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);
  const [updateState, setUpdateState] = useState<
    "idle" | "checking" | "available" | "downloading" | "ready" | "error"
  >("idle");
  const [downloadPercent, setDownloadPercent] = useState(0);
  const [engineStatus, setEngineStatus] = useState<EngineStatus | null>(null);
  const [benchmark, setBenchmark] = useState<EngineBenchmark | null>(null);
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  useEffect(() => {
    window.hermesAPI.getAppVersion().then(setAppVersion).catch(() => setAppVersion(""));
    window.hermesAPI
      .checkForUpdates()
      .then((version) => {
        if (version) {
          setUpdateVersion(version);
          setUpdateState("available");
        }
      })
      .catch(() => setUpdateState("idle"));

    const cleanupAvailable = window.hermesAPI.onUpdateAvailable((info) => {
      setUpdateVersion(info.version);
      setUpdateState("available");
    });
    const cleanupProgress = window.hermesAPI.onUpdateDownloadProgress(
      (info) => {
        setDownloadPercent(info.percent);
      },
    );
    const cleanupDownloaded = window.hermesAPI.onUpdateDownloaded(() => {
      setUpdateState("ready");
    });
    return () => {
      cleanupAvailable();
      cleanupProgress();
      cleanupDownloaded();
    };
  }, []);


  useEffect(() => {
    let mounted = true;
    window.hermesAPI
      .warmupEngine(activeProfile)
      .then((status) => {
        if (mounted) setEngineStatus(status);
      })
      .catch(() => {
        if (mounted) setEngineStatus(null);
      });
    const timer = window.setInterval(() => {
      window.hermesAPI
        .engineStatus()
        .then((status) => {
          if (mounted) setEngineStatus(status);
        })
        .catch(() => {
          if (mounted) setEngineStatus(null);
        });
    }, 5000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [activeProfile]);

  async function handleEngineBenchmark(): Promise<void> {
    try {
      const result = await window.hermesAPI.engineBenchmark();
      setBenchmark(result);
      const status = await window.hermesAPI.engineStatus();
      setEngineStatus(status);
    } catch {
      setBenchmark({
        ok: false,
        mode: "local",
        path: "cli",
        healthLatencyMs: null,
        error: "Benchmark failed",
      });
    }
  }

  async function handleUpdate(): Promise<void> {
    if (updateState === "idle" || updateState === "error") {
      setUpdateState("checking");
      try {
        const version = await window.hermesAPI.checkForUpdates();
        if (version) {
          setUpdateVersion(version);
          setUpdateState("available");
        } else {
          setUpdateState("idle");
        }
      } catch {
        setUpdateState("error");
      }
    } else if (updateState === "available") {
      setUpdateState("downloading");
      await window.hermesAPI.downloadUpdate();
    } else if (updateState === "ready") {
      await window.hermesAPI.installUpdate();
    }
  }


  const updateActiveThread = useCallback(
    (updater: (thread: ChatThread) => ChatThread) => {
      setThreads((prev) =>
        prev.map((thread) =>
          thread.id === activeThreadId ? updater(thread) : thread,
        ),
      );
    },
    [activeThreadId],
  );

  const setActiveMessages = useCallback(
    (value: React.SetStateAction<ChatMessage[]>) => {
      updateActiveThread((thread) => {
        const nextMessages =
          typeof value === "function" ? value(thread.messages) : value;
        return {
          ...thread,
          title: thread.title === "新对话" ? getThreadTitle({ ...thread, messages: nextMessages }) : thread.title,
          messages: nextMessages,
          updatedAt: Date.now(),
        };
      });
    },
    [updateActiveThread],
  );

  const handleThreadRunningChange = useCallback((running: boolean) => {
    setThreads((prev) =>
      prev.map((thread) =>
        thread.id === activeThreadId ? { ...thread, running, updatedAt: Date.now() } : thread,
      ),
    );
  }, [activeThreadId]);

  const handleThreadSessionChange = useCallback((sessionId: string | null) => {
    setThreads((prev) =>
      prev.map((thread) =>
        thread.id === activeThreadId ? { ...thread, sessionId, updatedAt: Date.now() } : thread,
      ),
    );
  }, [activeThreadId]);

  const handleCommitThreadTitle = useCallback(async (threadId: string, rawTitle: string) => {
    const title = rawTitle.trim().slice(0, 40) || "新对话";
    let sessionId: string | null = null;
    setThreads((prev) =>
      prev.map((thread) => {
        if (thread.id !== threadId) return thread;
        sessionId = thread.sessionId;
        return { ...thread, title, updatedAt: Date.now() };
      }),
    );
    setEditingThreadId(null);
    setEditingTitle("");
    if (sessionId) {
      try {
        await window.hermesAPI.updateSessionTitle(sessionId, title);
      } catch {
        // Local rename still works for active in-memory thread.
      }
    }
  }, []);

  const handleNewChat = useCallback(() => {
    const thread = createThread(activeProfile);
    setThreads((prev) => [thread, ...prev]);
    setActiveThreadId(thread.id);
    setView("chat");
  }, [activeProfile]);

  // Listen for menu IPC events (Cmd+N, Cmd+K from app menu)
  useEffect(() => {
    const cleanupNewChat = window.hermesAPI.onMenuNewChat(() => {
      handleNewChat();
    });
    const cleanupSearch = window.hermesAPI.onMenuSearchSessions(() => {
      setView("sessions");
    });
    return () => {
      cleanupNewChat();
      cleanupSearch();
    };
  }, [handleNewChat]);

  const handleSelectProfile = useCallback((name: string) => {
    const thread = createThread(name);
    setThreads((prev) => [thread, ...prev]);
    setActiveThreadId(thread.id);
  }, []);

  const handleResumeSession = useCallback(async (sessionId: string) => {
    const dbMessages = await window.hermesAPI.getSessionMessages(sessionId);
    const chatMessages: ChatMessage[] = dbMessages.map((m) => ({
      id: `db-${m.id}`,
      role: m.role === "user" ? "user" : "agent",
      content: m.content,
    }));
    const thread: ChatThread = {
      ...createThread(activeProfile),
      id: `session-${sessionId}`,
      title: chatMessages[0]?.content.slice(0, 18) || t("chat.title"),
      messages: chatMessages,
      sessionId,
      updatedAt: Date.now(),
    };
    setThreads((prev) => [thread, ...prev.filter((t) => t.id !== thread.id)]);
    setActiveThreadId(thread.id);
    setView("chat");
  }, [activeProfile, t]);

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-brand-mark">
            <HermesLogo size={30} />
          </div>
          <div className="sidebar-brand-copy">
            <div className="sidebar-brand-name">Yat Studio</div>
            <div className="sidebar-brand-subtitle">AI workspace</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map(({ view: v, icon: Icon, labelKey }) => (
            <button
              key={v}
              className={`sidebar-nav-item ${view === v ? "active" : ""}`}
              onClick={() => {
                setView(v);
              }}
              title={t(labelKey)}
              aria-label={t(labelKey)}
            >
              <Icon size={16} />
              <span className="sidebar-nav-label">{t(labelKey)}</span>
              <span className="sidebar-nav-tooltip" role="tooltip">{t(labelKey)}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button
            className={`sidebar-engine-btn engine-${engineStatus?.state || "offline"}`}
            onClick={handleEngineBenchmark}
            title={benchmark?.error || t("common.engineBenchmark")}
          >
            <span className="sidebar-engine-status" />
            <span className="sidebar-engine-copy">
              <span className="sidebar-engine-title">{t("common.engine")}</span>
              <span className="sidebar-engine-meta">
                {engineStatus?.state === "ready" &&
                  `${t("common.engineReady")} · ${engineStatus.path}${
                    engineStatus.latencyMs !== undefined ? ` · ${engineStatus.latencyMs}ms` : ""
                  }`}
                {engineStatus?.state === "starting" && t("common.engineStarting")}
                {engineStatus?.state === "fallback" && t("common.engineFallback")}
                {engineStatus?.state === "offline" && t("common.engineOffline")}
                {!engineStatus && t("common.engineStarting")}
              </span>
            </span>
          </button>
          <button
            className={`sidebar-version-btn update-${updateState}`}
            onClick={handleUpdate}
            title={
              updateState === "available"
                ? t("common.updateAvailable", { version: updateVersion })
                : updateState === "ready"
                  ? t("common.restartToUpdate")
                  : t("common.checkForUpdates")
            }
          >
            <span className="sidebar-version-status" />
            <span className="sidebar-version-copy">
              <span className="sidebar-version-title">Yat Studio</span>
              <span className="sidebar-version-meta">
                {updateState === "checking" && t("common.checkingUpdates")}
                {updateState === "available" &&
                  t("common.updateAvailable", { version: updateVersion })}
                {updateState === "downloading" &&
                  t("common.downloading", { percent: downloadPercent })}
                {updateState === "ready" && t("common.restartToUpdate")}
                {updateState === "error" && t("common.updateCheckFailed")}
                {updateState === "idle" && `${t("settings.version", { version: appVersion || "—" })}`}
              </span>
            </span>
            {updateState === "available" || updateState === "ready" ? (
              <Download size={14} />
            ) : (
              <Refresh size={14} />
            )}
          </button>
          <div className="sidebar-footer-text">
            {activeProfile === "default" ? t("common.appName") : activeProfile}
          </div>
        </div>
      </aside>

      {view === "chat" && (
        <section className="wechat-thread-pane">
          <div className="wechat-thread-head">
            <div>
              <div className="wechat-thread-title">对话</div>
              <div className="wechat-thread-count">{threads.length} 个窗口</div>
            </div>
            <button className="wechat-thread-new" onClick={handleNewChat} title={t("chat.newChat")}>
              <Plus size={16} />
            </button>
          </div>
          <div className="wechat-thread-list">
            {threads.map((thread) => {
              const isEditing = editingThreadId === thread.id;
              return (
                <button
                  key={thread.id}
                  className={`wechat-thread-item ${thread.id === activeThreadId ? "active" : ""} ${isEditing ? "editing" : ""}`}
                  onClick={() => {
                    setActiveThreadId(thread.id);
                    if (!isEditing) setView("chat");
                  }}
                  onDoubleClick={(event) => {
                    event.preventDefault();
                    setEditingThreadId(thread.id);
                    setEditingTitle(getThreadTitle(thread));
                  }}
                  title="双击重命名"
                >
                  <span className="wechat-thread-avatar">Y</span>
                  <span className="wechat-thread-copy">
                    {isEditing ? (
                      <input
                        className="wechat-thread-name-input"
                        value={editingTitle}
                        autoFocus
                        maxLength={40}
                        onChange={(event) => setEditingTitle(event.target.value)}
                        onClick={(event) => event.stopPropagation()}
                        onDoubleClick={(event) => event.stopPropagation()}
                        onBlur={() => handleCommitThreadTitle(thread.id, editingTitle)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            handleCommitThreadTitle(thread.id, editingTitle);
                          }
                          if (event.key === "Escape") {
                            event.preventDefault();
                            setEditingThreadId(null);
                            setEditingTitle("");
                          }
                        }}
                      />
                    ) : (
                      <span className="wechat-thread-name">{getThreadTitle(thread)}</span>
                    )}
                    <span className="wechat-thread-preview">{isEditing ? "回车保存，Esc 取消" : getThreadPreview(thread)}</span>
                  </span>
                  {thread.running && <span className="wechat-thread-running" />}
                  {!isEditing && <span className="wechat-thread-rename">重命名</span>}
                </button>
              );
            })}
          </div>
        </section>
      )}

      <main className="content">
        <div
          style={{
            display: view === "chat" ? "flex" : "none",
            flex: 1,
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <Chat
            conversationId={activeThread?.id}
            messages={activeThread?.messages || []}
            setMessages={setActiveMessages}
            sessionId={activeThread?.sessionId || null}
            profile={activeProfile}
            onNewChat={handleNewChat}
            onRunningChange={handleThreadRunningChange}
            onSessionIdChange={handleThreadSessionChange}
          />
        </div>
        {view === "sessions" &&
          (remoteMode ? (
            <RemoteNotice feature="Sessions" />
          ) : (
            <Sessions
              onResumeSession={handleResumeSession}
              onNewChat={handleNewChat}
              currentSessionId={activeThread?.sessionId || null}
            />
          ))}
        {view === "agents" &&
          (remoteMode ? (
            <RemoteNotice feature="Profiles" />
          ) : (
            <Agents
              activeProfile={activeProfile}
              onSelectProfile={handleSelectProfile}
              onChatWith={(name: string) => {
                handleSelectProfile(name);
                setView("chat");
              }}
            />
          ))}
        {view === "models" && <Models />}
        <div
          style={{
            display: view === "providers" ? "flex" : "none",
            flex: 1,
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {remoteMode ? (
            view === "providers" && <RemoteNotice feature="Providers" />
          ) : (
            <Providers profile={activeProfile} visible={view === "providers"} />
          )}
        </div>
        {view === "skills" &&
          (remoteMode ? (
            <RemoteNotice feature="Skills" />
          ) : (
            <Skills profile={activeProfile} />
          ))}
        {view === "soul" &&
          (remoteMode ? (
            <RemoteNotice feature="Persona" />
          ) : (
            <Soul profile={activeProfile} />
          ))}
        {view === "memory" &&
          (remoteMode ? (
            <RemoteNotice feature="Memory" />
          ) : (
            <Memory profile={activeProfile} />
          ))}
        {view === "tools" &&
          (remoteMode ? (
            <RemoteNotice feature="Tools" />
          ) : (
            <Tools profile={activeProfile} />
          ))}
        {view === "schedules" &&
          (remoteMode ? (
            <RemoteNotice feature="Schedules" />
          ) : (
            <Schedules profile={activeProfile} />
          ))}
        {view === "gateway" &&
          (remoteMode ? (
            <RemoteNotice feature="Gateway" />
          ) : (
            <Gateway profile={activeProfile} />
          ))}
        <div
          style={{
            display: view === "settings" ? "flex" : "none",
            flex: 1,
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <Settings profile={activeProfile} />
        </div>
      </main>
    </div>
  );
}

export default Layout;
