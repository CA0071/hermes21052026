import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Check,
  Plus,
  Refresh,
  Search,
  Spinner,
  Trash,
  X,
} from "../../assets/icons";
import { PROVIDERS } from "../../constants";
import { useI18n } from "../../components/useI18n";
import { useHermesReadiness } from "../../hooks/useHermesReadiness";
import {
  createProviderModelStatusItems,
  readyProviderStatuses,
  selectedProviderStatus,
} from "../../lib/providerModelStatus";

interface SavedModel {
  id: string;
  name: string;
  provider: string;
  model: string;
  baseUrl: string;
  createdAt: number;
}

interface DiscoveredModel {
  provider: string;
  model: string;
  name: string;
  baseUrl: string;
  source: "live" | "models.dev" | "endpoint";
}

interface ProviderModelCatalog {
  provider: string;
  active: boolean;
  authSource: string;
  source: "live" | "models.dev" | "endpoint" | "none";
  models: DiscoveredModel[];
  error?: string;
}

function providerLabelKey(value: string): string {
  return PROVIDERS.options.find((p) => p.value === value)?.label || value;
}

function sourceLabelKey(source: ProviderModelCatalog["source"]): string {
  if (source === "live") return "models.sourceLive";
  if (source === "models.dev") return "models.sourceModelsDev";
  if (source === "endpoint") return "models.sourceEndpoint";
  return "models.sourceNone";
}

function modelKey(provider: string, model: string, baseUrl: string): string {
  return `${provider}::${model}::${baseUrl || ""}`;
}

function mergeCatalogs(
  current: ProviderModelCatalog[],
  incoming: ProviderModelCatalog[],
): ProviderModelCatalog[] {
  const next = new Map(current.map((catalog) => [catalog.provider, catalog]));
  for (const catalog of incoming) {
    next.set(catalog.provider, catalog);
  }
  return [...next.values()];
}

