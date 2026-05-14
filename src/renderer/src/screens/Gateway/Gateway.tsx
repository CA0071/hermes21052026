import { useState, useEffect, useCallback, useRef } from "react";
import { Info, X } from "lucide-react";
import { GATEWAY_SECTIONS, GATEWAY_PLATFORMS } from "../../constants";
import { useI18n } from "../../components/useI18n";

type TunnelStatus = "idle" | "starting" | "active" | "error";

interface TunnelState {
  status: TunnelStatus;
  url: string | null;
  error?: string;
}

function Gateway({ profile }: { profile?: string }): React.JSX.Element {
  const { t } = useI18n();
  const [gatewayRunning, setGatewayRunning] = useState(false);
  const [autoConnect, setAutoConnectState] = useState(false);
  const [env, setEnv] = useState<Record<string, string>>({});
  const [platformEnabled, setPlatformEnabled] = useState<
    Record<string, boolean>
  >({});
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const gatewayStatusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const platformStatusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tunnel state
  const [tunnelState, setTunnelState] = useState<TunnelState>({ status: "idle", url: null });
  const [tunnelMode, setTunnelMode] = useState<"quick" | "named">("quick");
  const [tunnelName, setTunnelName] = useState("");
  const [tunnelHostname, setTunnelHostname] = useState("");
  const [tunnelConfigSaved, setTunnelConfigSaved] = useState(false);
  const [showTunnelInfo, setShowTunnelInfo] = useState(false);

  const loadConfig = useCallback(async (): Promise<void> => {
    await window.hermesAPI.getEnv(profile).then(setEnv).catch(() => {});
    await window.hermesAPI.gatewayStatus().then(setGatewayRunning).catch(() => {});
    await window.hermesAPI.getPlatformEnabled(profile).then(setPlatformEnabled).catch(() => {});

    await window.hermesAPI.getTunnelConfig().then((cfg) => {
      setTunnelMode(cfg.mode);
      setTunnelName(cfg.tunnelName);
      setTunnelHostname(cfg.hostname);
    }).catch(() => {});

    await window.hermesAPI.getTunnelStatus().then(setTunnelState).catch(() => {});
    await window.hermesAPI.getAutoConnect().then(setAutoConnectState).catch(() => {});
  }, [profile]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    const unsub = window.hermesAPI.onTunnelStatus((state) => {
      setTunnelState(state);
    });
    return unsub;
  }, []);

  // Poll gateway status (10s interval to reduce IPC overhead)
  useEffect(() => {
    const interval = setInterval(async () => {
      const status = await window.hermesAPI.gatewayStatus();
      setGatewayRunning(status);
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  async function toggleAutoConnect(): Promise<void> {
    const next = !autoConnect;
    setAutoConnectState(next);
    await window.hermesAPI.setAutoConnect(next);
  }

  async function toggleGateway(): Promise<void> {
    if (gatewayStatusTimeoutRef.current) {
      clearTimeout(gatewayStatusTimeoutRef.current);
      gatewayStatusTimeoutRef.current = null;
    }
    if (gatewayRunning) {
      await window.hermesAPI.stopGateway();
      setGatewayRunning(false);
    } else {
      const started = await window.hermesAPI.startGateway();
      setGatewayRunning(started);
      gatewayStatusTimeoutRef.current = setTimeout(async () => {
        const status = await window.hermesAPI.gatewayStatus();
        setGatewayRunning(status);
        gatewayStatusTimeoutRef.current = null;
      }, 2000);
    }
  }

  async function togglePlatform(platform: string): Promise<void> {
    if (platformStatusTimeoutRef.current) {
      clearTimeout(platformStatusTimeoutRef.current);
      platformStatusTimeoutRef.current = null;
    }
    const newValue = !platformEnabled[platform];
    setPlatformEnabled((prev) => ({ ...prev, [platform]: newValue }));
    await window.hermesAPI.setPlatformEnabled(platform, newValue, profile);
    platformStatusTimeoutRef.current = setTimeout(async () => {
      const status = await window.hermesAPI.gatewayStatus();
      setGatewayRunning(status);
      platformStatusTimeoutRef.current = null;
    }, 3000);
  }

  async function handleBlur(key: string): Promise<void> {
    const value = env[key] || "";
    await window.hermesAPI.setEnv(key, value, profile);
    setSavedKey(key);
    setTimeout(() => setSavedKey(null), 2000);
  }

  function handleChange(key: string, value: string): void {
    setEnv((prev) => ({ ...prev, [key]: value }));
  }

  function toggleVisibility(key: string): void {
    setVisibleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function saveTunnelConfig(): Promise<void> {
    await window.hermesAPI.saveTunnelConfig({
      mode: tunnelMode,
      tunnelName,
      hostname: tunnelHostname,
    });
    setTunnelConfigSaved(true);
    setTimeout(() => setTunnelConfigSaved(false), 2000);
  }

  async function toggleTunnel(): Promise<void> {
    if (tunnelState.status === "idle" || tunnelState.status === "error") {
      await window.hermesAPI.startTunnel();
    } else {
      await window.hermesAPI.stopTunnel();
    }
  }

  function tunnelStatusLabel(): string {
    switch (tunnelState.status) {
      case "active": return tunnelState.url ?? t("gateway.tunnel.active");
      case "starting": return t("gateway.tunnel.starting");
      case "error": return tunnelState.error ?? t("gateway.tunnel.error");
      default: return t("gateway.tunnel.idle");
    }
  }

  // Build a set of field keys that belong to platforms (for grouping)
  const platformFieldKeys = new Set(GATEWAY_PLATFORMS.flatMap((p) => p.fields));

  // Non-platform fields from GATEWAY_SECTIONS
  const otherSections = GATEWAY_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => !platformFieldKeys.has(item.key)),
  })).filter((section) => section.items.length > 0);

  // Map env keys to their field definitions for rendering inside platform cards
  const fieldDefs = new Map(
    GATEWAY_SECTIONS.flatMap((s) => s.items).map((f) => [f.key, f]),
  );

  return (
    <div className="settings-container">
      <h1 className="settings-header">{t("gateway.title")}</h1>

      <div className="settings-section">
        <div className="settings-section-title">
          {t("gateway.messagingGateway")}
        </div>
        <div className="settings-field">
          <label className="settings-field-label">{t("gateway.status")}</label>
          <div className="settings-gateway-row">
            <span
              className={`settings-gateway-status ${gatewayRunning ? "running" : "stopped"}`}
            >
              {gatewayRunning ? t("gateway.running") : t("gateway.stopped")}
            </span>
            <button
              className="btn btn-secondary btn-sm"
              onClick={toggleGateway}
            >
              {gatewayRunning ? t("common.stop") : t("common.start")}
            </button>
          </div>
          <div className="settings-field-hint">{t("gateway.gatewayHint")}</div>
        </div>
        <div className="settings-field">
          <label className="settings-field-label">{t("gateway.autoConnect")}</label>
          <div className="settings-gateway-row">
            <label className="tools-toggle">
              <input
                type="checkbox"
                checked={autoConnect}
                onChange={toggleAutoConnect}
              />
              <span className="tools-toggle-track" />
            </label>
          </div>
          <div className="settings-field-hint">{t("gateway.autoConnectHint")}</div>
        </div>
      </div>

      {showTunnelInfo && (
        <div className="tunnel-info-overlay" onClick={() => setShowTunnelInfo(false)}>
          <div className="tunnel-info-modal" onClick={(e) => e.stopPropagation()}>
            <div className="tunnel-info-header">
              <span>{t("gateway.tunnel.infoTitle")}</span>
              <button className="btn-ghost tunnel-info-close" onClick={() => setShowTunnelInfo(false)}>
                <X size={16} />
              </button>
            </div>
            <div className="tunnel-info-body">
              <p>{t("gateway.tunnel.infoIntro")}</p>
              <div className="tunnel-info-steps">
                <div className="tunnel-info-step">
                  <span className="tunnel-info-step-num">1</span>
                  <div>
                    <strong>{t("gateway.tunnel.step1Title")}</strong>
                    <p>{t("gateway.tunnel.step1Desc")}</p>
                    <div className="tunnel-info-code">
                      <span>winget install Cloudflare.cloudflared</span>
                    </div>
                    <p className="tunnel-info-alt">{t("gateway.tunnel.step1Alt")}</p>
                  </div>
                </div>
                <div className="tunnel-info-step">
                  <span className="tunnel-info-step-num">2</span>
                  <div>
                    <strong>{t("gateway.tunnel.step2Title")}</strong>
                    <p>{t("gateway.tunnel.step2Desc")}</p>
                  </div>
                </div>
                <div className="tunnel-info-step">
                  <span className="tunnel-info-step-num">3</span>
                  <div>
                    <strong>{t("gateway.tunnel.step3Title")}</strong>
                    <p>{t("gateway.tunnel.step3Desc")}</p>
                    <div className="tunnel-info-code">
                      <span>cloudflared tunnel login</span>
                    </div>
                    <div className="tunnel-info-code">
                      <span>cloudflared tunnel create my-tunnel-name</span>
                    </div>
                    <p className="tunnel-info-note">{t("gateway.tunnel.step3Note")}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="settings-section">
        <div className="settings-section-title tunnel-section-title">
          {t("gateway.tunnel.title")}
          <button
            className="btn-ghost tunnel-info-btn"
            onClick={() => setShowTunnelInfo(true)}
            title={t("gateway.tunnel.infoTitle")}
          >
            <Info size={15} />
          </button>
        </div>
        <div className="settings-field">
          <label className="settings-field-label">{t("gateway.tunnel.status")}</label>
          <div className="settings-gateway-row">
            <span
              className={`settings-gateway-status ${tunnelState.status === "active" ? "running" : tunnelState.status === "error" ? "stopped" : ""}`}
              title={tunnelState.status === "active" ? tunnelState.url ?? undefined : tunnelState.error}
            >
              {tunnelStatusLabel()}
            </span>
            <button
              className="btn btn-secondary btn-sm"
              onClick={toggleTunnel}
              disabled={tunnelState.status === "starting"}
            >
              {tunnelState.status === "idle" || tunnelState.status === "error"
                ? t("common.start")
                : t("common.stop")}
            </button>
            {tunnelState.status === "active" && tunnelState.url && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => navigator.clipboard.writeText(tunnelState.url!)}
              >
                {t("gateway.tunnel.copy")}
              </button>
            )}
          </div>
          <div className="settings-field-hint">{t("gateway.tunnel.hint")}</div>
        </div>

        <div className="settings-field">
          <label className="settings-field-label">{t("gateway.tunnel.mode")}</label>
          <select
            className="input"
            value={tunnelMode}
            onChange={(e) => setTunnelMode(e.target.value as "quick" | "named")}
          >
            <option value="quick">{t("gateway.tunnel.modeQuick")}</option>
            <option value="named">{t("gateway.tunnel.modeNamed")}</option>
          </select>
        </div>

        {tunnelMode === "named" && (
          <>
            <div className="settings-field">
              <label className="settings-field-label">{t("gateway.tunnel.tunnelName")}</label>
              <input
                className="input"
                type="text"
                value={tunnelName}
                onChange={(e) => setTunnelName(e.target.value)}
                placeholder="e.g. my-hermes-tunnel"
              />
            </div>
            <div className="settings-field">
              <label className="settings-field-label">{t("gateway.tunnel.hostname")}</label>
              <input
                className="input"
                type="text"
                value={tunnelHostname}
                onChange={(e) => setTunnelHostname(e.target.value)}
                placeholder="e.g. hermes.example.com"
              />
              <div className="settings-field-hint">{t("gateway.tunnel.hostnameHint")}</div>
            </div>
          </>
        )}

        <div className="settings-field">
          <button className="btn btn-primary btn-sm" onClick={saveTunnelConfig}>
            {tunnelConfigSaved ? t("common.saved") : t("common.save")}
          </button>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">{t("gateway.platforms")}</div>
        {GATEWAY_PLATFORMS.map((platform) => (
          <div key={platform.key} className="settings-platform-card">
            <div className="settings-platform-header">
              <div className="settings-platform-info">
                <span className="settings-platform-label">
                  {t(platform.label)}
                </span>
                <span className="settings-platform-desc">
                  {t(platform.description)}
                </span>
              </div>
              <label className="tools-toggle">
                <input
                  type="checkbox"
                  checked={!!platformEnabled[platform.key]}
                  onChange={() => togglePlatform(platform.key)}
                />
                <span className="tools-toggle-track" />
              </label>
            </div>
            {platformEnabled[platform.key] && (
              <div className="settings-platform-fields">
                {platform.fields.map((fieldKey) => {
                  const field = fieldDefs.get(fieldKey);
                  if (!field) return null;
                  return (
                    <div key={field.key} className="settings-field">
                      <label className="settings-field-label">
                        {t(field.label)}
                        {savedKey === field.key && (
                          <span className="settings-saved">{t("common.saved")}</span>
                        )}
                      </label>
                      <div className="settings-input-row">
                        <input
                          className="input"
                          type={
                            field.type === "password" &&
                            !visibleKeys.has(field.key)
                              ? "password"
                              : "text"
                          }
                          value={env[field.key] || ""}
                          onChange={(e) =>
                            handleChange(field.key, e.target.value)
                          }
                          onBlur={() => handleBlur(field.key)}
                          placeholder={t(field.label)}
                        />
                        {field.type === "password" && (
                          <button
                            className="btn-ghost settings-toggle-btn"
                            onClick={() => toggleVisibility(field.key)}
                          >
                            {visibleKeys.has(field.key) ? t("common.hide") : t("common.show")}
                          </button>
                        )}
                      </div>
                      <div className="settings-field-hint">{t(field.hint)}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      {otherSections.map((section) => (
        <div key={section.title} className="settings-section">
          <div className="settings-section-title">{t(section.title)}</div>
          {section.items.map((field) => (
            <div key={field.key} className="settings-field">
              <label className="settings-field-label">
                {t(field.label)}
                {savedKey === field.key && (
                  <span className="settings-saved">{t("common.saved")}</span>
                )}
              </label>
              <div className="settings-input-row">
                <input
                  className="input"
                  type={
                    field.type === "password" && !visibleKeys.has(field.key)
                      ? "password"
                      : "text"
                  }
                  value={env[field.key] || ""}
                  onChange={(e) => handleChange(field.key, e.target.value)}
                  onBlur={() => handleBlur(field.key)}
                  placeholder={t(field.label)}
                />
                {field.type === "password" && (
                  <button
                    className="btn-ghost settings-toggle-btn"
                    onClick={() => toggleVisibility(field.key)}
                  >
                    {visibleKeys.has(field.key) ? t("common.hide") : t("common.show")}
                  </button>
                )}
              </div>
              <div className="settings-field-hint">{t(field.hint)}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export default Gateway;
