import { useEffect, useState } from "react";
import { ArrowRight, Check, ExternalLink, Spinner } from "../../assets/icons";
import { PROVIDERS, LOCAL_PRESETS } from "../../constants";
import { useI18n } from "../../components/useI18n";

type SetupProviderLoginProgress = {
  provider: string;
  status: "starting" | "waiting" | "success" | "error";
  detail: string;
  log: string;
  verificationUrl?: string;
  userCode?: string;
};

function Setup({ onComplete }: { onComplete: () => void }): React.JSX.Element {
  const { t } = useI18n();
  const [selectedProvider, setSelectedProvider] = useState("openrouter");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("http://localhost:1234/v1");
  const [modelName, setModelName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [codexLoginProgress, setCodexLoginProgress] =
    useState<SetupProviderLoginProgress | null>(null);
  const [codexLoginRunning, setCodexLoginRunning] = useState(false);
  const [codexSignedIn, setCodexSignedIn] = useState(false);
  const [codexAuthChecking, setCodexAuthChecking] = useState(false);

  const provider = PROVIDERS.setup.find((p) => p.id === selectedProvider)!;
  const isLocal = selectedProvider === "local";
  const isCodexSubscription = selectedProvider === "openai-codex";

  useEffect(() => {
    return window.hermesAPI.onProviderLoginProgress((progress) => {
      if (progress.provider !== "openai-codex") return;
      setCodexLoginProgress(progress);
      setCodexLoginRunning(
        progress.status === "starting" || progress.status === "waiting",
      );
      if (progress.status === "success") {
        setCodexSignedIn(true);
      }
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!isCodexSubscription) return undefined;

    setCodexAuthChecking(true);
    window.hermesAPI
      .getProviderAuthStatus("openai-codex")
      .then((status) => {
        if (cancelled) return;
        setCodexSignedIn(status.authenticated);
        if (status.authenticated) {
          setCodexLoginProgress({
            provider: "openai-codex",
            status: "success",
            detail: t("setup.codexLoginSuccess"),
            log: status.detail,
          });
        }
      })
      .catch(() => {
        if (!cancelled) setCodexSignedIn(false);
      })
      .finally(() => {
        if (!cancelled) setCodexAuthChecking(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isCodexSubscription, t]);

  function applyLocalPreset(presetBaseUrl: string): void {
    setBaseUrl(presetBaseUrl);
  }

  function codexStatusText(): string {
    if (codexAuthChecking) return t("setup.codexCheckingAuth");
    if (!codexLoginProgress) return t("setup.codexNotSignedIn");
    if (codexLoginProgress.status === "success") {
      return t("setup.codexLoginSuccess");
    }
    if (codexLoginProgress.status === "error") {
      return codexLoginProgress.detail || t("setup.codexLoginFailed");
    }
    if (codexLoginProgress.userCode) return t("setup.codexLoginWaiting");
    return t("setup.codexLoginStarting");
  }

  async function handleCodexSignIn(): Promise<void> {
    setError("");
    setCodexSignedIn(false);
    setCodexLoginRunning(true);
    setCodexLoginProgress({
      provider: "openai-codex",
      status: "starting",
      detail: t("setup.codexLoginStarting"),
      log: "",
    });

    try {
      const result = await window.hermesAPI.startProviderLogin("openai-codex");
      if (result.success) {
        setCodexSignedIn(true);
      } else {
        setError(result.error || t("setup.codexLoginFailed"));
      }
    } catch {
      setError(t("setup.codexLoginFailed"));
    } finally {
      setCodexLoginRunning(false);
    }
  }

  async function handleCancelCodexSignIn(): Promise<void> {
    await window.hermesAPI.cancelProviderLogin();
    setCodexLoginRunning(false);
    setCodexLoginProgress({
      provider: "openai-codex",
      status: "error",
      detail: t("setup.codexLoginCancelled"),
      log: "",
    });
  }

  function resolveCustomEnvKey(url: string): string {
    const preset = LOCAL_PRESETS.find((p) => p.baseUrl === url);
    if (preset?.envKey) return preset.envKey;
    if (/openrouter\.ai/i.test(url)) return "OPENROUTER_API_KEY";
    if (/anthropic\.com/i.test(url)) return "ANTHROPIC_API_KEY";
    if (/openai\.com/i.test(url)) return "OPENAI_API_KEY";
    if (/huggingface\.co/i.test(url)) return "HF_TOKEN";
    if (/api\.groq\.com/i.test(url)) return "GROQ_API_KEY";
    if (/api\.deepseek\.com/i.test(url)) return "DEEPSEEK_API_KEY";
    if (/api\.together\.xyz/i.test(url)) return "TOGETHER_API_KEY";
    if (/api\.fireworks\.ai/i.test(url)) return "FIREWORKS_API_KEY";
    if (/api\.cerebras\.ai/i.test(url)) return "CEREBRAS_API_KEY";
    if (/api\.mistral\.ai/i.test(url)) return "MISTRAL_API_KEY";
    if (/api\.perplexity\.ai/i.test(url)) return "PERPLEXITY_API_KEY";
    return "CUSTOM_API_KEY";
  }

  async function handleContinue(): Promise<void> {
    if (provider.needsKey && !apiKey.trim()) {
      setError(t("setup.missingApiKey"));
      return;
    }
    if (isLocal && !baseUrl.trim()) {
      setError(t("setup.missingServerUrl"));
      return;
    }

    setSaving(true);
    setError("");

    try {
      if (provider.needsKey && provider.envKey) {
        await window.hermesAPI.setEnv(provider.envKey, apiKey.trim());
      } else if (isLocal && apiKey.trim()) {
        const envKey = resolveCustomEnvKey(baseUrl.trim());
        await window.hermesAPI.setEnv(envKey, apiKey.trim());
      }

      const configProvider = isLocal ? "custom" : provider.configProvider;
      const configBaseUrl = isLocal ? baseUrl.trim() : provider.baseUrl;
      const configModel = modelName.trim() || "";
      await window.hermesAPI.setModelConfig(
        configProvider,
        configModel,
        configBaseUrl,
      );

      onComplete();
    } catch {
      setError(t("setup.saveFailed"));
      setSaving(false);
    }
  }

  return (
    <div className="screen setup-screen">
      <h1 className="setup-title">{t("setup.title")}</h1>
      <p className="setup-subtitle">{t("setup.subtitle")}</p>

      <div className="setup-provider-grid">
        {PROVIDERS.setup.map((p) => (
          <button
            key={p.id}
            className={`setup-provider-card ${selectedProvider === p.id ? "selected" : ""}`}
            onClick={() => {
              setSelectedProvider(p.id);
              setError("");
            }}
          >
            <div className="setup-provider-name">{t(p.name)}</div>
            <div className="setup-provider-desc">{t(p.desc)}</div>
            {p.tag && <div className="setup-provider-tag">{t(p.tag)}</div>}
          </button>
        ))}
      </div>

      <div className="setup-form">
        {isLocal ? (
          <>
            <label className="setup-label">{t("setup.localGroupLabel")}</label>
            <div className="setup-local-presets">
              {LOCAL_PRESETS.filter((p) => p.group === "local").map(
                (preset) => (
                  <button
                    key={preset.id}
                    className={`setup-local-preset ${baseUrl === preset.baseUrl ? "active" : ""}`}
                    onClick={() => applyLocalPreset(preset.baseUrl)}
                  >
                    {t(`setup.localPresets.${preset.id}`)}
                  </button>
                ),
              )}
            </div>

            <label className="setup-label" style={{ marginTop: 12 }}>
              {t("setup.remoteGroupLabel")}
            </label>
            <div className="setup-local-presets">
              {LOCAL_PRESETS.filter((p) => p.group === "remote").map(
                (preset) => (
                  <button
                    key={preset.id}
                    className={`setup-local-preset ${baseUrl === preset.baseUrl ? "active" : ""}`}
                    onClick={() => applyLocalPreset(preset.baseUrl)}
                  >
                    {t(`setup.localPresets.${preset.id}`)}
                  </button>
                ),
              )}
            </div>

            <label className="setup-label" style={{ marginTop: 16 }}>
              {t("setup.serverUrl")}
            </label>
            <input
              className="input"
              type="text"
              placeholder={t("setup.modelBaseUrlPlaceholder")}
              value={baseUrl}
              onChange={(e) => {
                setBaseUrl(e.target.value);
                setError("");
              }}
              autoFocus
            />
            <div className="setup-field-hint">
              {t("setup.customServerHint")}
            </div>

            <label className="setup-label" style={{ marginTop: 16 }}>
              {t("setup.customApiKeyLabel")}{" "}
              <span className="setup-label-optional">
                {t("common.optional")}
              </span>
            </label>
            <div className="setup-input-group">
              <input
                className="input"
                type={showKey ? "text" : "password"}
                placeholder="sk-..."
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setError("");
                }}
              />
              <button
                className="setup-toggle-visibility"
                onClick={() => setShowKey(!showKey)}
                type="button"
              >
                {showKey ? t("common.hide") : t("common.show")}
              </button>
            </div>
            <div className="setup-field-hint">
              {t("setup.customApiKeyHint")}
            </div>

            <label className="setup-label" style={{ marginTop: 16 }}>
              {t("setup.modelName")}{" "}
              <span className="setup-label-optional">
                {t("common.optional")}
              </span>
            </label>
            <input
              className="input"
              type="text"
              placeholder={t("setup.modelNamePlaceholder")}
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
            />
            <div className="setup-field-hint">
              {t("setup.defaultModelHint")}
            </div>
          </>
        ) : provider.needsKey ? (
          <>
            <label className="setup-label">
              {t("setup.apiKeyLabel", { provider: t(provider.name) })}
            </label>
            <div className="setup-input-group">
              <input
                className="input"
                type={showKey ? "text" : "password"}
                placeholder={provider.placeholder}
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setError("");
                }}
                onKeyDown={(e) => e.key === "Enter" && handleContinue()}
                autoFocus
              />
              <button
                className="setup-toggle-visibility"
                onClick={() => setShowKey(!showKey)}
                type="button"
              >
                {showKey ? t("common.hide") : t("common.show")}
              </button>
            </div>

            <button
              className="setup-link"
              onClick={() => window.hermesAPI.openExternal(provider.url)}
            >
              {t("setup.noKeyHint")}
              <ExternalLink size={12} />
            </button>
          </>
        ) : (
          <>
            <div className="setup-auth-panel">
              <div className="setup-auth-title">
                {isCodexSubscription
                  ? t("setup.codexAuthTitle")
                  : t("setup.noApiKeyTitle")}
              </div>
              <div className="setup-auth-hint">
                {isCodexSubscription
                  ? t("setup.codexAuthHint")
                  : t("setup.noApiKeyHint")}
              </div>
              {isCodexSubscription && (
                <>
                  <div className="setup-auth-actions">
                    <button
                      className="btn btn-primary btn-sm setup-auth-action"
                      onClick={handleCodexSignIn}
                      disabled={codexAuthChecking || codexLoginRunning}
                      type="button"
                    >
                      {codexLoginRunning ? (
                        <Spinner className="setup-auth-spin" size={14} />
                      ) : codexSignedIn ? (
                        <Check size={14} />
                      ) : null}
                      {codexLoginRunning
                        ? t("setup.codexLoginButtonRunning")
                        : codexSignedIn
                          ? t("setup.codexLoginButtonSignedIn")
                          : t("setup.codexLoginButton")}
                    </button>
                    {codexLoginRunning && (
                      <button
                        className="btn btn-secondary btn-sm setup-auth-action"
                        onClick={handleCancelCodexSignIn}
                        type="button"
                      >
                        {t("common.cancel")}
                      </button>
                    )}
                    {codexLoginProgress?.verificationUrl && (
                      <button
                        className="btn btn-secondary btn-sm setup-auth-action"
                        onClick={() =>
                          window.hermesAPI.openExternal(
                            codexLoginProgress.verificationUrl!,
                          )
                        }
                        type="button"
                      >
                        {t("setup.codexOpenBrowser")}
                        <ExternalLink size={13} />
                      </button>
                    )}
                  </div>
                  {codexLoginProgress?.userCode && (
                    <div className="setup-auth-code-row">
                      <span>{t("setup.codexUserCodeLabel")}</span>
                      <code>{codexLoginProgress.userCode}</code>
                    </div>
                  )}
                  <div
                    className={`setup-auth-status ${codexLoginProgress?.status || ""}`}
                  >
                    {codexStatusText()}
                  </div>
                  <code className="setup-auth-command">
                    {t("setup.codexAuthCommand")}
                  </code>
                </>
              )}
            </div>

            <label className="setup-label" style={{ marginTop: 16 }}>
              {t("setup.modelName")}{" "}
              <span className="setup-label-optional">
                {t("common.optional")}
              </span>
            </label>
            <input
              className="input"
              type="text"
              placeholder={t("setup.modelNamePlaceholder")}
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
            />
            <div className="setup-field-hint">
              {t("setup.defaultModelHint")}
            </div>
          </>
        )}

        {error && <div className="setup-error">{error}</div>}

        <button
          className="btn btn-primary setup-continue"
          onClick={handleContinue}
          disabled={
            saving ||
            (provider.needsKey && !apiKey.trim()) ||
            (isLocal && !baseUrl.trim()) ||
            (isCodexSubscription &&
              (codexAuthChecking || codexLoginRunning || !codexSignedIn))
          }
          style={{ marginTop: isLocal ? 20 : 0 }}
        >
          {saving ? t("setup.saving") : t("setup.continue")}
          {!saving && <ArrowRight size={16} />}
        </button>
      </div>
    </div>
  );
}

export default Setup;
