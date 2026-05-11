import { BROWSER_AUTH_PROVIDER_IDS, PROVIDERS } from "../constants";
import {
  createProviderModelStatusItems,
  selectedProviderStatus,
} from "./providerModelStatus";

export type ReadinessTone = "ok" | "warning" | "error" | "neutral";
export type ReadinessViewTarget =
  | "agents"
  | "models"
  | "providers"
  | "gateway"
  | "settings";

export type InstallStatusSnapshot = {
  installed: boolean;
  configured: boolean;
  hasApiKey: boolean;
  verified: boolean;
};

export type ModelConfigSnapshot = {
  provider: string;
  model: string;
  baseUrl: string;
};

export type ProfileSnapshot = {
  name: string;
  isDefault: boolean;
  isActive: boolean;
  model: string;
  provider: string;
  hasEnv: boolean;
  hasSoul: boolean;
  skillCount: number;
  gatewayRunning: boolean;
};

export type ProviderAuthSnapshot = {
  authenticated: boolean;
  detail: string;
};

export type ProviderAuthStatusMap = Record<
  string,
  ProviderAuthSnapshot | null | undefined
>;

export type CredentialPoolSnapshot = Record<
  string,
  Array<{ key: string; label: string }>
>;

export type ParsedHermesVersion = {
  version: string;
  date: string;
  python: string;
  sdk: string;
  updateInfo: string | null;
};

export type ReadinessSource = {
  profile?: string;
  installStatus: InstallStatusSnapshot | null;
  modelConfig: ModelConfigSnapshot | null;
  profiles: ProfileSnapshot[];
  env: Record<string, string>;
  credentialPool: CredentialPoolSnapshot;
  providerAuth: ProviderAuthStatusMap;
  gatewayRunning: boolean | null;
  connMode: "local" | "remote";
  connRemoteUrl: string;
  hermesVersion: string | null;
};

export type ReadinessOverviewItem = {
  id:
    | "engine"
    | "install"
    | "connection"
    | "profile"
    | "provider"
    | "model"
    | "gateway";
  label: string;
  value: string;
  badge?: string;
  tone: ReadinessTone;
  target?: ReadinessViewTarget;
  actionLabel?: string;
};

export type ChatReadinessIssue = {
  id:
    | "install-missing"
    | "install-repair"
    | "provider-signin"
    | "provider-setup"
    | "remote-url";
  tone: Exclude<ReadinessTone, "ok">;
  title: string;
  message: string;
  actionLabel: string;
  target: ReadinessViewTarget;
  blocking: boolean;
};

export type HermesReadinessSnapshot = {
  overviewItems: ReadinessOverviewItem[];
  chatIssue: ChatReadinessIssue | null;
  activeProfileName: string;
  currentProvider: string;
  currentModel: string;
  providerLabelKey: string;
  ready: boolean;
};

type Translate = (key: string, options?: Record<string, unknown>) => string;

function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function parseHermesVersion(
  hermesVersion: string | null,
): ParsedHermesVersion | null {
  if (!hermesVersion) return null;
  const version = hermesVersion.match(/v([\d.]+)/)?.[1] || "";
  const date = hermesVersion.match(/\(([\d.]+)\)/)?.[1] || "";
  const python = hermesVersion.match(/Python:\s*([\d.]+)/)?.[1] || "";
  const sdk = hermesVersion.match(/OpenAI SDK:\s*([\d.]+)/)?.[1] || "";
  const updateMatch = hermesVersion.match(
    /Update available:\s*(.+?)(?:\s*—|$)/,
  );
  const updateInfo = updateMatch?.[1]?.trim() || null;
  return { version, date, python, sdk, updateInfo };
}

export function providerLabelKey(provider: string): string {
  return (
    PROVIDERS.options.find((item) => item.value === provider)?.label || provider
  );
}

