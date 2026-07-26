import { randomUUID } from "node:crypto";
import { Pool, type PoolConfig } from "pg";
import {
  ThreadNotFoundError,
  type ThreadListOptions,
  type ThreadListResult,
  type ThreadMeta,
  type ThreadStatus,
  type ThreadStore,
} from "../types.js";

const DEFAULT_TITLE = "New conversation";

function encodeCursor(thread: ThreadMeta): string {
  return Buffer.from(JSON.stringify({ updatedAt: Date.parse(thread.updatedAt), id: thread.id })).toString("base64url");
}

export interface PostgresThreadStoreOptions {
  connectionString: string;
  schema?: string;
}

export class PostgresThreadStore implements ThreadStore {
  readonly pool: Pool;
  private readonly schema: string;
  private initialized = false;

  constructor(options: PostgresThreadStoreOptions) {
    this.pool = new Pool({ connectionString: options.connectionString } satisfies PoolConfig);
    this.schema = options.schema ?? "public";
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    const client = await this.pool.connect();
    try {
      await client.query(`CREATE SCHEMA IF NOT EXISTS "${this.schema}"`);
      await client.query(`
        CREATE TABLE IF NOT EXISTS "${this.schema}".thread_manager_threads (
          id TEXT PRIMARY KEY,
          agent_id TEXT NOT NULL,
          title TEXT NOT NULL,
          status TEXT NOT NULL CHECK(status IN ('idle','running','deleting')),
          created_at TIMESTAMPTZ NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL
        );
        CREATE INDEX IF NOT EXISTS thread_manager_threads_agent_updated
          ON "${this.schema}".thread_manager_threads(agent_id, updated_at DESC, id DESC);
      `);
      this.initialized = true;
    } finally {
      client.release();
    }
  }

  async create(agentId: string, threadId = randomUUID()): Promise<ThreadMeta> {
    await this.initialize();
    await this.pool.query(`
      INSERT INTO "${this.schema}".thread_manager_threads
        (id, agent_id, title, status, created_at, updated_at)
      VALUES ($1, $2, $3, 'idle', NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `, [threadId, agentId, DEFAULT_TITLE]);
    return this.mustGet(threadId);
  }

  async get(threadId: string): Promise<ThreadMeta | null> {
    await this.initialize();
    const result = await this.pool.query(`
      SELECT id, agent_id AS "agentId", title, status,
        created_at AS "createdAt", updated_at AS "updatedAt"
      FROM "${this.schema}".thread_manager_threads WHERE id = $1
    `, [threadId]);
    return result.rows[0] ? this.normalize(result.rows[0] as Record<string, unknown>) : null;
  }

  async list(options: ThreadListOptions): Promise<ThreadListResult> {
    await this.initialize();
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
    const params: unknown[] = [];
    const where: string[] = [];
    if (options.agentId) {
      params.push(options.agentId);
      where.push(`agent_id = $${params.length}`);
    }
    if (options.cursor) {
      let cursor: { updatedAt: number; id: string } | undefined;
      try {
        cursor = JSON.parse(Buffer.from(options.cursor, "base64url").toString("utf8")) as { updatedAt: number; id: string };
      } catch {
        cursor = undefined;
      }
      if (cursor) {
        params.push(new Date(cursor.updatedAt), new Date(cursor.updatedAt), cursor.id);
        where.push(`(updated_at < $${params.length - 2} OR (updated_at = $${params.length - 1} AND id < $${params.length}))`);
      }
    }
    params.push(limit + 1);
    const result = await this.pool.query(`
      SELECT id, agent_id AS "agentId", title, status,
        created_at AS "createdAt", updated_at AS "updatedAt"
      FROM "${this.schema}".thread_manager_threads
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY updated_at DESC, id DESC
      LIMIT $${params.length}
    `, params);
    const threads = result.rows.map((row) => this.normalize(row as Record<string, unknown>));
    return {
      threads: threads.slice(0, limit),
      nextCursor: threads.length > limit ? encodeCursor(threads[limit - 1]!) : null,
    };
  }

  async rename(threadId: string, title: string): Promise<ThreadMeta> {
    await this.mustGet(threadId);
    await this.pool.query(`UPDATE "${this.schema}".thread_manager_threads SET title = $1, updated_at = NOW() WHERE id = $2`, [title, threadId]);
    return this.mustGet(threadId);
  }

  async renameIfTitle(
    threadId: string,
    expectedTitle: string,
    title: string,
  ): Promise<ThreadMeta | null> {
    await this.mustGet(threadId);
    const result = await this.pool.query(
      `UPDATE "${this.schema}".thread_manager_threads
       SET title = $1, updated_at = NOW()
       WHERE id = $2 AND title = $3`,
      [title, threadId, expectedTitle],
    );
    return result.rowCount === 0 ? null : this.mustGet(threadId);
  }

  async touch(threadId: string): Promise<ThreadMeta> {
    await this.mustGet(threadId);
    await this.pool.query(`UPDATE "${this.schema}".thread_manager_threads SET updated_at = NOW() WHERE id = $1`, [threadId]);
    return this.mustGet(threadId);
  }

  async setStatus(threadId: string, status: ThreadStatus): Promise<ThreadMeta> {
    await this.mustGet(threadId);
    await this.pool.query(`UPDATE "${this.schema}".thread_manager_threads SET status = $1, updated_at = NOW() WHERE id = $2`, [status, threadId]);
    return this.mustGet(threadId);
  }

  async delete(threadId: string): Promise<void> {
    await this.mustGet(threadId);
    await this.pool.query(`DELETE FROM "${this.schema}".thread_manager_threads WHERE id = $1`, [threadId]);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private async mustGet(threadId: string): Promise<ThreadMeta> {
    const thread = await this.get(threadId);
    if (!thread) throw new ThreadNotFoundError(threadId);
    return thread;
  }

  private normalize(row: Record<string, unknown>): ThreadMeta {
    const createdAt = row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt);
    const updatedAt = row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt);
    return {
      id: String(row.id),
      agentId: String(row.agentId),
      title: String(row.title),
      status: row.status as ThreadStatus,
      createdAt,
      updatedAt,
    };
  }
}
