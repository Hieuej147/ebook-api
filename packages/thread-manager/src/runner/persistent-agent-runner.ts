import { InMemoryAgentRunner } from '@copilotkit/runtime/v2';
import type {
  AgentRunnerConnectRequest,
  AgentRunnerIsRunningRequest,
  AgentRunnerRunRequest,
  AgentRunnerStopRequest,
} from '@copilotkit/runtime/v2';
import type { BaseEvent } from '@ag-ui/client';
import { Observable, ReplaySubject } from 'rxjs';
import type { RunnerDeps } from '../types.js';
import { EventCoalescer, type PersistedEvent } from './event-coalescer.js';
import { InMemoryRunCoordinator } from '../coordination/in-memory-run-coordinator.js';
import { JsonAgUiEventSerializer } from '../serialization/ag-ui-event-serializer.js';

export class PersistentAgentRunner extends InMemoryAgentRunner {
  private readonly coordinator;
  private readonly serializer;
  private readonly localRuns = new Map<
    string,
    {
      runId: string;
      subject: ReplaySubject<BaseEvent>;
      pendingWrites: Promise<void>;
      coalescer: EventCoalescer;
      liveEventCount: number;
      persistedRawCount: number;
      terminalSeen: boolean;
      titlePromise: Promise<void>;
      nextSequence: () => number;
    }
  >();
  private readonly finishingRuns = new Set<string>();

  constructor(private readonly deps: RunnerDeps) {
    super();
    this.coordinator = deps.coordinator ?? new InMemoryRunCoordinator();
    this.serializer = deps.serializer ?? new JsonAgUiEventSerializer();
  }

  override run(request: AgentRunnerRunRequest): Observable<BaseEvent> {
    const output = new ReplaySubject<BaseEvent>();
    void this.startRun(request, output);
    return output.asObservable();
  }

  override connect(request: AgentRunnerConnectRequest): Observable<BaseEvent> {
    const output = new ReplaySubject<BaseEvent>();
    void this.replay(request.threadId, output);
    return output.asObservable();
  }

  override async isRunning(
    request: AgentRunnerIsRunningRequest,
  ): Promise<boolean> {
    return (
      (await this.deps.events.active(request.threadId)) !== null ||
      (await super.isRunning(request))
    );
  }

  override async stop(
    request: AgentRunnerStopRequest,
  ): Promise<boolean | undefined> {
    const local = this.localRuns.get(request.threadId);
    const stopped = await super.stop(request);
    const active = local ?? (await this.deps.events.active(request.threadId));
    if (stopped || active) {
      if (local) {
        const pending = local.coalescer.flushAll();
        local.pendingWrites = local.pendingWrites.then(() =>
          this.persist(
            request.threadId,
            local.runId,
            pending,
            local.nextSequence,
            local,
          ),
        );
        await local.pendingWrites;
      }
      if (active) {
        await this.deps.events.finishRun(request.threadId, active.runId, 'stopped').catch(() => undefined);
        this.localRuns.delete(request.threadId);
      }
      await this.coordinator.release(request.threadId, active?.runId ?? '').catch(() => undefined);
      await this.deps.store
        .setStatus(request.threadId, 'idle')
        .catch(() => undefined);
      return true;
    }
    return false;
  }

  async deleteThread(threadId: string): Promise<void> {
    const local = this.localRuns.get(threadId);
    await this.deps.store.setStatus(threadId, 'deleting');
    await super.stop({ threadId }).catch(() => false);
    await this.deps.events.removeThread(threadId);
    await this.coordinator.release(threadId, local?.runId ?? '').catch(() => undefined);
    await this.deps.store.delete(threadId);
  }