function Models({ profile }: { profile?: string }): React.JSX.Element {
  const { t } = useI18n();
  const [models, setModels] = useState<SavedModel[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [catalogs, setCatalogs] = useState<ProviderModelCatalog[]>([]);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState("");
  const readiness = useHermesReadiness({ profile });

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingModel, setEditingModel] = useState<SavedModel | null>(null);
  const [formName, setFormName] = useState("");
  const [formProvider, setFormProvider] = useState("openrouter");
  const [formModel, setFormModel] = useState("");
  const [formBaseUrl, setFormBaseUrl] = useState("");
  const [formApiKey, setFormApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [formError, setFormError] = useState("");
  const [modalFetching, setModalFetching] = useState(false);

  function resolveCustomEnvKey(url: string): string {
    if (!url) return "CUSTOM_API_KEY";
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

  const loadModels = useCallback(async () => {
    const list = await window.hermesAPI.listModels();
    setModels(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadModels();
  }, [loadModels]);

  function openAddModal(): void {
    setEditingModel(null);
    setFormName("");
    setFormProvider("openrouter");
    setFormModel("");
    setFormBaseUrl("");
    setFormApiKey("");
    setShowApiKey(false);
    setFormError("");
    setModalFetching(false);
    setShowModal(true);
  }

  function openEditModal(m: SavedModel): void {
    setEditingModel(m);
    setFormName(m.name);
    setFormProvider(m.provider);
    setFormModel(m.model);
    setFormBaseUrl(m.baseUrl);
    setFormApiKey("");
    setShowApiKey(false);
    setFormError("");
    setModalFetching(false);
    setShowModal(true);
  }

  function closeModal(): void {
    setShowModal(false);
    setEditingModel(null);
    setFormError("");
  }

  async function handleSave(): Promise<void> {
    const name = formName.trim();
    const model = formModel.trim();
    if (!name || !model) {
      setFormError(t("models.nameRequired"));
      return;
    }
    setFormError("");

    if (editingModel) {
      await window.hermesAPI.updateModel(editingModel.id, {
        name,
        provider: formProvider,
        model,
        baseUrl: formBaseUrl.trim(),
      });
    } else {
      await window.hermesAPI.addModel(
        name,
        formProvider,
        model,
        formBaseUrl.trim(),
      );
    }

    if (formApiKey.trim() && formProvider === "custom") {
      const envKey = resolveCustomEnvKey(formBaseUrl.trim());
      await window.hermesAPI.setEnv(envKey, formApiKey.trim());
    }

    closeModal();
    await loadModels();
  }

  function hasModel(model: DiscoveredModel): boolean {
    const key = modelKey(model.provider, model.model, model.baseUrl);
    return models.some(
      (saved) => modelKey(saved.provider, saved.model, saved.baseUrl) === key,
    );
  }

  async function handleFetchActiveModels(): Promise<void> {
    setCatalogLoading(true);
    setCatalogError("");
    try {
      const result = await window.hermesAPI.discoverModels({ profile });
      setCatalogs(result);
      if (result.length === 0) {
        setCatalogError(t("models.noActiveProviders"));
      }
    } catch (err) {
      setCatalogError((err as Error).message || t("models.fetchFailed"));
    } finally {
      setCatalogLoading(false);
    }
  }

  async function handleFetchProviderModels(): Promise<void> {
    setModalFetching(true);
    setFormError("");
    try {
      const result = await window.hermesAPI.discoverModels({
        provider: formProvider,
        profile,
        baseUrl: formBaseUrl.trim(),
      });
      setCatalogs((prev) => mergeCatalogs(prev, result));
      const count = result.reduce(
        (sum, catalog) => sum + catalog.models.length,
        0,
      );
      if (count === 0) {
        setFormError(result[0]?.error || t("models.fetchFailed"));
      }
    } catch (err) {
      setFormError((err as Error).message || t("models.fetchFailed"));
    } finally {
      setModalFetching(false);
    }
  }

  function applyDiscoveredModel(model: DiscoveredModel): void {
    setFormProvider(model.provider);
    setFormName(model.name);
    setFormModel(model.model);
    setFormBaseUrl(model.baseUrl);
    setFormError("");
  }

  async function handleAddDiscoveredModel(
    model: DiscoveredModel,
  ): Promise<void> {
    await window.hermesAPI.addModel(
      model.name,
      model.provider,
      model.model,
      model.baseUrl,
    );
    await loadModels();
  }

  async function handleAddVisibleModels(): Promise<void> {
    const toAdd = filteredDiscoveredModels.filter((model) => !hasModel(model));
    for (const model of toAdd) {
      await window.hermesAPI.addModel(
        model.name,
        model.provider,
        model.model,
        model.baseUrl,
      );
    }
    await loadModels();
  }

  async function handleDelete(id: string): Promise<void> {
    await window.hermesAPI.removeModel(id);
    setConfirmDelete(null);
    await loadModels();
  }

  const filtered = models.filter((m) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      m.name.toLowerCase().includes(q) ||
      m.model.toLowerCase().includes(q) ||
      m.provider.toLowerCase().includes(q)
    );
  });

  const savedKeys = new Set(
    models.map((m) => modelKey(m.provider, m.model, m.baseUrl)),
  );
  const discoveredModels = catalogs.flatMap((catalog) => catalog.models);
  const filteredDiscoveredModels = discoveredModels.filter((model) => {
    if (!catalogSearch) return true;
    const q = catalogSearch.toLowerCase();
    return (
      model.name.toLowerCase().includes(q) ||
      model.model.toLowerCase().includes(q) ||
      model.provider.toLowerCase().includes(q)
    );
  });
  const modalProviderModels =
    catalogs.find((catalog) => catalog.provider === formProvider)?.models || [];
  const visibleNewModelCount = filteredDiscoveredModels.filter(
    (model) =>
      !savedKeys.has(modelKey(model.provider, model.model, model.baseUrl)),
  ).length;
  const providerStatusItems = useMemo(
    () =>
      createProviderModelStatusItems({
        modelConfig: readiness.source.modelConfig,
        env: readiness.source.env,
        credentialPool: readiness.source.credentialPool,
        providerAuth: readiness.source.providerAuth
          ? { "openai-codex": readiness.source.providerAuth }
          : {},
      }),
    [
      readiness.source.credentialPool,
      readiness.source.env,
      readiness.source.modelConfig,
      readiness.source.providerAuth,
    ],
  );
  const readyStatuses = readyProviderStatuses(providerStatusItems);
  const selectedStatus = selectedProviderStatus(providerStatusItems);
  const visibleProviderStatuses = providerStatusItems.filter((item) => {
    return item.provider === "auto"
      ? item.selected
      : item.ready || item.selected;
  });

  if (loading) {
    return (
      <div className="settings-container">
        <h1 className="settings-header">{t("models.title")}</h1>
        <div className="models-loading">
          <div className="loading-spinner" />
        </div>
      </div>
    );
  }

  return (
    <div className="settings-container">
      <div className="models-header">
        <div>
          <h1 className="settings-header" style={{ marginBottom: 4 }}>
            {t("models.title")}
          </h1>
          <p className="models-subtitle">{t("models.subtitle")}</p>
        </div>
        <div className="models-header-actions">
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleFetchActiveModels}
            disabled={catalogLoading}
          >
            {catalogLoading ? (
              <Spinner className="models-fetch-spin" size={14} />
            ) : (
              <Refresh size={14} />
            )}
            {catalogLoading
              ? t("models.fetchingModels")
              : t("models.fetchModels")}
          </button>
          <button className="btn btn-primary btn-sm" onClick={openAddModal}>
            <Plus size={14} />
            {t("models.addModel")}
          </button>
        </div>
      </div>

      <section className="models-provider-status-panel">
        <div className="models-provider-status-summary">
          <div>
            <h2 className="models-provider-status-title">
              {t("models.providerStatusTitle")}
            </h2>
            <div className="models-provider-status-meta">
              {t("models.providerStatusMeta", {
                count: readyStatuses.length,
                selected: selectedStatus
                  ? t(selectedStatus.labelKey)
                  : t("constants.autoDetect"),
              })}
            </div>
          </div>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => void readiness.refresh()}
            disabled={readiness.loading}
            type="button"
          >
            {readiness.loading ? (
              <Spinner className="models-fetch-spin" size={14} />
            ) : (
              <Refresh size={14} />
            )}
            {t("common.refresh")}
          </button>
        </div>
        <div className="models-provider-status-list">
          {visibleProviderStatuses.length === 0 ? (
            <span className="models-provider-status-empty">
              {t("models.noReadyProviderStatus")}
            </span>
          ) : (
            visibleProviderStatuses.map((item) => (
              <span
                className={`models-provider-status-chip settings-status-${item.tone}`}
                key={item.provider}
                title={t(item.sourceLabelKey)}
              >
                {item.selected && (
                  <strong>{t("models.providerStatusSelected")}</strong>
                )}
                {t(item.labelKey)}
                <em>{t(item.sourceLabelKey)}</em>
              </span>
            ))
          )}
        </div>
      </section>

      {(catalogs.length > 0 || catalogError) && (
        <section className="models-discovery-panel">
          <div className="models-discovery-header">
            <div>
              <h2 className="models-discovery-title">
                {t("models.availableModels")}
              </h2>
              <div className="models-discovery-meta">
                {t("models.availableModelsMeta", {
                  count: discoveredModels.length,
                  providers: catalogs.length,
                })}
              </div>
            </div>
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleAddVisibleModels}
              disabled={visibleNewModelCount === 0}
            >
              <Plus size={13} />
              {t("models.addVisibleCount", { count: visibleNewModelCount })}
            </button>
          </div>

          <div className="models-discovery-providers">
            {catalogs.map((catalog) => (
              <span
                key={catalog.provider}
                className={`models-discovery-provider ${
                  catalog.error ? "has-error" : ""
                }`}
                title={catalog.error || t(sourceLabelKey(catalog.source))}
              >
                {t(providerLabelKey(catalog.provider))}
                <strong>{catalog.models.length}</strong>
              </span>
            ))}
          </div>

          {catalogError && <div className="models-error">{catalogError}</div>}
          {catalogs
            .filter((catalog) => catalog.error)
            .map((catalog) => (
              <div className="models-error" key={`${catalog.provider}-error`}>
                {t("models.catalogError", {
                  provider: t(providerLabelKey(catalog.provider)),
                  error: catalog.error,
                })}
              </div>
            ))}

          {discoveredModels.length > 0 && (
            <>
              <div className="models-discovery-search">
                <Search size={14} />
                <input
                  className="models-search-input"
                  type="text"
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  placeholder={t("models.catalogSearchPlaceholder")}
                />
              </div>

              {filteredDiscoveredModels.length === 0 ? (
                <div className="models-discovery-empty">
                  {t("models.noFetchedModels")}
                </div>
              ) : (
                <div className="models-discovery-list">
                  {filteredDiscoveredModels.map((model) => {
                    const exists = savedKeys.has(
                      modelKey(model.provider, model.model, model.baseUrl),
                    );
                    return (
                      <div
                        className="models-discovery-row"
                        key={modelKey(
                          model.provider,
                          model.model,
                          model.baseUrl,
                        )}
                      >
                        <div className="models-discovery-row-main">
                          <div className="models-discovery-row-name">
                            {model.name}
                          </div>
                          <div className="models-discovery-row-model">
                            {model.model}
                          </div>
                        </div>
                        <div className="models-discovery-row-actions">
                          <span className="models-card-provider">
                            {t(providerLabelKey(model.provider))}
                          </span>
                          <span className="models-source-badge">
                            {t(sourceLabelKey(model.source))}
                          </span>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleAddDiscoveredModel(model)}
                            disabled={exists}
                          >
                            {exists ? <Check size={13} /> : <Plus size={13} />}
                            {exists
                              ? t("models.alreadyAdded")
                              : t("models.addFetched")}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </section>
      )}

      {models.length > 0 && (
        <div className="models-search">
          <Search size={14} />
          <input
            className="models-search-input"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("models.searchPlaceholder")}
          />
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="models-empty">
          {models.length === 0 ? (
            <>
              <p className="models-empty-text">{t("models.empty")}</p>
              <p className="models-empty-hint">{t("models.emptyHint")}</p>
            </>
          ) : (
            <p className="models-empty-text">{t("models.noMatch")}</p>
          )}
        </div>
      ) : (
        <div className="models-grid">
          {filtered.map((m) => (
            <div
              key={m.id}
              className="models-card"
              onClick={() => openEditModal(m)}
            >
              <div className="models-card-header">
                <div className="models-card-name">{m.name}</div>
                <span className="models-card-provider">
                  {t(providerLabelKey(m.provider))}
                </span>
              </div>
              <div className="models-card-model">{m.model}</div>
              {m.baseUrl && <div className="models-card-url">{m.baseUrl}</div>}
              <div className="models-card-footer">
                {confirmDelete === m.id ? (
                  <div
                    className="models-card-confirm"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span>{t("models.deleteConfirm")}</span>
                    <button
                      className="btn btn-sm"
                      style={{ color: "var(--error)" }}
                      onClick={() => handleDelete(m.id)}
                    >
                      {t("models.yes")}
                    </button>
                    <button
                      className="btn btn-sm"
                      onClick={() => setConfirmDelete(null)}
                    >
                      {t("models.no")}
                    </button>
                  </div>
                ) : (
                  <button
                    className="btn-ghost models-card-delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDelete(m.id);
                    }}
                    title={t("models.deleteModelTitle")}
                  >
                    <Trash size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="models-modal-overlay" onClick={closeModal}>
          <div className="models-modal" onClick={(e) => e.stopPropagation()}>
            <div className="models-modal-header">
              <h2 className="models-modal-title">
                {editingModel ? t("models.editModel") : t("models.addModel")}
              </h2>
              <button className="btn-ghost" onClick={closeModal}>
                <X size={18} />
              </button>
            </div>

            <div className="models-modal-body">
              <div className="models-modal-field">
                <label className="models-modal-label">
                  {t("models.displayName")}
                </label>
                <input
                  className="input"
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder={t("models.namePlaceholder")}
                  autoFocus
                />
              </div>

              <div className="models-modal-field">
                <label className="models-modal-label">
                  {t("common.provider")}
                </label>
                <select
                  className="input"
                  value={formProvider}
                  onChange={(e) => setFormProvider(e.target.value)}
                >
                  {PROVIDERS.options.map((p) => (
                    <option key={p.value} value={p.value}>
                      {t(p.label)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="models-modal-field">
                <div className="models-modal-label-row">
                  <label className="models-modal-label">
                    {t("models.modelId")}
                  </label>
                  <button
                    className="btn btn-secondary btn-sm models-provider-fetch"
                    onClick={handleFetchProviderModels}
                    disabled={modalFetching}
                    type="button"
                  >
                    {modalFetching ? (
                      <Spinner className="models-fetch-spin" size={13} />
                    ) : (
                      <Refresh size={13} />
                    )}
                    {modalFetching
                      ? t("models.fetchingProviderModels")
                      : t("models.fetchProviderModels")}
                  </button>
                </div>
                {modalProviderModels.length > 0 && (
                  <select
                    className="input models-provider-select"
                    value=""
                    onChange={(e) => {
                      const selected = modalProviderModels.find(
                        (model) =>
                          modelKey(
                            model.provider,
                            model.model,
                            model.baseUrl,
                          ) === e.target.value,
                      );
                      if (selected) applyDiscoveredModel(selected);
                    }}
                  >
                    <option value="">{t("models.selectFetchedModel")}</option>
                    {modalProviderModels.map((model) => (
                      <option
                        key={modelKey(
                          model.provider,
                          model.model,
                          model.baseUrl,
                        )}
                        value={modelKey(
                          model.provider,
                          model.model,
                          model.baseUrl,
                        )}
                      >
                        {model.name}
                      </option>
                    ))}
                  </select>
                )}
                <input
                  className="input"
                  type="text"
                  value={formModel}
                  onChange={(e) => setFormModel(e.target.value)}
                  placeholder={t("models.modelIdPlaceholder")}
                />
                {modalProviderModels.length > 0 && (
                  <span className="models-modal-hint">
                    {t("models.providerModelsHint")}
                  </span>
                )}
              </div>

              <div className="models-modal-field">
                <label className="models-modal-label">
                  {t("common.baseUrl")} ({t("common.optional")})
                </label>
                <input
                  className="input"
                  type="text"
                  value={formBaseUrl}
                  onChange={(e) => setFormBaseUrl(e.target.value)}
                  placeholder={t("models.baseUrlPlaceholder")}
                />
                <span className="models-modal-hint">
                  {t("models.customProviderHint")}
                </span>
              </div>

              {formProvider === "custom" && (
                <div className="models-modal-field">
                  <label className="models-modal-label">
                    {t("models.apiKeyLabel")} ({t("common.optional")})
                  </label>
                  <div className="setup-input-group">
                    <input
                      className="input"
                      type={showApiKey ? "text" : "password"}
                      value={formApiKey}
                      onChange={(e) => setFormApiKey(e.target.value)}
                      placeholder="sk-..."
                    />
                    <button
                      className="setup-toggle-visibility"
                      onClick={() => setShowApiKey(!showApiKey)}
                      type="button"
                    >
                      {showApiKey ? t("common.hide") : t("common.show")}
                    </button>
                  </div>
                  <span className="models-modal-hint">
                    {t("models.apiKeyHint")}
                  </span>
                </div>
              )}

              {formError && <div className="models-error">{formError}</div>}
            </div>

            <div className="models-modal-footer">
              <button className="btn btn-secondary btn-sm" onClick={closeModal}>
                {t("common.cancel")}
              </button>
              <button className="btn btn-primary btn-sm" onClick={handleSave}>
                {editingModel ? t("models.update") : t("models.addModel")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Models;
