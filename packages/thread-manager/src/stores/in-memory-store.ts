import { randomUUID } from "node:crypto";
import {
  ThreadNotFoundError,
  type ThreadListOptions,
  type ThreadListResult,
  type ThreadMeta,
  type ThreadStatus,
  type ThreadStore,
} from "../types.js";

const DEFAULT_TITLE = "New conversation";

function decodeCursor(cursor?: string): { updatedAt: number; id: string } | undefined {
  if (!cursor) return undefined;
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown;
    if (
      typeof value === "object" &&
      value !== null &&
      "updatedAt" in value &&
      "id" in value &&
      typeof value.updatedAt === "number" &&
      typeof value.id === "string"
    ) {
      return { updatedAt: value.updatedAt, id: value.id };
    }
  } catch {
    // Invalid cursors are treated as empty cursors by the store. HTTP validation
    // is performed by the router so direct store use stays forgiving.
  }
  return undefined;
}

function encodeCursor(thread: ThreadMeta): string {
  return Buffer.from(JSON.stringify({
    updatedAt: Date.parse(thread.updatedAt),
    id: thread.id,
  })).toString("base64url");
}

export class InMemoryThreadStore implements ThreadStore {
  private readonly threads = new Map<string, ThreadMeta>();

  async create(agentId: string, threadId = randomUUID()): Promise<ThreadMeta> {
    const current = this.threads.get(threadId);
    if (current) return { ...current };
    const now = new Date().toISOString();
    const thread: ThreadMeta = {
      id: threadId,
      agentId,
      title: DEFAULT_TITLE,
      status: "idle",
      createdAt: now,
      updatedAt: now,
    };
    this.threads.set(threadId, thread);
    return { ...thread };
  }

  async get(threadId: string): Promise<ThreadMeta | null> {
    const thread = this.threads.get(threadId);
    return thread ? { ...thread } : null;
  }

  async list(options: ThreadListOptions): Promise<ThreadListResult> {
    const cursor = decodeCursor(options.cursor);
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
    const threads = [...this.threads.values()]
      .filter((thread) => !options.agentId || thread.agentId === options.agentId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id))
      .filter((thread) => !cursor || Date.parse(thread.updatedAt) < cursor.updatedAt ||
        (Date.parse(thread.updatedAt) === cursor.updatedAt && thread.id < cursor.id));
    const page = threads.slice(0, limit);
    return {
      threads: page.map((thread) => ({ ...thread })),
      nextCursor: threads.length > limit ? encodeCursor(page[page.length - 1]!) : null,
    };
  }

  async rename(threadId: string, title: string): Promise<ThreadMeta> {
    return this.update(threadId, { title });
  }

  async renameIfTitle(
    threadId: string,
    expectedTitle: string,
    title: string,
  ): Promise<ThreadMeta | null> {
    const thread = this.threads.get(threadId);
    if (!thread) throw new ThreadNotFoundError(threadId);
    if (thread.title !== expectedTitle) return null;
    return this.update(threadId, { title, updatedAt: new Date().toISOString() });
  }

  async touch(threadId: string): Promise<ThreadMeta> {
    return this.update(threadId, { updatedAt: new Date().toISOString() });
  }

  async setStatus(threadId: string, status: ThreadStatus): Promise<ThreadMeta> {
    return this.update(threadId, { status, updatedAt: new Date().toISOString() });
  }

  async delete(threadId: string): Promise<void> {
    if (!this.threads.delete(threadId)) throw new ThreadNotFoundError(threadId);
  }

  close(): void {
    this.threads.clear();
  }

  private update(threadId: string, changes: Partial<ThreadMeta>): Promise<ThreadMeta> {
    const thread = this.threads.get(threadId);
    if (!thread) return Promise.reject(new ThreadNotFoundError(threadId));
    const updated = { ...thread, ...changes };
    this.threads.set(threadId, updated);
    return Promise.resolve({ ...updated });
  }
}
