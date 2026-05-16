import Database from "better-sqlite3";
import { join } from "path";
import { existsSync } from "fs";
import { HERMES_HOME, getProfilePath } from "./installer";
import { removeSessionFromCache } from "./session-cache";

/**
 * All candidate DB paths, in priority order:
 *   1. Active profile DB (~/.hermes/profiles/<profile>/state.db)
 *   2. Top-level ~/.hermes/state.db  (default hermes-agent write target)
 *   3. Any other profile subdirectories
 *
 * We try each in order and return the first one that exists on disk.
 * For getSessionMessages we go further and try ALL of them until we
 * find one that actually contains the requested session — this handles
 * the case where the JSON session cache was built from a different DB
 * than the one resolveDbPath() would pick first.
 */
function candidateDbPaths(): string[] {
  const paths: string[] = [];
  const profile = getProfilePath();
  const profileDb = join(profile, "state.db");
  if (existsSync(profileDb)) paths.push(profileDb);

  const topLevel = join(HERMES_HOME, "state.db");
  if (existsSync(topLevel) && !paths.includes(topLevel)) paths.push(topLevel);

  // Also try "default" profile explicitly
  const defaultDb = join(HERMES_HOME, "profiles", "default", "state.db");
  if (existsSync(defaultDb) && !paths.includes(defaultDb)) paths.push(defaultDb);

  // Scan all profile subdirs we haven't covered yet
  try {
    const profilesDir = join(HERMES_HOME, "profiles");
    if (existsSync(profilesDir)) {
      const { readdirSync } = require("fs");
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

function resolveDbPath(): string {
  const candidates = candidateDbPaths();
  return candidates[0] ?? join(HERMES_HOME, "state.db");
}

function getDb(): Database.Database | null {
  const dbPath = resolveDbPath();
  if (!existsSync(dbPath)) return null;
  return new Database(dbPath, { readonly: true });
}

export interface SessionSummary {
  id: string;
  source: string;
  startedAt: number;
  endedAt: number | null;
  messageCount: number;
  model: string;
  title: string | null;
  preview: string;
}

export interface SessionMessage {
  id: number;
  role: "user" | "assistant" | "tool";
  content: string;
  timestamp: number;
}

export interface SearchResult {
  sessionId: string;
  title: string | null;
  startedAt: number;
  source: string;
  messageCount: number;
  model: string;
  snippet: string;
}

export function listSessions(limit = 30, offset = 0): SessionSummary[] {
  const db = getDb();
  if (!db) return [];

  try {
    const rows = db
      .prepare(
        `SELECT
          s.id,
          s.source,
          s.started_at,
          s.ended_at,
          s.message_count,
          s.model,
          s.title
        FROM sessions s
        ORDER BY s.started_at DESC
        LIMIT ? OFFSET ?`,
      )
      .all(limit, offset) as Array<{
      id: string;
      source: string;
      started_at: number;
      ended_at: number | null;
      message_count: number;
      model: string;
      title: string | null;
    }>;

    return rows.map((r) => ({
      id: r.id,
      source: r.source,
      startedAt: r.started_at,
      endedAt: r.ended_at,
      messageCount: r.message_count,
      model: r.model || "",
      title: r.title,
      preview: "",
    }));
  } finally {
    db.close();
  }
}

export function searchSessions(query: string, limit = 20): SearchResult[] {
  const db = getDb();
  if (!db) return [];

  try {
    // Check if FTS table exists
    const tableCheck = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='messages_fts'",
      )
      .get() as { name: string } | undefined;

    if (!tableCheck) return [];

    const sanitized = query
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 0)
      .map((w) => `"${w.replace(/"/g, "")}"*`)
      .join(" ");

    if (!sanitized) return [];

    const rows = db
      .prepare(
        `SELECT DISTINCT
          m.session_id,
          s.title,
          s.started_at,
          s.source,
          s.message_count,
          s.model,
          snippet(messages_fts, 0, '<<', '>>', '...', 40) as snippet
        FROM messages_fts
        JOIN messages m ON m.id = messages_fts.rowid
        JOIN sessions s ON s.id = m.session_id
        WHERE messages_fts MATCH ?
        ORDER BY rank
        LIMIT ?`,
      )
      .all(sanitized, limit) as Array<{
      session_id: string;
      title: string | null;
      started_at: number;
      source: string;
      message_count: number;
      model: string;
      snippet: string;
    }>;

    return rows.map((r) => ({
      sessionId: r.session_id,
      title: r.title,
      startedAt: r.started_at,
      source: r.source,
      messageCount: r.message_count,
      model: r.model || "",
      snippet: r.snippet || "",
    }));
  } catch {
    return [];
  } finally {
    db.close();
  }
}

/**
 * Try every candidate DB until one returns messages for this session.
 * This handles the case where the session cache was built from a different
 * DB than the one resolveDbPath() picks (e.g. sessions created under a
 * different profile than the currently active one).
 */
export function getSessionMessages(sessionId: string): SessionMessage[] {
  const QUERY = `
    SELECT id, role, content, timestamp
    FROM messages
    WHERE session_id = ?
      AND role IN ('user', 'assistant', 'human', 'ai')
      AND content IS NOT NULL
    ORDER BY timestamp, id`;

  for (const dbPath of candidateDbPaths()) {
    let db: Database.Database | null = null;
    try {
      db = new Database(dbPath, { readonly: true });
      const rows = db.prepare(QUERY).all(sessionId) as Array<{
        id: number;
        role: string;
        content: string;
        timestamp: number;
      }>;

      if (rows.length > 0) {
        return rows.map((r) => ({
          id: r.id,
          // Normalise to standard roles
          role: (r.role === "human" ? "user" : r.role === "ai" ? "assistant" : r.role) as
            | "user"
            | "assistant",
          content: r.content,
          timestamp: r.timestamp,
        }));
      }
    } catch {
      // DB may not have a messages table — try next
    } finally {
      db?.close();
    }
  }

  return [];
}

/**
 * Delete a session (and its messages) from ALL candidate DBs, then
 * remove it from the local JSON cache.
 */
export function deleteSession(sessionId: string): void {
  for (const dbPath of candidateDbPaths()) {
    let db: Database.Database | null = null;
    try {
      db = new Database(dbPath);
      db.prepare("DELETE FROM messages WHERE session_id = ?").run(sessionId);
      db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
    } catch {
      // DB may not have these tables — skip silently
    } finally {
      db?.close();
    }
  }
  removeSessionFromCache(sessionId);
}
