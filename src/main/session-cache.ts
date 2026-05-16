import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { HERMES_HOME, getProfilePath } from "./installer";
import { safeWriteFile } from "./utils";
import Database from "better-sqlite3";
import { t } from "../shared/i18n";
import { getAppLocale } from "./locale";

const CACHE_DIR = join(HERMES_HOME, "desktop");
const CACHE_FILE = join(CACHE_DIR, "sessions.json");

/**
 * Return all state.db paths that exist on disk, across all profiles and
 * the top-level DB. syncSessionCache() aggregates sessions from all of
 * them so the session list is always complete.
 */
function candidateDbPaths(): string[] {
  const paths: string[] = [];

  const topLevel = join(HERMES_HOME, "state.db");
  if (existsSync(topLevel)) paths.push(topLevel);

  try {
    const { readdirSync } = require("fs");
    const profilesDir = join(HERMES_HOME, "profiles");
    if (existsSync(profilesDir)) {
      for (const dir of readdirSync(profilesDir)) {
        const candidate = join(profilesDir, dir, "state.db");
        if (existsSync(candidate) && !paths.includes(candidate)) {
          paths.push(candidate);
        }
      }
    }
  } catch {
    // non-fatal
  }

  return paths;
}

export interface CachedSession {
  id: string;
  title: string;
  startedAt: number;
  source: string;
  messageCount: number;
  model: string;
}

interface CacheData {
  sessions: CachedSession[];
  lastSync: number;
}

// Generate a short, readable title from the first user message (like ChatGPT/Claude)
function generateTitle(message: string): string {
  if (!message || !message.trim())
    return t("sessions.newConversation", getAppLocale());

  // Clean up the message
  let text = message.trim();

  // Remove markdown formatting
  text = text.replace(/[#*_`~\[\]()]/g, "");
  // Remove URLs
  text = text.replace(/https?:\/\/\S+/g, "");
  // Remove extra whitespace
  text = text.replace(/\s+/g, " ").trim();

  if (!text) return t("sessions.newConversation", getAppLocale());

  // If short enough, use as-is
  if (text.length <= 50) return text;

  // Take first meaningful chunk — aim for ~40-50 chars at word boundary
  const words = text.split(" ");
  let title = "";
  for (const word of words) {
    if ((title + " " + word).trim().length > 45) break;
    title = (title + " " + word).trim();
  }

  return title || text.slice(0, 45) + "...";
}

function readCache(): CacheData {
  try {
    if (!existsSync(CACHE_FILE)) return { sessions: [], lastSync: 0 };
    return JSON.parse(readFileSync(CACHE_FILE, "utf-8"));
  } catch {
    return { sessions: [], lastSync: 0 };
  }
}

function writeCache(data: CacheData): void {
  try {
    safeWriteFile(CACHE_FILE, JSON.stringify(data));
  } catch {
    // non-fatal
  }
}

function getDb(): Database.Database | null {
  const paths = candidateDbPaths();
  if (paths.length === 0) return null;
  return new Database(paths[0], { readonly: true });
}

/**
 * Sync one DB file into sessionMap (upsert).
 * New sessions are inserted; existing sessions have their messageCount updated.
 * Title preservation: if the cached title is already meaningful (not the
 * default placeholder), keep it — this prevents renamed sessions from
 * reverting to generated titles on the next sync.
 */
function syncOneDb(
  dbPath: string,
  lastSync: number,
  sessionMap: Map<string, CachedSession>,
): void {
  let db: Database.Database | null = null;
  try {
    db = new Database(dbPath, { readonly: true });
    const rows = db
      .prepare(
        `SELECT s.id, s.started_at, s.source, s.message_count, s.model, s.title
         FROM sessions s
         WHERE s.updated_at > ?
         ORDER BY s.updated_at DESC`,
      )
      .all(lastSync > 0 ? lastSync - 300 : 0) as Array<{
      id: string;
      started_at: number;
      source: string;
      message_count: number;
      model: string;
      title: string | null;
    }>;

    const defaultTitle = t("sessions.newConversation", getAppLocale());

    for (const row of rows) {
      const existing = sessionMap.get(row.id);

      // Determine best title: prefer a cached, non-default title (user may
      // have renamed the session) over re-generating from DB.
      let title = row.title || "";
      if (!title || title === defaultTitle) {
        if (existing?.title && existing.title !== defaultTitle) {
          title = existing.title;
        } else {
          try {
            const msg = db
              .prepare(
                `SELECT content FROM messages
                 WHERE session_id = ? AND role IN ('user', 'human') AND content IS NOT NULL
                 ORDER BY timestamp, id LIMIT 1`,
              )
              .get(row.id) as { content: string } | undefined;
            title = msg
              ? generateTitle(msg.content)
              : existing?.title || defaultTitle;
          } catch {
            title = existing?.title || defaultTitle;
          }
        }
      }

      sessionMap.set(row.id, {
        id: row.id,
        title,
        startedAt: row.started_at,
        source: row.source,
        messageCount: row.message_count,
        model: row.model || "",
      });
    }
  } catch {
    // DB may have a different schema — skip silently
  } finally {
    db?.close();
  }
}

// Sync from ALL hermes DBs to local cache — aggregates sessions across profiles
export function syncSessionCache(): CachedSession[] {
  const cache = readCache();
  const dbPaths = candidateDbPaths();
  if (dbPaths.length === 0) return cache.sessions;

  try {
    // Seed the map with what we already have cached. syncOneDb upserts into
    // this map, so existing sessions get their messageCount refreshed and new
    // sessions are inserted — all in a single pass with no separate merge step.
    const sessionMap = new Map<string, CachedSession>();
    for (const s of cache.sessions) sessionMap.set(s.id, s);

    for (const dbPath of dbPaths) {
      syncOneDb(dbPath, cache.lastSync, sessionMap);
    }

    const allSessions = Array.from(sessionMap.values());
    allSessions.sort((a, b) => b.startedAt - a.startedAt);

    const updated: CacheData = {
      sessions: allSessions,
      lastSync: Math.floor(Date.now() / 1000),
    };
    writeCache(updated);
    return updated.sessions;
  } catch {
    return cache.sessions;
  }
}

// Fast read from cache only (no DB access)
export function listCachedSessions(
  limit = 50,
  offset = 0,
): CachedSession[] {
  const cache = readCache();
  return cache.sessions.slice(offset, offset + limit);
}

// Update title for a specific session
export function updateSessionTitle(
  sessionId: string,
  title: string,
): void {
  const cache = readCache();
  const idx = cache.sessions.findIndex((s) => s.id === sessionId);
  if (idx >= 0) {
    cache.sessions[idx].title = title;
    writeCache(cache);
  }
}

// Remove a session from the JSON cache
export function removeSessionFromCache(sessionId: string): void {
  const cache = readCache();
  cache.sessions = cache.sessions.filter((s) => s.id !== sessionId);
  writeCache(cache);
}
