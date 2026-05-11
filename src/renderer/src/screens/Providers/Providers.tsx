import { useState, useEffect, useRef, useCallback } from "react";
import { Check, ExternalLink, Refresh, Spinner } from "../../assets/icons";
import { SETTINGS_SECTIONS, PROVIDERS } from "../../constants";
import { useI18n } from "../../components/useI18n";

type ProviderLoginProgress = {
  provider: string;
  status: "starting" | "waiting" | "success" | "error";
  detail: string;
  log: string;
  verificationUrl?: string;
  userCode?: string;
};

type ProviderAuthStatus = {
  authenticated: boolean;
  detail: string;
};

const SUBSCRIPTION_PROVIDERS = [
  {
    id: "openai-codex",
    name: "constants.openaiCodexName",
    hint: "setup.codexAuthHint",
    command: "setup.codexAuthCommand",
  },
] as const;

type SubscriptionProviderId = (typeof SUBSCRIPTION_PROVIDERS)[number]["id"];

function Providers({
  profile,
  visible,
}: {
  profile?: string;
  visible?: boolean;
}): React.JSX.Element {
  const { t } = useI18n();

  // Env / API keys
  const [env, setEnv] = useState<Record<string, string>>({});
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());

  // Model config
  const [modelProvider, setModelProvider] = useState("auto");
  const [modelName, setModelName] = useState("");
  const [modelBaseUrl, setModelBaseUrl] = useState("");
  const [modelSaved, setModelSaved] = useState(false);
  const modelLoaded = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Credential pool
  const [credPool, setCredPool] = useState<
    Record<string, Array<{ key: string; label: string }>>
  >({});
  const [poolProvider, setPoolProvider] = useState("");
  const [poolNewKey, setPoolNewKey] = useState("");
  const [poolNewLabel, setPoolNewLabel] = useState("");

  // Browser sign-in providers
  const [authStatuses, setAuthStatuses] = useState<
    Record<string, ProviderAuthStatus>
  >({});
  const [authChecking, setAuthChecking] = useState<Record<string, boolean>>({});
  const [loginProgress, setLoginProgress] =
    useState<ProviderLoginProgress | null>(null);
  const [loginRunningProvider, setLoginRunningProvider] = useState<
    string | null
  >(null);

  const loadConfig = useCallback(async (): Promise<void> => {
    const [envData, mc, pool] = await Promise.all([
      window.hermesAPI.getEnv(profile),
      window.hermesAPI.getModelConfig(profile),
      window.hermesAPI.getCredentialPool(),
    ]);
    setEnv(envData);
    setModelProvider(mc.provider);
    setModelName(mc.model);
    setModelBaseUrl(mc.baseUrl);
    setCredPool(pool);

    requestAnimationFrame(() => {
      modelLoaded.current = true;
    });
  }, [profile]);

  const refreshProviderAuthStatus = useCallback(
    async (providerId: SubscriptionProviderId): Promise<void> => {
      setAuthChecking((prev) => ({ ...prev, [providerId]: true }));
      try {
        const status = await window.hermesAPI.getProviderAuthStatus(providerId);
        setAuthStatuses((prev) => ({
          ...prev,
          [providerId]: {
            authenticated: status.authenticated,
            detail: status.detail,
          },
        }));
      } catch (err) {
        setAuthStatuses((prev) => ({
          ...prev,
          [providerId]: {
            authenticated: false,
            detail: (err as Error).message,
          },
        }));
      } finally {
        setAuthChecking((prev) => ({ ...prev, [providerId]: false }));
      }
    },
    [],
  );

  useEffect(() => {
    modelLoaded.current = false;
    loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    return window.hermesAPI.onProviderLoginProgress((progress) => {
      if (
        !SUBSCRIPTION_PROVIDERS.some(
          (provider) => provider.id === progress.provider,
        )
      ) {
        return;
      }

      setLoginProgress(progress);
      setLoginRunningProvider(
        progress.status === "starting" || progress.status === "waiting"
          ? progress.provider
          : null,
      );

      if (progress.status === "success") {
        setAuthStatuses((prev) => ({
          ...prev,
          [progress.provider]: {
            authenticated: true,
            detail: progress.detail,
          },
        }));
      }
    });
  }, []);

  useEffect(() => {
    if (visible === false) return;
    for (const provider of SUBSCRIPTION_PROVIDERS) {
      void refreshProviderAuthStatus(provider.id);
    }
  }, [visible, refreshProviderAuthStatus]);

  // Refresh model config when the screen becomes visible
  useEffect(() => {
    if (!visible) return;
    (async (): Promise<void> => {
      const mc = await window.hermesAPI.getModelConfig(profile);
      modelLoaded.current = false;
      setModelProvider(mc.provider);
      setModelName(mc.model);
      setModelBaseUrl(mc.baseUrl);
      requestAnimationFrame(() => {
        modelLoaded.current = true;
      });
    })();
  }, [visible, profile]);

  // Auto-save model config when values change (debounced)
  const saveModelConfig = useCallback(async () => {
    if (!modelLoaded.current) return;
    await window.hermesAPI.setModelConfig(
      modelProvider,
      modelName,
      modelBaseUrl,
      profile,
    );
    if (modelName.trim()) {
      const displayName = modelName.split("/").pop() || modelName;
      await window.hermesAPI.addModel(
        displayName,
        modelProvider,
        modelName,
        modelBaseUrl,
      );
    }
    setModelSaved(true);
    setTimeout(() => setModelSaved(false), 2000);
  }, [modelProvider, modelName, modelBaseUrl, profile]);

  useEffect(() => {
    if (!modelLoaded.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveModelConfig();
    }, 500);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [modelProvider, modelName, modelBaseUrl, saveModelConfig]);

  async function handleBlur(key: string): Promise<void> {
    const value = env[key] || "";
    await window.hermesAPI.setEnv(key, value, profile);
    setSavedKey(key);
    setTimeout(() => setSavedKey(null), 2000);
  }

  function handleChange(key: string, value: string): void {
    setEnv((prev) => ({ ...prev, [key]: value }));
  }

  async function handleAddPoolKey(): Promise<void> {
    if (!poolProvider || !poolNewKey.trim()) return;
    const existing = credPool[poolProvider] || [];
    const entries = [
      ...existing,
      {
        key: poolNewKey.trim(),
        label: poolNewLabel.trim() || `Key ${existing.length + 1}`,
      },
    ];
    await window.hermesAPI.setCredentialPool(poolProvider, entries);
    setCredPool((prev) => ({ ...prev, [poolProvider]: entries }));
    setPoolNewKey("");
    setPoolNewLabel("");
  }

  async function handleRemovePoolKey(
    provider: string,
    index: number,
  ): Promise<void> {
    const entries = [...(credPool[provider] || [])];
    entries.splice(index, 1);
    await window.hermesAPI.setCredentialPool(provider, entries);
    setCredPool((prev) => ({ ...prev, [provider]: entries }));
  }

  async function handleProviderSignIn(
    providerId: SubscriptionProviderId,
  ): Promise<void> {
    setLoginRunningProvider(providerId);
    setLoginProgress({
      provider: providerId,
      status: "starting",
      detail: t("setup.codexLoginStarting"),
      log: "",
    });

    try {
      const result = await window.hermesAPI.startProviderLogin(providerId);
      if (result.success) {
        await refreshProviderAuthStatus(providerId);
      } else {
        setLoginProgress({
          provider: providerId,
          status: "error",
          detail: result.error || t("setup.codexLoginFailed"),
          log: "",
        });
      }
    } catch (err) {
      setLoginProgress({
        provider: providerId,
        status: "error",
        detail: (err as Error).message || t("setup.codexLoginFailed"),
        log: "",
      });
    }
    setLoginRunningProvider(null);
  }

  async function handleCancelProviderSignIn(): Promise<void> {
    const providerId = loginRunningProvider;
    await window.hermesAPI.cancelProviderLogin();
    setLoginRunningProvider(null);
    if (providerId) {
      setLoginProgress({
        provider: providerId,
        status: "error",
        detail: t("setup.codexLoginCancelled"),
        log: "",
      });
    }
  }

  function providerProgress(
    providerId: SubscriptionProviderId,
  ): ProviderLoginProgress | null {
    return loginProgress?.provider === providerId ? loginProgress : null;
  }

  function providerStatusClass(providerId: SubscriptionProviderId): string {
    const progress = providerProgress(providerId);
    if (progress?.status) return progress.status;
    return authStatuses[providerId]?.authenticated ? "success" : "";
  }

  function providerStatusText(providerId: SubscriptionProviderId): string {
    const progress = providerProgress(providerId);
    if (authChecking[providerId]) return t("setup.codexCheckingAuth");
    if (progress?.status === "success") return t("setup.codexLoginSuccess");
    if (progress?.status === "error") {
      return progress.detail || t("setup.codexLoginFailed");
    }
    if (progress?.userCode) return t("setup.codexLoginWaiting");
    if (progress?.status === "starting") return t("setup.codexLoginStarting");
    if (authStatuses[providerId]?.authenticated) {
      return t("setup.codexLoginSuccess");
    }
    return t("setup.codexNotSignedIn");
  }

  function toggleVisibility(key: string): void {
    setVisibleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const isCustomProvider = modelProvider === "custom";

  return (
    <div className="settings-container">
      <h1 className="settings-header">{t("providers.title")}</h1>
      <p className="models-subtitle" style={{ marginBottom: 16 }}>
        {t("providers.subtitle")}
      </p>

      <div className="settings-section">
        <div className="settings-section-title">
          {t("common.model")}
          {modelSaved && (
            <span className="settings-saved" style={{ marginLeft: 8 }}>
              {t("common.saved")}
            </span>
          )}
        </div>

        <div className="settings-field">
          <label className="settings-field-label">{t("common.provider")}</label>
          <select
            className="input settings-select"
            value={modelProvider}
            onChange={(e) => {
              const v = e.target.value;
              setModelProvider(v);
              if (v === "custom" && !modelBaseUrl) {
                setModelBaseUrl("http://localhost:1234/v1");
              }
            }}
          >
            {PROVIDERS.options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {t(opt.label)}
              </option>
            ))}
          </select>
          <div className="settings-field-hint">
            {isCustomProvider
              ? t("settings.customProviderHint")
              : t("settings.providerHint")}
          </div>
        </div>

        <div className="settings-field">
          <label className="settings-field-label">{t("common.model")}</label>
          <input
            className="input"
            type="text"
            value={modelName}
            onChange={(e) => setModelName(e.target.value)}
            placeholder={t("settings.modelNamePlaceholder")}
          />
          <div className="settings-field-hint">{t("settings.modelHint")}</div>
        </div>

        {isCustomProvider && (
          <div className="settings-field">
            <label className="settings-field-label">
              {t("common.baseUrl")}
            </label>
            <input
              className="input"
              type="text"
              value={modelBaseUrl}
              onChange={(e) => setModelBaseUrl(e.target.value)}
              placeholder={t("settings.modelBaseUrlPlaceholder")}
            />
            <div className="settings-field-hint">
              {t("settings.customBaseUrlHint")}
            </div>
          </div>
        )}
      </div>

      <div className="settings-section">
        <div className="settings-section-title">
          {t("settings.sections.providerSignIns")}
        </div>
        <div className="settings-auth-hint">
          {t("settings.providerSignInsHint")}
        </div>
        <div className="settings-auth-list">
          {SUBSCRIPTION_PROVIDERS.map((subscriptionProvider) => {
            const progress = providerProgress(subscriptionProvider.id);
            const isRunning = loginRunningProvider === subscriptionProvider.id;
            const isChecking = authChecking[subscriptionProvider.id];
            const isSignedIn =
              authStatuses[subscriptionProvider.id]?.authenticated ||
              progress?.status === "success";

            return (
              <div
                className="settings-auth-card"
                key={subscriptionProvider.id}
              >
                <div className="settings-auth-card-header">
                  <div>
                    <div className="settings-auth-title">
                      {t(subscriptionProvider.name)}
                    </div>
                    <div className="settings-auth-description">
                      {t(subscriptionProvider.hint)}
                    </div>
                  </div>
                  <span
                    className={`settings-auth-badge ${isSignedIn ? "signed-in" : ""}`}
                  >
                    {isSignedIn
                      ? t("settings.providerAuthSignedIn")
                      : t("settings.providerAuthNotSignedIn")}
                  </span>
                </div>

                <div className="settings-auth-actions">
                  <button
                    className="btn btn-primary btn-sm settings-auth-action"
                    onClick={() =>
                      handleProviderSignIn(subscriptionProvider.id)
                    }
                    disabled={isChecking || Boolean(loginRunningProvider)}
                    type="button"
                  >
                    {isRunning ? (
                      <Spinner className="settings-auth-spin" size={14} />
                    ) : isSignedIn ? (
                      <Check size={14} />
                    ) : null}
                    {isRunning
                      ? t("setup.codexLoginButtonRunning")
                      : isSignedIn
                        ? t("setup.codexLoginButtonSignedIn")
                        : t("setup.codexLoginButton")}
                  </button>

                  <button
                    className="btn btn-secondary btn-sm settings-auth-action"
                    onClick={() =>
                      refreshProviderAuthStatus(subscriptionProvider.id)
                    }
                    disabled={isChecking || isRunning}
                    type="button"
                  >
                    <Refresh
                      className={isChecking ? "settings-auth-spin" : ""}
                      size={14}
                    />
                    {t("common.refresh")}
                  </button>

                  {isRunning && (
                    <button
                      className="btn btn-secondary btn-sm settings-auth-action"
                      onClick={handleCancelProviderSignIn}
                      type="button"
                    >
                      {t("common.cancel")}
                    </button>
                  )}

                  {progress?.verificationUrl && (
                    <button
                      className="btn btn-secondary btn-sm settings-auth-action"
                      onClick={() =>
                        window.hermesAPI.openExternal(
                          progress.verificationUrl!,
                        )
                      }
                      type="button"
                    >
                      {t("setup.codexOpenBrowser")}
                      <ExternalLink size={13} />
                    </button>
                  )}
                </div>

                {progress?.userCode && (
                  <div className="settings-auth-code-row">
                    <span>{t("setup.codexUserCodeLabel")}</span>
                    <code>{progress.userCode}</code>
                  </div>
                )}

                <div
                  className={`settings-auth-status ${providerStatusClass(
                    subscriptionProvider.id,
                  )}`}
                >
                  {providerStatusText(subscriptionProvider.id)}
                </div>

                <code className="settings-auth-command">
                  {t(subscriptionProvider.command)}
                </code>
              </div>
            );
          })}
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">
          {t("settings.sections.credentialPool")}
        </div>
        <div className="settings-field">
          <div className="settings-field-hint" style={{ marginBottom: 10 }}>
            {t("settings.poolHint")}
          </div>
          <div className="settings-pool-add">
            <select
              className="input"
              value={poolProvider}
              onChange={(e) => setPoolProvider(e.target.value)}
              style={{ width: 140 }}
            >
              <option value="">{t("common.provider")}</option>
              {PROVIDERS.options
                .filter((p) => p.value !== "auto" && p.value !== "openai-codex")
                .map((p) => (
                  <option key={p.value} value={p.value}>
                    {t(p.label)}
                  </option>
                ))}
            </select>
            <input
              className="input"
              type="password"
              value={poolNewKey}
              onChange={(e) => setPoolNewKey(e.target.value)}
              placeholder={t("settings.apiKeyPlaceholder")}
              style={{ flex: 1 }}
            />
            <input
              className="input"
              type="text"
              value={poolNewLabel}
              onChange={(e) => setPoolNewLabel(e.target.value)}
              placeholder={t("settings.labelPlaceholder", {
                optional: t("common.optional"),
              })}
              style={{ width: 120 }}
            />
            <button
              className="btn btn-primary btn-sm"
              onClick={handleAddPoolKey}
              disabled={!poolProvider || !poolNewKey.trim()}
            >
              {t("settings.add")}
            </button>
          </div>
          {Object.entries(credPool).map(
            ([provider, entries]) =>
              entries.length > 0 && (
                <div key={provider} className="settings-pool-group">
                  <div className="settings-pool-provider">
                    {PROVIDERS.options.find((p) => p.value === provider)
                      ? t(
                          PROVIDERS.options.find((p) => p.value === provider)!
                            .label,
                        )
                      : provider}
                  </div>
                  {entries.map((entry, idx) => (
                    <div key={idx} className="settings-pool-entry">
                      <span className="settings-pool-label">
                        {entry.label || `${t("settings.keyLabel")} ${idx + 1}`}
                      </span>
                      <span className="settings-pool-key">
                        {entry.key
                          ? `${entry.key.slice(0, 8)}...${entry.key.slice(-4)}`
                          : t("settings.empty")}
                      </span>
                      <button
                        className="btn-ghost"
                        style={{ color: "var(--error)", fontSize: 11 }}
                        onClick={() => handleRemovePoolKey(provider, idx)}
                      >
                        {t("settings.remove")}
                      </button>
                    </div>
                  ))}
                </div>
              ),
          )}
        </div>
      </div>

      {SETTINGS_SECTIONS.map((section) => (
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
                    {visibleKeys.has(field.key)
                      ? t("common.hide")
                      : t("common.show")}
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

export default Providers;