  private async startRun(
    request: AgentRunnerRunRequest,
    output: ReplaySubject<BaseEvent>,
  ): Promise<void> {
    const agentId =
      request.agent.agentId ?? this.deps.defaultAgentId ?? 'default';
    try {
      await this.deps.store.create(agentId, request.threadId);
      await this.deps.store.setStatus(request.threadId, 'running');
      if (!await this.coordinator.acquire(request.threadId, request.input.runId, 5 * 60_000)) {
        throw new Error(`Thread "${request.threadId}" already has a running agent`);
      }
      await this.deps.events.startRun(
        request.threadId,
        request.input.runId,
        request.input,
        agentId,
        {
          parentRunId: request.input.parentRunId,
          rootRunId: request.input.parentRunId ? undefined : request.input.runId,
          depth: request.input.parentRunId ? 1 : 0,
          kind: request.input.parentRunId ? 'subagent' : 'root',
        },
      );

      const titlePromise = this.updateInitialTitle(request, agentId).catch(() => undefined);
      const live = super.run(request);
      let sequence = 0;
      const state = {
        runId: request.input.runId,
        subject: output,
        pendingWrites: Promise.resolve(),
        coalescer: new EventCoalescer(),
        liveEventCount: 0,
        persistedRawCount: 0,
        terminalSeen: false,
        titlePromise,
        nextSequence: () => sequence++,
      };
      this.localRuns.set(request.threadId, state);
      live.subscribe({
        next: (event) => {
          output.next(event);
          if (event.type === 'RUN_FINISHED' || event.type === 'RUN_ERROR') {
            state.terminalSeen = true;
          }
          state.liveEventCount += 1;
          const pending = state.coalescer.push(event);
          state.pendingWrites = state.pendingWrites.then(() =>
            this.persist(
              request.threadId,
              request.input.runId,
              pending,
              () => sequence++,
              state,
            ),
          );
        },
        error: (error: unknown) => {
          this.emitRunError(
            request.threadId,
            request.input.runId,
            error instanceof Error ? error.message : String(error),
            output,
            state,
          );
          void this.finish(
            request.threadId,
            request.input.runId,
            'error',
            error,
            output,
          );
        },
        complete: () => {
          if (!state.terminalSeen) {
            const error = new Error('Run ended without emitting a terminal event');
            this.emitRunError(
              request.threadId,
              request.input.runId,
              error.message,
              output,
              state,
            );
            void this.finish(
              request.threadId,
              request.input.runId,
              'error',
              error,
              output,
            );
            return;
          }
          void this.finish(
            request.threadId,
            request.input.runId,
            'completed',
            undefined,
            output,
          );
        },
      });
    } catch (error) {
      await this.deps.store
        .setStatus(request.threadId, 'idle')
        .catch(() => undefined);
      output.error(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async finish(
    threadId: string,
    runId: string,
    status: 'completed' | 'error' | 'stopped',
    error: unknown,
    output: ReplaySubject<BaseEvent>,
  ): Promise<void> {
    const finishKey = `${threadId}:${runId}`;
    if (this.finishingRuns.has(finishKey)) return;
    this.finishingRuns.add(finishKey);
    const state = this.localRuns.get(threadId);
    if (state) {
      const finalEvents = state.coalescer.flushAll();
      state.pendingWrites = state.pendingWrites.then(() =>
        this.persist(threadId, runId, finalEvents, state.nextSequence, state),
      );
    }
    await state?.pendingWrites;
    await state?.titlePromise;
    const persisted = await this.deps.events.history(threadId);
    const runEvents = persisted.filter((item) => item.runId === runId);
    const compacted = this.serializer.compact(runEvents.map((item) => item.event));
    await this.deps.events.replaceRunEvents(threadId, runId, compacted.map((event, sequence) => ({ threadId, runId, sequence, event })));
    this.localRuns.delete(threadId);
    await this.deps.events.finishRun(threadId, runId, status);
    await this.coordinator.release(threadId, runId).catch(() => undefined);
    await this.deps.store.setStatus(threadId, 'idle').catch(() => undefined);
    // A terminal AG-UI event is the transport-level error signal. Completing
    // the observable afterwards keeps CopilotKit from reporting the generic
    // "ended without emitting a terminal event" wrapper error.
    output.complete();
    this.finishingRuns.delete(finishKey);
  }

  private async replay(
    threadId: string,
    output: ReplaySubject<BaseEvent>,
  ): Promise<void> {
    try {
      const existing = await this.deps.store.get(threadId);
      if (!existing)
        await this.deps.store.create(
          this.deps.defaultAgentId ?? 'default',
          threadId,
        );
      const history = await this.deps.events.history(threadId);
      const grouped = new Map<string, typeof history>();
      for (const item of history) (grouped.get(item.runId) ?? (grouped.set(item.runId, []), grouped.get(item.runId)!)).push(item);
      for (const items of grouped.values()) {
        const stream = this.serializer.compact(items.map((item) => item.event));
        for (const event of stream) output.next(event);
      }
      const local = this.localRuns.get(threadId);
      if (local) {
        let seen = 0;
        const persistedForRun = local.persistedRawCount;
        local.subject.subscribe({
          next: (event) => {
            if (seen++ >= persistedForRun) output.next(event);
          },
          error: (error) => output.error(error),
          complete: () => output.complete(),
        });
      } else {
        output.complete();
      }
    } catch (error) {
      output.error(error);
    }
  }

  private async updateInitialTitle(
    request: AgentRunnerRunRequest,
    agentId: string,
  ): Promise<void> {
    const generator = this.deps.titleGenerator;
    if (!generator) return;

    const defaultTitle = this.deps.defaultThreadTitle ?? 'New conversation';
    const thread = await this.deps.store.get(request.threadId);
    if (!thread || thread.title !== defaultTitle) return;

    const firstUserMessage = firstUserMessageText(request.input.messages);
    if (!firstUserMessage) return;

    const fallback = fallbackTitle(firstUserMessage);
    let title = fallback;
    try {
      title = await withTimeout(
        generator.generate({
          agentId,
          threadId: request.threadId,
          firstUserMessage,
        }),
        this.deps.titleTimeoutMs ?? 3_000,
      );
    } catch {
      // Title generation is non-critical. Keep the local fallback.
    }
    const normalized = normalizeTitle(title) || fallback;
    await this.deps.store
      .renameIfTitle(request.threadId, defaultTitle, normalized)
      .catch(() => null);
  }

  private async persist(
    threadId: string,
    runId: string,
    events: PersistedEvent[],
    nextSequence: () => number,
    state: {
      pendingWrites: Promise<void>;
      persistedRawCount: number;
      nextSequence: () => number;
    },
  ): Promise<void> {
    if (events.length === 0) return;
    const stored = events.map(({ event, rawCount }) => ({
      threadId,
      runId,
      sequence: nextSequence(),
      event,
      rawCount,
    }));
    const persistable = stored.map(({ threadId: id, runId: rid, sequence, event }) => ({
      threadId: id,
      runId: rid,
      sequence,
      event,
    }));
    if (this.deps.events.appendBatch) {
      await this.deps.events.appendBatch(persistable);
    } else {
      for (const event of persistable) await this.deps.events.append(event);
    }
    for (const item of persistable) await this.coordinator.publish(item.threadId, item);
    state.persistedRawCount += stored.reduce((sum, item) => sum + item.rawCount, 0);
  }

  private emitRunError(
    threadId: string,
    runId: string,
    message: string,
    output: ReplaySubject<BaseEvent>,
    state: { coalescer: EventCoalescer; pendingWrites: Promise<void>; persistedRawCount: number; nextSequence: () => number; terminalSeen: boolean },
  ): void {
    if (state.terminalSeen) return;
    state.terminalSeen = true;
    const event = {
      type: 'RUN_ERROR',
      threadId,
      runId,
      message,
    } as BaseEvent;
    output.next(event);
    const pending = state.coalescer.push(event);
    state.pendingWrites = state.pendingWrites.then(() =>
      this.persist(threadId, runId, pending, state.nextSequence, state),
    );
  }
}

function firstUserMessageText(messages: readonly unknown[]): string | null {
  for (const candidate of messages) {
    if (!isRecord(candidate) || candidate.role !== 'user') continue;
    const content = candidate.content;
    if (typeof content === 'string' && content.trim()) return content.trim();
    if (Array.isArray(content)) {
      const text = content
        .filter(isRecord)
        .map((part) => (typeof part.text === 'string' ? part.text : ''))
        .join('')
        .trim();
      if (text) return text;
    }
  }
  return null;
}

function normalizeTitle(value: string): string {
  return value
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[.!?。！？]+$/u, '')
    .trim()
    .slice(0, 60)
    .trim();
}

function fallbackTitle(message: string): string {
  return normalizeTitle(message) || 'New conversation';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Thread title timeout')), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
