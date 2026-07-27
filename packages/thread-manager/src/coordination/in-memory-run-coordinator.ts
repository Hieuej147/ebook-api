import type { RunCoordinator, StoredRunEvent } from '../types.js';

export class InMemoryRunCoordinator implements RunCoordinator {
  private readonly locks = new Map<string, { runId: string; expiresAt: number }>();
  private readonly listeners = new Map<string, Set<(event: StoredRunEvent) => void>>();

  async acquire(threadId: string, runId: string, ttlMs: number): Promise<boolean> {
    const existing = this.locks.get(threadId);
    if (existing && existing.expiresAt > Date.now() && existing.runId !== runId) return false;
    this.locks.set(threadId, { runId, expiresAt: Date.now() + ttlMs });
    return true;
  }
  async renew(threadId: string, runId: string, ttlMs: number): Promise<boolean> {
    const lock = this.locks.get(threadId);
    if (!lock || lock.runId !== runId || lock.expiresAt <= Date.now()) return false;
    lock.expiresAt = Date.now() + ttlMs;
    return true;
  }
  async release(threadId: string, runId: string): Promise<void> {
    if (this.locks.get(threadId)?.runId === runId) this.locks.delete(threadId);
  }
  async publish(threadId: string, event: StoredRunEvent): Promise<void> {
    for (const listener of this.listeners.get(threadId) ?? []) listener(event);
  }
  async subscribe(threadId: string, onEvent: (event: StoredRunEvent) => void): Promise<() => Promise<void>> {
    const listeners = this.listeners.get(threadId) ?? new Set();
    listeners.add(onEvent);
    this.listeners.set(threadId, listeners);
    return async () => { listeners.delete(onEvent); if (listeners.size === 0) this.listeners.delete(threadId); };
  }
}
