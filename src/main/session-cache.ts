import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { HERMES_HOME } from "./installer";
import { safeWriteFile } from "./utils";
import Database from "better-sqlite3";
import { t } from "../shared/i18n";
import { getAppLocale } from "./locale";

const CACHE_DIR = join(HERMES_HOME, "desktop");
const CACHE_FILE = join(CACHE_DIR, "sessions.json");
const DB_PATH = join(HERMES_HOME, "state.db");

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
  if (!existsSync(DB_PATH)) return null;
  return new Database(DB_PATH, { readonly: true });
}

// Sync from hermes DB to local cache — only fetches new/updated sessions
export function syncSessionCache(): CachedSession[] {
  const cache = readCache();
  const db = getDb();
  if (!db) return cache.sessions;

  try {
    // Fetch sessions newer than last sync, or all if first sync
    const rows = db
      .prepare(
        `SELECT s.id, s.started_at, s.source, s.message_count, s.model, s.title
         FROM sessions s 
         WHERE s.updated_at > ?
         ORDER BY s.updated_at DESC`,
      )
      .all(cache.lastSync > 0 ? cache.lastSync - 300000 : 0) as Array<{
      id: string;
      started_at: number;
      source: string;
      message_count: number;
      model: string;
      title: string | null;
    }>;

    // Index existing sessions by id once so the per-row update below is
    // O(1) instead of O(N). Without this, syncing N existing sessions
    // against N new rows is O(N²) and visibly slows app startup once a
    // user has accumulated thousands of sessions (issue #16).
    const sessionMap = new Map<string, CachedSession>();
    for (const s of cache.sessions) sessionMap.set(s.id, s);

    for (const row of rows) {
      // Generate title from first user message
      let title = row.title;
      if (!title || title.startsWith("New conversation")) {
        const existing = sessionMap.get(row.id);
        if (existing && existing.title && !existing.title.startsWith("New conversation")) {
          title = existing.title;
        } else {
          try {
            const msg = db
              .prepare(
                `SELECT content FROM messages 
                 WHERE session_id = ? AND role = 'user' AND content IS NOT NULL 
                 ORDER BY timestamp, id LIMIT 1`,
              )
              .get(row.id) as { content: string } | undefined;
            if (msg && msg.content) {
              title = generateTitle(msg.content);
            } else {
              // Keep the existing title if there's no new message content
              title = existing?.title || t("sessions.newConversation", getAppLocale());
            }
          } catch {
            title = existing?.title || t("sessions.newConversation", getAppLocale());
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

    // Convert map back to array and sort
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
  } finally {
    db.close();
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
