import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import {
  ThreadNotFoundError,
  type ThreadListOptions,
  type ThreadListResult,
  type ThreadMeta,
  type ThreadStatus,
  type ThreadStore,
} from "../types.js";

const DEFAULT_TITLE = "New conversation";

type Row = {
  id: string;
  agent_id: string;
  title: string;
  status: ThreadStatus;
  created_at: number;
  updated_at: number;
};

function toMeta(row: Row): ThreadMeta {
  return {
    id: row.id,
    agentId: row.agent_id,
    title: row.title,
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function decodeCursor(cursor?: string): { updatedAt: number; id: string } | undefined {
  if (!cursor) return undefined;
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { updatedAt?: unknown; id?: unknown };
    if (typeof value.updatedAt === "number" && typeof value.id === "string") return value as { updatedAt: number; id: string };
  } catch {
    return undefined;
  }
  return undefined;
}

function encodeCursor(row: Row): string {
  return Buffer.from(JSON.stringify({ updatedAt: row.updated_at, id: row.id })).toString("base64url");
}

export interface SqliteThreadStoreOptions {
  path: string;
}

export class SqliteThreadStore implements ThreadStore {
  private readonly db: Database.Database;

  constructor(options: SqliteThreadStoreOptions) {
    mkdirSync(dirname(options.path), { recursive: true });
    this.db = new Database(options.path);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS thread_manager_threads (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('idle','running','deleting')),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_thread_manager_threads_agent_updated
        ON thread_manager_threads(agent_id, updated_at DESC, id DESC);
    `);
  }

  async create(agentId: string, threadId = randomUUID()): Promise<ThreadMeta> {
    const now = Date.now();
    this.db.prepare(`
      INSERT OR IGNORE INTO thread_manager_threads
        (id, agent_id, title, status, created_at, updated_at)
      VALUES (?, ?, ?, 'idle', ?, ?)
    `).run(threadId, agentId, DEFAULT_TITLE, now, now);
    return this.mustGet(threadId);
  }

  async get(threadId: string): Promise<ThreadMeta | null> {
    const row = this.db.prepare("SELECT * FROM thread_manager_threads WHERE id = ?").get(threadId) as Row | undefined;
    return row ? toMeta(row) : null;
  }

  async list(options: ThreadListOptions): Promise<ThreadListResult> {
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
    const cursor = decodeCursor(options.cursor);
    const where: string[] = [];
    const params: unknown[] = [];
    if (options.agentId) {
      where.push("agent_id = ?");
      params.push(options.agentId);
    }
    if (cursor) {
      where.push("(updated_at < ? OR (updated_at = ? AND id < ?))");
      params.push(cursor.updatedAt, cursor.updatedAt, cursor.id);
    }
    const rows = this.db.prepare(`
      SELECT * FROM thread_manager_threads
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY updated_at DESC, id DESC
      LIMIT ?
    `).all(...params, limit + 1) as Row[];
    const page = rows.slice(0, limit);
    return {
      threads: page.map(toMeta),
      nextCursor: rows.length > limit ? encodeCursor(page[page.length - 1]!) : null,
    };
  }

  async rename(threadId: string, title: string): Promise<ThreadMeta> {
    this.mustGet(threadId);
    this.db.prepare("UPDATE thread_manager_threads SET title = ?, updated_at = ? WHERE id = ?")
      .run(title, Date.now(), threadId);
    return this.mustGet(threadId);
  }

  async renameIfTitle(
    threadId: string,
    expectedTitle: string,
    title: string,
  ): Promise<ThreadMeta | null> {
    this.mustGet(threadId);
    const result = this.db.prepare(`
      UPDATE thread_manager_threads
      SET title = ?, updated_at = ?
      WHERE id = ? AND title = ?
    `).run(title, Date.now(), threadId, expectedTitle);
    return result.changes > 0 ? this.mustGet(threadId) : null;
  }

  async touch(threadId: string): Promise<ThreadMeta> {
    this.mustGet(threadId);
    this.db.prepare("UPDATE thread_manager_threads SET updated_at = ? WHERE id = ?").run(Date.now(), threadId);
    return this.mustGet(threadId);
  }

  async setStatus(threadId: string, status: ThreadStatus): Promise<ThreadMeta> {
    this.mustGet(threadId);
    this.db.prepare("UPDATE thread_manager_threads SET status = ?, updated_at = ? WHERE id = ?")
      .run(status, Date.now(), threadId);
    return this.mustGet(threadId);
  }

  async delete(threadId: string): Promise<void> {
    this.mustGet(threadId);
    this.db.prepare("DELETE FROM thread_manager_threads WHERE id = ?").run(threadId);
  }

  close(): void {
    this.db.close();
  }

  private mustGet(threadId: string): ThreadMeta {
    const row = this.db.prepare("SELECT * FROM thread_manager_threads WHERE id = ?").get(threadId) as Row | undefined;
    if (!row) throw new ThreadNotFoundError(threadId);
    return toMeta(row);
  }
}
