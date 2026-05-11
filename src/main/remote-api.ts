import { getApiUrl, getRemoteAuthHeader } from "./hermes";
import type { MemoryInfo } from "./memory";
import type { ProfileInfo } from "./profiles";
import type { CachedSession } from "./session-cache";
import type { SessionMessage, SessionSummary, SearchResult } from "./sessions";
import type { InstalledSkill, SkillSearchResult } from "./skills";
import type { ToolsetInfo } from "./tools";

type JsonRecord = Record<string, unknown>;
const REMOTE_CONVERSATION_SOURCE = "api_server";

function withProfile(path: string, profile?: string): string {
  if (!profile) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}profile=${encodeURIComponent(profile)}`;
}

async function remoteFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = {
    ...getRemoteAuthHeader(),
    ...((init.headers as Record<string, string>) || {}),
  };
  return fetch(`${getApiUrl()}${path}`, { ...init, headers });
}

async function remoteJson<T = JsonRecord>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await remoteFetch(path, init);
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as {
        error?: string | { message?: string };
        detail?: string;
      };
      if (typeof body.error === "string") message = body.error;
      else if (body.error?.message) message = body.error.message;
      else if (body.detail) message = body.detail;
    } catch {
      // keep HTTP status fallback
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

function postJson(path: string, body: unknown): Promise<JsonRecord> {
  return remoteJson(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function putJson(path: string, body: unknown): Promise<JsonRecord> {
  return remoteJson(path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function num(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export async function remoteGatewayStatus(): Promise<boolean> {
  try {
    const body = await remoteJson<{ ok?: boolean; status?: string }>(
      "/api/gateway/status",
    );
    return body.ok === true || body.status === "ok";
  } catch {
    return false;
  }
}

export async function remoteListSessions(
  limit = 30,
  offset = 0,
  profile?: string,
): Promise<SessionSummary[]> {
  const path = withProfile(
    `/api/sessions?limit=${limit}&offset=${offset}&source=${REMOTE_CONVERSATION_SOURCE}`,
    profile,
  );
  const body = await remoteJson<{ sessions?: JsonRecord[] }>(path);
  return (body.sessions || []).map((s) => ({
    id: str(s.id),
    source: str(s.source),
    startedAt: num(s.startedAt ?? s.started_at),
    endedAt:
      typeof (s.endedAt ?? s.ended_at) === "number"
        ? ((s.endedAt ?? s.ended_at) as number)
        : null,
    messageCount: num(s.messageCount ?? s.message_count),
    model: str(s.model),
    title: typeof s.title === "string" ? s.title : null,
    preview: str(s.preview),
  }));
}

export async function remoteSearchSessions(
  query: string,
  limit = 20,
  profile?: string,
): Promise<SearchResult[]> {
  const path = withProfile(
    `/api/sessions/search?q=${encodeURIComponent(query)}&limit=${limit}&source=${REMOTE_CONVERSATION_SOURCE}`,
    profile,
  );
  const body = await remoteJson<{ results?: JsonRecord[] }>(path);
  return (body.results || []).map((r) => ({
    sessionId: str(r.sessionId ?? r.session_id),
    title: typeof r.title === "string" ? r.title : null,
    startedAt: num(r.startedAt ?? r.started_at ?? r.session_started),
    source: str(r.source),
    messageCount: num(r.messageCount ?? r.message_count),
    model: str(r.model),
    snippet: str(r.snippet),
  }));
}

export async function remoteListCachedSessions(
  limit = 50,
  offset = 0,
  profile?: string,
): Promise<CachedSession[]> {
  const sessions = await remoteListSessions(limit, offset, profile);
  return sessions.map((s) => ({
    id: s.id,
    title: s.title || s.preview || "New conversation",
    startedAt: s.startedAt,
    source: s.source,
    messageCount: s.messageCount,
    model: s.model,
  }));
}

export async function remoteGetSessionMessages(
  sessionId: string,
  profile?: string,
): Promise<SessionMessage[]> {
  const path = withProfile(
    `/api/sessions/${encodeURIComponent(sessionId)}/messages`,
    profile,
  );
  const body = await remoteJson<{ messages?: JsonRecord[] }>(path);
  return (body.messages || [])
    .filter((m) => ["user", "assistant", "tool"].includes(str(m.role)))
    .map((m) => ({
      id: num(m.id),
      role: str(m.role) as SessionMessage["role"],
      content: str(m.content),
      timestamp: num(m.timestamp),
    }));
}

export async function remoteListProfiles(): Promise<ProfileInfo[]> {
  const body = await remoteJson<{ profiles?: JsonRecord[] }>("/api/profiles");
  return (body.profiles || []).map((p) => ({
    name: str(p.name),
    path: str(p.path),
    isDefault: Boolean(p.isDefault ?? p.is_default),
    isActive: Boolean(p.isActive ?? p.is_active),
    model: str(p.model),
    provider: str(p.provider),
    hasEnv: Boolean(p.hasEnv ?? p.has_env),
    hasSoul: Boolean(p.hasSoul ?? p.has_soul),
    skillCount: num(p.skillCount ?? p.skill_count),
    gatewayRunning: Boolean(p.gatewayRunning ?? p.gateway_running),
  }));
}

export async function remoteCreateProfile(
  name: string,
  clone: boolean,
): Promise<{ success: boolean; error?: string }> {
  try {
    await postJson("/api/profiles", { name, clone });
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function remoteDeleteProfile(
  name: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await remoteJson(`/api/profiles/${encodeURIComponent(name)}`, {
      method: "DELETE",
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function remoteSetActiveProfile(name: string): Promise<boolean> {
  await postJson(`/api/profiles/${encodeURIComponent(name)}/activate`, {});
  return true;
}

export async function remoteReadMemory(profile?: string): Promise<MemoryInfo> {
  return remoteJson<MemoryInfo>(withProfile("/api/memory", profile));
}

export async function remoteAddMemoryEntry(
  content: string,
  profile?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await postJson(withProfile("/api/memory/entries", profile), { content });
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function remoteUpdateMemoryEntry(
  index: number,
  content: string,
  profile?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await putJson(withProfile(`/api/memory/entries/${index}`, profile), { content });
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function remoteRemoveMemoryEntry(
  index: number,
  profile?: string,
): Promise<boolean> {
  const res = await remoteFetch(withProfile(`/api/memory/entries/${index}`, profile), {
    method: "DELETE",
  });
  return res.ok;
}

export async function remoteWriteUserProfile(
  content: string,
  profile?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await putJson(withProfile("/api/memory/user", profile), { content });
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function remoteReadSoul(profile?: string): Promise<string> {
  const target = profile || "current";
  const body = await remoteJson<{ content?: string }>(
    `/api/profiles/${encodeURIComponent(target)}/soul`,
  );
  return body.content || "";
}

export async function remoteWriteSoul(
  content: string,
  profile?: string,
): Promise<boolean> {
  const target = profile || "current";
  await putJson(`/api/profiles/${encodeURIComponent(target)}/soul`, { content });
  return true;
}

export async function remoteResetSoul(profile?: string): Promise<string> {
  const target = profile || "current";
  const body = await postJson(
    `/api/profiles/${encodeURIComponent(target)}/soul/reset`,
    {},
  );
  return typeof body.content === "string" ? body.content : "";
}

export async function remoteGetToolsets(profile?: string): Promise<ToolsetInfo[]> {
  const body = await remoteJson<{ toolsets?: JsonRecord[] }>(
    withProfile("/api/tools/toolsets", profile),
  );
  return (body.toolsets || []).map((t) => ({
    key: str(t.key ?? t.name),
    label: str(t.label ?? t.key ?? t.name),
    description: str(t.description),
    enabled: Boolean(t.enabled),
  }));
}

export async function remoteSetToolsetEnabled(
  key: string,
  enabled: boolean,
  profile?: string,
): Promise<boolean> {
  await putJson(withProfile(`/api/tools/toolsets/${encodeURIComponent(key)}`, profile), {
    enabled,
  });
  return true;
}

export async function remoteListInstalledSkills(
  profile?: string,
): Promise<InstalledSkill[]> {
  const body = await remoteJson<{ skills?: JsonRecord[] }>(
    withProfile("/api/skills/installed", profile),
  );
  return (body.skills || []).map((s) => ({
    name: str(s.name ?? s.slug),
    category: str(s.category),
    description: str(s.description),
    path: str(s.path),
  }));
}

export async function remoteListBundledSkills(): Promise<SkillSearchResult[]> {
  const body = await remoteJson<{ skills?: JsonRecord[] }>("/api/skills/bundled");
  return (body.skills || []).map((s) => ({
    name: str(s.name ?? s.slug),
    description: str(s.description),
    category: str(s.category),
    source: str(s.source || "bundled"),
    installed: false,
  }));
}

export async function remoteGetSkillContent(
  skillPath: string,
  profile?: string,
): Promise<string> {
  const body = await remoteJson<{ content?: string }>(
    withProfile(`/api/skills/content?path=${encodeURIComponent(skillPath)}`, profile),
  );
  return body.content || "";
}

export function remoteUnsupported(
  feature: string,
): { success: boolean; error: string } {
  return {
    success: false,
    error: `${feature} is not supported by the remote Hermes API yet.`,
  };
}
