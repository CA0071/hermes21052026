import { getApiUrl, getRemoteAuthHeader } from "./hermes";

export async function remoteManage<T>(method: string, params: Record<string, unknown>): Promise<T> {
  const url = `${getApiUrl()}/manage`;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { net } = require("electron") as typeof import("electron");

  const res = await net.fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(getRemoteAuthHeader() as Record<string, string>),
    },
    body: JSON.stringify({ method, params }),
    signal: AbortSignal.timeout(30000),
  });

  const data = await res.json() as { result?: T; error?: string };
  if (!res.ok || data.error) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data.result as T;
}
