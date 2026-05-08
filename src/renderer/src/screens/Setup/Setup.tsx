import { useState } from "react";
import { ArrowRight, ExternalLink } from "../../assets/icons";
import { PROVIDERS, LOCAL_PRESETS, OPENAI_COMPATIBLE_MODEL_PRESETS } from "../../constants";
import { useI18n } from "../../components/useI18n";

function Setup({ onComplete }: { onComplete: () => void }): React.JSX.Element {
  const { t } = useI18n();
  const [selectedProvider, setSelectedProvider] = useState("customApi");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("https://api.deepseek.com/v1");
  const [modelName, setModelName] = useState("deepseek-chat");
  const [selectedModelPreset, setSelectedModelPreset] = useState("deepseek-chat");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [showKey, setShowKey] = useState(false);

  const provider = PROVIDERS.setup.find((p) => p.id === selectedProvider)!;
  const isCustomApi = selectedProvider === "customApi";
  const isLocal = selectedProvider === "local";
  const usesOpenAiCompatibleEndpoint = isCustomApi || isLocal;

  function applyProvider(providerId: string): void {
    setSelectedProvider(providerId);
    setError("");
    if (providerId === "customApi") {
      setBaseUrl("https://api.deepseek.com/v1");
      setModelName("deepseek-chat");
      setSelectedModelPreset("deepseek-chat");
    } else if (providerId === "local") {
      setBaseUrl("http://localhost:1234/v1");
      setModelName("");
      setSelectedModelPreset("custom-model");
    }
  }

  function isLocalUrl(url: string): boolean {
    return /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::|\/|$)/i.test(
      url.trim(),
    );
  }

  function applyLocalPreset(presetBaseUrl: string): void {
    const preset = LOCAL_PRESETS.find((p) => p.baseUrl === presetBaseUrl);
    setBaseUrl(presetBaseUrl);
    if (preset?.defaultModel) {
      setModelName(preset.defaultModel);
      const matched = OPENAI_COMPATIBLE_MODEL_PRESETS.find(
        (p) => p.model === preset.defaultModel && p.baseUrl === presetBaseUrl,
      );
      setSelectedModelPreset(matched?.id ?? "custom-model");
    }
  }

  function applyModelPreset(presetId: string): void {
    const preset = OPENAI_COMPATIBLE_MODEL_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setSelectedModelPreset(preset.id);
    setModelName(preset.model);
    if (preset.baseUrl) {
      setBaseUrl(preset.baseUrl);
    }
    setError("");
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
    if (/dashscope\.aliyuncs\.com/i.test(url)) return "DASHSCOPE_API_KEY";
    if (/bigmodel\.cn|zhipuai|glm/i.test(url)) return "GLM_API_KEY";
    if (/moonshot\.cn|kimi/i.test(url)) return "KIMI_API_KEY";
    if (/minimax\.chat|minimaxi\.com/i.test(url)) return "MINIMAX_CN_API_KEY";
    return "CUSTOM_API_KEY";
  }

  async function handleContinue(): Promise<void> {
    if (provider.needsKey && !apiKey.trim()) {
      setError(t("setup.missingApiKey"));
      return;
    }
    if (usesOpenAiCompatibleEndpoint && !baseUrl.trim()) {
      setError(t("setup.missingServerUrl"));
      return;
    }
    if (isCustomApi && !modelName.trim()) {
      setError(t("setup.missingModelName"));
      return;
    }
    if (isCustomApi && !isLocalUrl(baseUrl) && !apiKey.trim()) {
      setError(t("setup.missingApiKey"));
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      if (provider.needsKey && provider.envKey) {
        await window.hermesAPI.setEnv(provider.envKey, apiKey.trim());
        await window.hermesAPI.setYatSetupSkipped(false);
      } else if (usesOpenAiCompatibleEndpoint && apiKey.trim()) {
        const envKey = resolveCustomEnvKey(baseUrl.trim());
        await window.hermesAPI.setEnv(envKey, apiKey.trim());
        await window.hermesAPI.setYatSetupSkipped(false);
      } else if (usesOpenAiCompatibleEndpoint && modelName.trim()) {
        await window.hermesAPI.setYatSetupSkipped(false);
      }

      const configProvider = usesOpenAiCompatibleEndpoint ? "custom" : provider.configProvider;
      const configBaseUrl = usesOpenAiCompatibleEndpoint ? baseUrl.trim() : provider.baseUrl;
      const configModel = modelName.trim() || "";
      const modelLabel =
        PROVIDERS.setup.find((p) => p.id === selectedProvider)?.id === "customApi"
          ? `${configModel} @ ${configBaseUrl}`
          : `${selectedProvider} ${configModel}`.trim();
      const result = await window.hermesAPI.configureValidatedDefaultModel(
        modelLabel,
        configProvider,
        configModel,
        configBaseUrl,
        apiKey.trim() || undefined,
        "default",
      );
      if (!result.ok) {
        setError(
          t("setup.validationFailed", {
            error: result.error || `HTTP ${result.status || "error"}`,
          }),
        );
        setSaving(false);
        return;
      }

      setSuccess(t("setup.validationSucceeded"));
      onComplete();
    } catch {
      setError(t("setup.saveFailed"));
      setSaving(false);
    }
  }

  async function handleSkip(): Promise<void> {
    setSaving(true);
    setError("");
    try {
      await window.hermesAPI.setModelConfig("custom", "", "http://localhost:1234/v1");
      await window.hermesAPI.setYatSetupSkipped(true);
      onComplete();
    } catch {
      setError(t("setup.skipFailed"));
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
            onClick={() => applyProvider(p.id)}
          >
            <div className="setup-provider-name">{t(p.name)}</div>
            <div className="setup-provider-desc">{t(p.desc)}</div>
            {p.tag && <div className="setup-provider-tag">{t(p.tag)}</div>}
          </button>
        ))}
      </div>

      <div className="setup-form">
        {usesOpenAiCompatibleEndpoint ? (
          <>
            <label className="setup-label">{t("setup.customApiGroupLabel")}</label>
            <div className="setup-local-presets">
              {LOCAL_PRESETS.filter((p) => p.group === (isLocal ? "local" : "remote")).map(
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

            {isLocal && (
              <>
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
              </>
            )}

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
                setSelectedModelPreset("custom-model");
                setError("");
                setSuccess("");
              }}
              autoFocus
            />
            <div className="setup-field-hint">
              {isLocal ? t("setup.customServerHint") : t("setup.remoteApiServerHint")}
            </div>

            <label className="setup-label" style={{ marginTop: 16 }}>
              {t("setup.customApiKeyLabel")}{" "}
              <span className="setup-label-optional">
                {isCustomApi ? t("setup.required") : t("common.optional")}
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
                setSuccess("");
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
              {t("setup.openAiCompatibleModel")}
            </label>
            <div className="setup-model-presets">
              {OPENAI_COMPATIBLE_MODEL_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  className={`setup-model-preset ${selectedModelPreset === preset.id ? "active" : ""}`}
                  onClick={() => applyModelPreset(preset.id)}
                  type="button"
                >
                  <span>{preset.label}</span>
                  {preset.model && <code>{preset.model}</code>}
                </button>
              ))}
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
              onChange={(e) => {
                setModelName(e.target.value);
                setSelectedModelPreset("custom-model");
              }}
            />
            <div className="setup-field-hint">
              {t("setup.defaultModelHint")}
            </div>
          </>
        ) : (
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
                setSuccess("");
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
        )}

        {error && <div className="setup-error">{error}</div>}
        {success && <div className="settings-saved">{success}</div>}

        <div className="setup-actions">
          <button
            className="btn btn-secondary setup-skip"
            onClick={handleSkip}
            disabled={saving}
            type="button"
          >
            {t("setup.skipForNow")}
          </button>
          <button
            className="btn btn-primary setup-continue"
            onClick={handleContinue}
            disabled={
              saving ||
              (provider.needsKey && !apiKey.trim()) ||
              (usesOpenAiCompatibleEndpoint && !baseUrl.trim()) ||
              (isCustomApi && !modelName.trim()) ||
              (isCustomApi && !isLocalUrl(baseUrl) && !apiKey.trim())
            }
          >
            {saving ? t("setup.validatingModel") : t("setup.continue")}
            {!saving && <ArrowRight size={16} />}
          </button>
        </div>
        <div className="setup-skip-hint">{t("setup.skipHint")}</div>
      </div>
    </div>
  );
}

export default Setup;
