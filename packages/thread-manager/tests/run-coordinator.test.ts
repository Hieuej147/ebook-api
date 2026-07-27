import { describe, expect, it } from 'vitest';
import { InMemoryRunCoordinator } from '../src/coordination/in-memory-run-coordinator.js';

describe('InMemoryRunCoordinator', () => {
  it('enforces ownership and publishes live events', async () => {
    const coordinator = new InMemoryRunCoordinator();
    expect(await coordinator.acquire('thread-1', 'run-1', 10_000)).toBe(true);
    expect(await coordinator.acquire('thread-1', 'run-2', 10_000)).toBe(false);
    const received: unknown[] = [];
    const unsubscribe = await coordinator.subscribe('thread-1', (event) => received.push(event));
    await coordinator.publish('thread-1', { threadId: 'thread-1', runId: 'run-1', sequence: 0, event: { type: 'RUN_STARTED', threadId: 'thread-1', runId: 'run-1' } });
    expect(received).toHaveLength(1);
    await coordinator.release('thread-1', 'run-2');
    expect(await coordinator.acquire('thread-1', 'run-2', 10_000)).toBe(false);
    await coordinator.release('thread-1', 'run-1');
    expect(await coordinator.acquire('thread-1', 'run-2', 10_000)).toBe(true);
    await unsubscribe();
  });

  it('expires locks', async () => {
    const coordinator = new InMemoryRunCoordinator();
    expect(await coordinator.acquire('thread-1', 'run-1', 1)).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(await coordinator.acquire('thread-1', 'run-2', 100)).toBe(true);
  });
});
