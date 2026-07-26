import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";
import type { BaseEvent } from "@ag-ui/client";
import type {
  ConversationMessage,
  MessageProjector,
  MessageStatus,
  StoreDriver,
} from "../types.js";

type EventFields = BaseEvent & {
  messageId?: string;
  role?: string;
  delta?: unknown;
  messages?: Array<{ id?: string; role?: string; content?: string }>;
};

function fields(event: BaseEvent): EventFields {
  return event as EventFields;
}

function isTextStart(event: BaseEvent): boolean {
  return String(event.type) === "TEXT_MESSAGE_START";
}

function isTextContent(event: BaseEvent): boolean {
  return String(event.type) === "TEXT_MESSAGE_CONTENT";
}

function isTextEnd(event: BaseEvent): boolean {
  return String(event.type) === "TEXT_MESSAGE_END";
}

function toMessage(row: {
  id: string;
  thread_id: string;
  run_id: string;
  role: string;
  content: string;
  status: MessageStatus;
  created_at: number;
  updated_at: number;
}): ConversationMessage {
  return {
    id: row.id,
    threadId: row.thread_id,
    runId: row.run_id,
    role: row.role,
    content: row.content,
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export class InMemoryMessageProjector implements MessageProjector {
  private readonly messages = new Map<string, ConversationMessage>();

  async apply(threadId: string, runId: string, event: BaseEvent): Promise<void> {
    const value = fields(event);
    if (String(value.type) === "MESSAGES_SNAPSHOT" && value.messages) {
      for (const message of value.messages) {
        if (!message.id || typeof message.content !== "string") continue;
        const current = this.messages.get(`${runId}:${message.id}`);
        const now = new Date().toISOString();
        this.messages.set(`${runId}:${message.id}`, {
          id: message.id,
          threadId,
          runId,
          role: message.role ?? current?.role ?? "assistant",
          content: message.content,
          status: "completed",
          createdAt: current?.createdAt ?? now,
          updatedAt: now,
        });
      }
      return;
    }
    if (!value.messageId || (!isTextStart(event) && !isTextContent(event) && !isTextEnd(event))) return;
    const id = `${runId}:${value.messageId}`;
    const now = new Date().toISOString();
    const current = this.messages.get(id);
    const message: ConversationMessage = current ?? {
      id: value.messageId,
      threadId,
      runId,
      role: value.role ?? "assistant",
      content: "",
      status: "streaming",
      createdAt: now,
      updatedAt: now,
    };
    if (isTextContent(event) && typeof value.delta === "string") message.content += value.delta;
    if (isTextEnd(event)) message.status = "completed";
    message.updatedAt = now;
    this.messages.set(id, message);
  }

  async listMessages(threadId: string): Promise<ConversationMessage[]> {
    return [...this.messages.values()]
      .filter((message) => message.threadId === threadId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async removeThread(threadId: string): Promise<void> {
    for (const [id, message] of this.messages) {
      if (message.threadId === threadId) this.messages.delete(id);
    }
  }
}

export interface SqliteMessageProjectorOptions {
  path: string;
}

export class SqliteMessageProjector implements MessageProjector {
  private readonly db: Database.Database;

  constructor(options: SqliteMessageProjectorOptions) {
    mkdirSync(dirname(options.path), { recursive: true });
    this.db = new Database(options.path);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS thread_manager_messages (
        id TEXT NOT NULL,
        thread_id TEXT NOT NULL,
        run_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('streaming','completed','error')),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (run_id, id)
      );
      CREATE INDEX IF NOT EXISTS idx_thread_manager_messages_thread_created
        ON thread_manager_messages(thread_id, created_at);
    `);
  }

  async apply(threadId: string, runId: string, event: BaseEvent): Promise<void> {
    const value = fields(event);
    if (String(value.type) === "MESSAGES_SNAPSHOT" && value.messages) {
      for (const message of value.messages) {
        if (!message.id || typeof message.content !== "string") continue;
        const now = Date.now();
        this.db.prepare(`
          INSERT INTO thread_manager_messages
            (id, thread_id, run_id, role, content, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 'completed', ?, ?)
          ON CONFLICT(run_id, id) DO UPDATE SET
            content = excluded.content,
            status = 'completed',
            updated_at = excluded.updated_at
        `).run(
          message.id,
          threadId,
          runId,
          message.role ?? "assistant",
          message.content,
          now,
          now,
        );
      }
      return;
    }
    if (!value.messageId || (!isTextStart(event) && !isTextContent(event) && !isTextEnd(event))) return;
    const now = Date.now();
    const id = value.messageId;
    this.db.prepare(`
      INSERT OR IGNORE INTO thread_manager_messages
        (id, thread_id, run_id, role, content, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, '', 'streaming', ?, ?)
    `).run(id, threadId, runId, value.role ?? "assistant", now, now);
    if (isTextContent(event)) {
      this.db.prepare(`
        UPDATE thread_manager_messages
        SET content = content || ?, updated_at = ?
        WHERE run_id = ? AND id = ?
      `).run(typeof value.delta === "string" ? value.delta : "", now, runId, id);
    }
    if (isTextEnd(event)) {
      this.db.prepare(`
        UPDATE thread_manager_messages
        SET status = 'completed', updated_at = ?
        WHERE run_id = ? AND id = ?
      `).run(now, runId, id);
    }
  }

  async listMessages(threadId: string): Promise<ConversationMessage[]> {
    const rows = this.db.prepare(`
      SELECT id, thread_id, run_id, role, content, status, created_at, updated_at
      FROM thread_manager_messages
      WHERE thread_id = ?
      ORDER BY created_at ASC, id ASC
    `).all(threadId) as Array<{
      id: string; thread_id: string; run_id: string; role: string;
      content: string; status: MessageStatus; created_at: number; updated_at: number;
    }>;
    return rows.map(toMessage);
  }

  async removeThread(threadId: string): Promise<void> {
    this.db.prepare("DELETE FROM thread_manager_messages WHERE thread_id = ?").run(threadId);
  }

  close(): void {
    this.db.close();
  }
}

export interface MessageProjectorFactoryOptions {
  sqlitePath?: string;
}

export async function createMessageProjector(
  driver: StoreDriver = (process.env.STORE_DRIVER as StoreDriver | undefined) ?? "sqlite",
  options: MessageProjectorFactoryOptions = {},
): Promise<MessageProjector> {
  if (driver === "memory") return new InMemoryMessageProjector();
  if (driver === "postgres") {
    throw new Error(
      "A PostgreSQL MessageProjector must be supplied by the host application",
    );
  }
  const path = options.sqlitePath ?? process.env.SQLITE_PATH ??
    resolve(process.cwd(), ".data/conversation-threads.sqlite");
  return new SqliteMessageProjector({ path });
}
