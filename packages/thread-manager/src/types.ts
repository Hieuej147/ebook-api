import type { BaseEvent, RunAgentInput } from "@ag-ui/client";
import type { AgentRunner } from "@copilotkit/runtime/v2";

export type ThreadStatus = "idle" | "running" | "deleting";
export type StoreDriver = "memory" | "sqlite" | "postgres";

export interface ThreadMeta {
  id: string;
  agentId: string;
  title: string;
  status: ThreadStatus;
  archivedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ThreadListOptions {
  agentId?: string;
  limit?: number;
  cursor?: string;
  includeArchived?: boolean;
}

export interface ThreadListResult {
  threads: ThreadMeta[];
  nextCursor: string | null;
}

export interface ThreadStore {
  create(agentId: string, threadId?: string): Promise<ThreadMeta>;
  get(threadId: string): Promise<ThreadMeta | null>;
  list(options: ThreadListOptions): Promise<ThreadListResult>;
  rename(threadId: string, title: string): Promise<ThreadMeta>;
  renameIfTitle(
    threadId: string,
    expectedTitle: string,
    title: string,
  ): Promise<ThreadMeta | null>;
  touch(threadId: string): Promise<ThreadMeta>;
  setStatus(threadId: string, status: ThreadStatus): Promise<ThreadMeta>;
  delete(threadId: string): Promise<void>;
  close?(): Promise<void> | void;
}

export interface StoredRunEvent {
  threadId: string;
  runId: string;
  sequence: number;
  event: BaseEvent;
}

export type MessageStatus = "streaming" | "completed" | "error";

export interface ConversationMessage {
  id: string;
  threadId: string;
  runId: string;
  role: string;
  content: string;
  status: MessageStatus;
  createdAt: string;
  updatedAt: string;
}

export interface MessageProjector {
  apply(threadId: string, runId: string, event: BaseEvent): Promise<void>;
  listMessages(threadId: string): Promise<ConversationMessage[]>;
  removeThread(threadId: string): Promise<void>;
  close?(): Promise<void> | void;
}

export interface ThreadTitleGenerator {
  generate(input: {
    agentId: string;
    threadId: string;
    firstUserMessage: string;
  }): Promise<string>;
}

export interface EventStore {
  startRun(
    threadId: string,
    runId: string,
    input: RunAgentInput,
    agentId: string,
  ): Promise<void>;
  append(event: StoredRunEvent): Promise<void>;
  appendBatch?(events: StoredRunEvent[]): Promise<void>;
  finishRun(threadId: string, runId: string, status: "completed" | "error" | "stopped"): Promise<void>;
  history(threadId: string): Promise<StoredRunEvent[]>;
  active(threadId: string): Promise<{ runId: string; status: "running" } | null>;
  removeThread(threadId: string): Promise<void>;
  close?(): Promise<void> | void;
}

export interface RunnerDeps {
  store: ThreadStore;
  events: EventStore;
  projector?: MessageProjector;
  titleGenerator?: ThreadTitleGenerator;
  defaultThreadTitle?: string;
  titleTimeoutMs?: number;
  defaultAgentId?: string;
}

export class ThreadNotFoundError extends Error {
  constructor(threadId: string) {
    super(`Thread "${threadId}" was not found`);
    this.name = "ThreadNotFoundError";
  }
}

export class ThreadLockedError extends Error {
  constructor(threadId: string) {
    super(`Thread "${threadId}" already has a running agent`);
    this.name = "ThreadLockedError";
  }
}

export function langGraphConfig(threadId: string): { configurable: { thread_id: string } } {
  return { configurable: { thread_id: threadId } };
}

export type PersistentRunner = AgentRunner;
