import type { BaseEvent, RunAgentInput } from "@ag-ui/client";
import type { AgentRunner } from "@copilotkit/runtime/v2";
import type { Observable } from "rxjs";

export type ThreadStatus = "idle" | "running" | "deleting";
export type StoreDriver = "memory" | "sqlite" | "postgres";
export type AgentRunKind = "root" | "subagent";
export type RunStatus = "running" | "completed" | "error" | "stopped";

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

export interface AgentRunLineage {
  threadId: string;
  runId: string;
  agentId: string;
  parentRunId?: string;
  rootRunId: string;
  depth: number;
  kind: AgentRunKind;
}

export interface AgentDescriptor {
  id: string;
  kind: AgentRunKind;
  capabilities?: readonly string[];
}

export interface SubagentRequest {
  parent: AgentRunLineage;
  agentId: string;
  input: RunAgentInput;
}

export interface SerializedEventStream {
  version: 1;
  threadId: string;
  runId: string;
  parentRunId?: string;
  events: BaseEvent[];
}

export interface EventSerializer {
  serialize(stream: SerializedEventStream): string;
  deserialize(value: string): SerializedEventStream;
  compact(events: readonly BaseEvent[]): BaseEvent[];
}

export interface RunCoordinator {
  acquire(threadId: string, runId: string, ttlMs: number): Promise<boolean>;
  renew(threadId: string, runId: string, ttlMs: number): Promise<boolean>;
  release(threadId: string, runId: string): Promise<void>;
  publish(threadId: string, event: StoredRunEvent): Promise<void>;
  subscribe(threadId: string, onEvent: (event: StoredRunEvent) => void): Promise<() => Promise<void>>;
  close?(): Promise<void> | void;
}

export abstract class AgentOrchestrator {
  abstract resolve(agentId: string): Promise<AgentDescriptor>;
  abstract runSubagent(request: SubagentRequest): Observable<BaseEvent>;
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
    metadata?: {
      parentRunId?: string;
      rootRunId?: string;
      depth?: number;
      kind?: AgentRunKind;
    },
  ): Promise<void>;
  append(event: StoredRunEvent): Promise<void>;
  appendBatch?(events: StoredRunEvent[]): Promise<void>;
  replaceRunEvents(threadId: string, runId: string, events: StoredRunEvent[]): Promise<void>;
  finishRun(threadId: string, runId: string, status: RunStatus): Promise<void>;
  history(threadId: string): Promise<StoredRunEvent[]>;
  active(threadId: string): Promise<{ runId: string; status: "running" } | null>;
  removeThread(threadId: string): Promise<void>;
  close?(): Promise<void> | void;
}

export interface RunnerDeps {
  store: ThreadStore;
  events: EventStore;
  coordinator?: RunCoordinator;
  serializer?: EventSerializer;
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
