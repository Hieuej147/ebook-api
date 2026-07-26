import { describe, expect, it } from "vitest";
import { lastValueFrom, toArray } from "rxjs";
import { InMemoryEventStore } from "../src/runner/event-store.js";
import { PersistentAgentRunner } from "../src/runner/persistent-agent-runner.js";
import { InMemoryThreadStore } from "../src/stores/in-memory-store.js";

describe("connect before run", () => {
  it("creates a stub thread and completes instead of returning a 404", async () => {
    const store = new InMemoryThreadStore();
    const runner = new PersistentAgentRunner({
      store,
      events: new InMemoryEventStore(),
      defaultAgentId: "dashboard",
    });

    const events = await lastValueFrom(
      runner.connect({ threadId: "fresh-page-load" }).pipe(toArray()),
    );

    expect(events).toEqual([]);
    await expect(store.get("fresh-page-load")).resolves.toMatchObject({
      id: "fresh-page-load",
      agentId: "dashboard",
      status: "idle",
    });
  });
});