export function createHermesReadinessSnapshot(
  source: ReadinessSource,
  t: Translate,
): HermesReadinessSnapshot {
  const parsedVersion = parseHermesVersion(source.hermesVersion);
  const activeProfileName = source.profile || "default";
  const activeProfile =
    source.profiles.find((item) => item.name === activeProfileName) ||
    source.profiles.find((item) => item.isActive) ||
    source.profiles.find((item) => item.isDefault);
  const currentProvider =
    source.modelConfig?.provider || activeProfile?.provider || "auto";
  const currentModel = source.modelConfig?.model || activeProfile?.model || "";
  const currentProviderLabelKey = providerLabelKey(currentProvider);
  const currentProviderAuth = source.providerAuth[currentProvider];
  const profileGatewayRunning =
    activeProfile?.gatewayRunning ?? source.gatewayRunning ?? false;
  const currentModelConfig = {
    provider: currentProvider,
    model: currentModel,
    baseUrl: source.modelConfig?.baseUrl || "",
  };
  const currentProviderStatus = selectedProviderStatus(
    createProviderModelStatusItems({
      modelConfig: currentModelConfig,
      env: source.env,
      credentialPool: source.credentialPool,
      providerAuth: source.providerAuth,
    }),
  );
  const providerReady =
    source.connMode === "remote" ? true : Boolean(currentProviderStatus?.ready);
  const providerChecking =
    BROWSER_AUTH_PROVIDER_IDS.has(currentProvider) && !currentProviderAuth;

  const installOverview = (() => {
    if (source.installStatus === null) {
      return {
        value: t("settings.statusChecking"),
        tone: "neutral" as ReadinessTone,
      };
    }
    if (!source.installStatus.installed) {
      return {
        value: t("settings.statusNotInstalled"),
        tone: "error" as ReadinessTone,
      };
    }
    if (!source.installStatus.verified) {
      return {
        value: t("settings.statusNeedsRepair"),
        tone: "warning" as ReadinessTone,
      };
    }
    return {
      value: t("settings.statusVerified"),
      tone: "ok" as ReadinessTone,
    };
  })();

  const engineOverview = (() => {
    if (source.hermesVersion === null) {
      return {
        value: t("settings.statusChecking"),
        badge: t("settings.statusChecking"),
        tone: "neutral" as ReadinessTone,
      };
    }
    if (!parsedVersion) {
      return {
        value: t("settings.notDetected"),
        badge: t("settings.statusNeedsRepair"),
        tone: "error" as ReadinessTone,
      };
    }
    if (parsedVersion.updateInfo) {
      return {
        value: `v${parsedVersion.version}`,
        badge: t("settings.statusUpdateAvailable"),
        tone: "warning" as ReadinessTone,
      };
    }
    return {
      value: `v${parsedVersion.version}`,
      badge: t("settings.statusReady"),
      tone: "ok" as ReadinessTone,
    };
  })();

  const providerOverview = (() => {
    if (source.connMode === "remote") {
      return {
        value: t(currentProviderLabelKey),
        badge: t("settings.modeRemote"),
        tone: "neutral" as ReadinessTone,
      };
    }
    if (BROWSER_AUTH_PROVIDER_IDS.has(currentProvider)) {
      if (!currentProviderAuth) {
        return {
          value: t(currentProviderLabelKey),
          badge: t("settings.statusChecking"),
          tone: "neutral" as ReadinessTone,
        };
      }
      return {
        value: t(currentProviderLabelKey),
        badge: currentProviderAuth.authenticated
          ? t("settings.providerAuthSignedIn")
          : t("settings.providerAuthNotSignedIn"),
        tone: currentProviderAuth.authenticated
          ? ("ok" as ReadinessTone)
          : ("warning" as ReadinessTone),
      };
    }
    if (source.installStatus === null) {
      return {
        value: t(currentProviderLabelKey),
        badge: t("settings.statusChecking"),
        tone: "neutral" as ReadinessTone,
      };
    }
    return {
      value: t(currentProviderLabelKey),
      badge: providerReady
        ? t("settings.statusConfigured")
        : t("settings.statusNeedsSetup"),
      tone: providerReady
        ? ("ok" as ReadinessTone)
        : ("warning" as ReadinessTone),
    };
  })();

  const overviewItems: ReadinessOverviewItem[] = [
    {
      id: "engine",
      label: t("common.engine"),
      value: engineOverview.value,
      badge: engineOverview.badge,
      tone: engineOverview.tone,
    },
    {
      id: "install",
      label: t("settings.overviewInstall"),
      value: installOverview.value,
      tone: installOverview.tone,
    },
    {
      id: "connection",
      label: t("settings.connectionMode"),
      value:
        source.connMode === "remote"
          ? t("settings.modeRemote")
          : t("settings.modeLocal"),
      badge:
        source.connMode === "remote"
          ? source.connRemoteUrl || t("settings.modeRemote")
          : t("settings.modeLocal"),
      tone: "neutral",
    },
    {
      id: "profile",
      label: t("navigation.agents"),
      value: activeProfileName,
      badge: t("settings.statusActive"),
      tone: "ok",
      target: "agents",
      actionLabel: t("navigation.agents"),
    },
    {
      id: "provider",
      label: t("common.provider"),
      value: providerOverview.value,
      badge: providerOverview.badge,
      tone: providerOverview.tone,
      target: "providers",
      actionLabel: t("navigation.providers"),
    },
    {
      id: "model",
      label: t("common.model"),
      value: currentModel || t("settings.providerDefault"),
      badge: currentModel
        ? t("settings.statusConfigured")
        : t("settings.providerDefault"),
      tone: currentModel ? "ok" : "neutral",
      target: "models",
      actionLabel: t("navigation.models"),
    },
    {
      id: "gateway",
      label: t("navigation.gateway"),
      value: profileGatewayRunning
        ? t("settings.statusRunning")
        : t("settings.statusStopped"),
      badge: profileGatewayRunning
        ? t("settings.statusRunning")
        : t("settings.statusStopped"),
      tone: profileGatewayRunning ? "ok" : "neutral",
      target: "gateway",
      actionLabel: t("navigation.gateway"),
    },
  ];

  const chatIssue = (() => {
    if (source.connMode === "remote" && !hasText(source.connRemoteUrl)) {
      return {
        id: "remote-url" as const,
        tone: "warning" as const,
        title: t("chat.readinessRemoteTitle"),
        message: t("chat.readinessRemoteMessage"),
        actionLabel: t("navigation.settings"),
        target: "settings" as const,
        blocking: true,
      };
    }
    if (source.installStatus === null) return null;
    if (!source.installStatus.installed) {
      return {
        id: "install-missing" as const,
        tone: "error" as const,
        title: t("chat.readinessInstallMissingTitle"),
        message: t("chat.readinessInstallMissingMessage"),
        actionLabel: t("navigation.settings"),
        target: "settings" as const,
        blocking: true,
      };
    }
    if (!source.installStatus.verified) {
      return {
        id: "install-repair" as const,
        tone: "warning" as const,
        title: t("chat.readinessInstallRepairTitle"),
        message: t("chat.readinessInstallRepairMessage"),
        actionLabel: t("navigation.settings"),
        target: "settings" as const,
        blocking: true,
      };
    }
    if (
      BROWSER_AUTH_PROVIDER_IDS.has(currentProvider) &&
      currentProviderAuth &&
      !currentProviderAuth.authenticated
    ) {
      return {
        id: "provider-signin" as const,
        tone: "warning" as const,
        title: t("chat.readinessProviderSignInTitle"),
        message: t("chat.readinessProviderSignInMessage"),
        actionLabel: t("navigation.providers"),
        target: "providers" as const,
        blocking: true,
      };
    }
    if (source.connMode === "local" && !providerChecking && !providerReady) {
      return {
        id: BROWSER_AUTH_PROVIDER_IDS.has(currentProvider)
          ? ("provider-signin" as const)
          : ("provider-setup" as const),
        tone: "warning" as const,
        title: BROWSER_AUTH_PROVIDER_IDS.has(currentProvider)
          ? t("chat.readinessProviderSignInTitle")
          : t("chat.readinessProviderSetupTitle"),
        message: BROWSER_AUTH_PROVIDER_IDS.has(currentProvider)
          ? t("chat.readinessProviderSignInMessage")
          : t("chat.readinessProviderSetupMessage"),
        actionLabel: t("navigation.providers"),
        target: "providers" as const,
        blocking: true,
      };
    }
    return null;
  })();

  return {
    overviewItems,
    chatIssue,
    activeProfileName,
    currentProvider,
    currentModel,
    providerLabelKey: currentProviderLabelKey,
    ready: chatIssue === null,
  };
}
