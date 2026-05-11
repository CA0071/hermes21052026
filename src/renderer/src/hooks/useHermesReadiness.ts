import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../components/useI18n";
import { SUBSCRIPTION_PROVIDERS } from "../constants";
import {
  createHermesReadinessSnapshot,
  type ConnectionMode,
  type CredentialPoolSnapshot,
  type InstallStatusSnapshot,
  type ModelConfigSnapshot,
  type ProfileSnapshot,
  type ProviderAuthStatusMap,
  type ReadinessSource,
} from "../lib/readiness";

type UseHermesReadinessOptions = {
  profile?: string;
  connectionMode?: ConnectionMode;
  remoteUrl?: string;
  hermesVersion?: string | null;
};

type ReadinessData = Omit<
  ReadinessSource,
  "profile" | "connMode" | "connRemoteUrl" | "hermesVersion"
> & {
  connMode: ConnectionMode;
  connRemoteUrl: string;
  hermesVersion: string | null;
};

const INITIAL_DATA: ReadinessData = {
  installStatus: null,
  modelConfig: null,
  profiles: [],
  env: {},
  credentialPool: {},
  providerAuth: {},
  gatewayRunning: null,
  connMode: "local",
  connRemoteUrl: "",
  hermesVersion: null,
};

export function useHermesReadiness({
  profile,
  connectionMode,
  remoteUrl,
  hermesVersion,
}: UseHermesReadinessOptions): {
  loading: boolean;
  refresh: () => Promise<void>;
  source: ReadinessSource;
  snapshot: ReturnType<typeof createHermesReadinessSnapshot>;
} {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ReadinessData>(INITIAL_DATA);
  const requestIdRef = useRef(0);
  const hasConnectionOverride = connectionMode !== undefined;
  const hasVersionOverride = hermesVersion !== undefined;

  const refresh = useCallback(async (): Promise<void> => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);

    try {
      const [
        install,
        model,
        profileList,
        env,
        credentialPool,
        gateway,
        connection,
        version,
        providerAuthEntries,
      ] = await Promise.all([
        window.hermesAPI.checkInstall().catch(() => null),
        window.hermesAPI.getModelConfig(profile).catch(() => null),
        window.hermesAPI.listProfiles().catch(() => []),
        window.hermesAPI.getEnv(profile).catch(() => ({})),
        window.hermesAPI.getCredentialPool().catch(() => ({})),
        window.hermesAPI.gatewayStatus().catch(() => null),
        hasConnectionOverride
          ? Promise.resolve(null)
          : window.hermesAPI.getConnectionConfig().catch(() => null),
        hasVersionOverride
          ? Promise.resolve(null)
          : window.hermesAPI.getHermesVersion().catch(() => null),
        Promise.all(
          SUBSCRIPTION_PROVIDERS.map(async (provider) => {
            try {
              const auth = await window.hermesAPI.getProviderAuthStatus(
                provider.id,
              );
              return [
                provider.id,
                {
                  authenticated: auth.authenticated,
                  detail: auth.detail,
                },
              ] as const;
            } catch (err) {
              return [
                provider.id,
                {
                  authenticated: false,
                  detail: (err as Error).message,
                },
              ] as const;
            }
          }),
        ),
      ]);
      const providerAuth = Object.fromEntries(
        providerAuthEntries,
      ) as ProviderAuthStatusMap;

      if (requestIdRef.current !== requestId) return;

      setData((prev) => ({
        installStatus: install as InstallStatusSnapshot | null,
        modelConfig: model as ModelConfigSnapshot | null,
        profiles: profileList as ProfileSnapshot[],
        env: env as Record<string, string>,
        credentialPool: credentialPool as CredentialPoolSnapshot,
        providerAuth,
        gatewayRunning: gateway,
        connMode: connection?.mode ?? prev.connMode ?? "local",
        connRemoteUrl: connection?.remoteUrl ?? prev.connRemoteUrl ?? "",
        hermesVersion: version ?? prev.hermesVersion,
      }));
    } finally {
      if (requestIdRef.current === requestId) {
        setLoading(false);
      }
    }
  }, [hasConnectionOverride, hasVersionOverride, profile]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        void refresh();
      }
    });
    return () => {
      cancelled = true;
      requestIdRef.current += 1;
    };
  }, [refresh]);

  const source = useMemo<ReadinessSource>(
    () => ({
      profile,
      installStatus: data.installStatus,
      modelConfig: data.modelConfig,
      profiles: data.profiles,
      env: data.env,
      credentialPool: data.credentialPool,
      providerAuth: data.providerAuth,
      gatewayRunning: data.gatewayRunning,
      connMode: connectionMode ?? data.connMode,
      connRemoteUrl: remoteUrl ?? data.connRemoteUrl,
      hermesVersion: hasVersionOverride
        ? (hermesVersion ?? null)
        : data.hermesVersion,
    }),
    [
      connectionMode,
      data,
      hasVersionOverride,
      hermesVersion,
      profile,
      remoteUrl,
    ],
  );

  const snapshot = useMemo(
    () => createHermesReadinessSnapshot(source, t),
    [source, t],
  );

  return {
    loading,
    refresh,
    source,
    snapshot,
  };
}
