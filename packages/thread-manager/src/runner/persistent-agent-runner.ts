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

export class PersistentAgentRunner extends InMemoryAgentRunner {
  private readonly localRuns = new Map<
    string,
    {
      runId: string;
      subject: ReplaySubject<BaseEvent>;
      pendingWrites: Promise<void>;
      coalescer: EventCoalescer;
      liveEventCount: number;
      persistedRawCount: number;
      titlePromise: Promise<void>;
      nextSequence: () => number;
    }
  >();

  constructor(private readonly deps: RunnerDeps) {
    super();
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
    if (stopped || local) {
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
      await this.deps.store
        .setStatus(request.threadId, 'idle')
        .catch(() => undefined);
      return true;
    }
    return false;
  }

  async deleteThread(threadId: string): Promise<void> {
    await this.deps.store.setStatus(threadId, 'deleting');
    await super.stop({ threadId }).catch(() => false);
    await this.deps.events.removeThread(threadId);
    await this.deps.projector?.removeThread(threadId);
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
      await this.deps.events.startRun(
        request.threadId,
        request.input.runId,
        request.input,
        agentId,
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
        titlePromise,
        nextSequence: () => sequence++,
      };
      this.localRuns.set(request.threadId, state);
      live.subscribe({
        next: (event) => {
          output.next(event);
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
          void this.finish(
            request.threadId,
            request.input.runId,
            'error',
            error,
            output,
          );
        },
        complete: () => {
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
    const state = this.localRuns.get(threadId);
    if (state) {
      const finalEvents = state.coalescer.flushAll();
      state.pendingWrites = state.pendingWrites.then(() =>
        this.persist(threadId, runId, finalEvents, state.nextSequence, state),
      );
    }
    await state?.pendingWrites;
    await state?.titlePromise;
    this.localRuns.delete(threadId);
    await this.deps.events.finishRun(threadId, runId, status);
    await this.deps.store.setStatus(threadId, 'idle').catch(() => undefined);
    if (error) output.error(error);
    else output.complete();
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
      for (const item of history) output.next(item.event);
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
    if (this.deps.projector) {
      for (const item of persistable) {
        await this.deps.projector.apply(item.threadId, item.runId, item.event);
      }
    }
    state.persistedRawCount += stored.reduce((sum, item) => sum + item.rawCount, 0);
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
