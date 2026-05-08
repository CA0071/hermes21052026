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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [activeProfile, setActiveProfile] = useState("default");
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

  const handleNewChat = useCallback(() => {
    // Abort any in-flight chat before clearing
    window.hermesAPI.abortChat();
    setMessages([]);
    setCurrentSessionId(null);
    setView("chat");
  }, []);

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
    setActiveProfile(name);
    setMessages([]);
    setCurrentSessionId(null);
  }, []);

  const handleResumeSession = useCallback(async (sessionId: string) => {
    const dbMessages = await window.hermesAPI.getSessionMessages(sessionId);
    const chatMessages: ChatMessage[] = dbMessages.map((m) => ({
      id: `db-${m.id}`,
      role: m.role === "user" ? "user" : "agent",
      content: m.content,
    }));
    setMessages(chatMessages);
    setCurrentSessionId(sessionId);
    setView("chat");
  }, []);

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
            >
              <Icon size={16} />
              {t(labelKey)}
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
            messages={messages}
            setMessages={setMessages}
            sessionId={currentSessionId}
            profile={activeProfile}
            onNewChat={handleNewChat}
          />
        </div>
        {view === "sessions" &&
          (remoteMode ? (
            <RemoteNotice feature="Sessions" />
          ) : (
            <Sessions
              onResumeSession={handleResumeSession}
              onNewChat={handleNewChat}
              currentSessionId={currentSessionId}
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
