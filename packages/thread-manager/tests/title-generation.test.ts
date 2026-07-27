import { describe, expect, it, vi, afterEach } from "vitest";
import { of, lastValueFrom, toArray } from "rxjs";
import { InMemoryAgentRunner } from "@copilotkit/runtime/v2";
import { InMemoryEventStore } from "../src/runner/event-store.js";
import { PersistentAgentRunner } from "../src/runner/persistent-agent-runner.js";
import { InMemoryThreadStore } from "../src/stores/in-memory-store.js";

describe("thread title generation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("generates a title from the first user message without changing the stream", async () => {
    vi.spyOn(InMemoryAgentRunner.prototype, "run").mockReturnValue(
      of({ type: "RUN_STARTED" } as never, { type: "RUN_FINISHED" } as never),
    );
    const store = new InMemoryThreadStore();
    const generator = {
      generate: vi.fn().mockResolvedValue("Báo cáo doanh thu"),
    };
    const runner = new PersistentAgentRunner({
      store,
      events: new InMemoryEventStore(),
      titleGenerator: generator,
      defaultAgentId: "dashboard",
    });

    const input = {
      threadId: "title-thread",
      runId: "title-run",
      messages: [
        { id: "user-1", role: "user", content: "Hãy xem báo cáo doanh thu tháng này." },
      ],
      state: {},
    };
    const events = await lastValueFrom(
      runner.run({ threadId: "title-thread", agent: { agentId: "dashboard" }, input } as never).pipe(toArray()),
    );

    expect(events).toEqual([{ type: "RUN_STARTED" }, { type: "RUN_FINISHED" }]);
    expect(generator.generate).toHaveBeenCalledWith({
      agentId: "dashboard",
      threadId: "title-thread",
      firstUserMessage: "Hãy xem báo cáo doanh thu tháng này.",
    });
    await expect(store.get("title-thread")).resolves.toMatchObject({
      title: "Báo cáo doanh thu",
    });
  });

  it("uses the first message as a fail-soft fallback", async () => {
    vi.spyOn(InMemoryAgentRunner.prototype, "run").mockReturnValue(
      of({ type: "RUN_STARTED" } as never, { type: "RUN_FINISHED" } as never),
    );
    const store = new InMemoryThreadStore();
    const runner = new PersistentAgentRunner({
      store,
      events: new InMemoryEventStore(),
      titleGenerator: {
        generate: vi.fn().mockRejectedValue(new Error("provider unavailable")),
      },
      defaultAgentId: "dashboard",
    });

    await lastValueFrom(
      runner.run({
        threadId: "fallback-thread",
        agent: { agentId: "dashboard" },
        input: {
          threadId: "fallback-thread",
          runId: "fallback-run",
          messages: [{ id: "user-1", role: "user", content: "Kiểm tra sách tồn kho." }],
          state: {},
        },
      } as never).pipe(toArray()),
    );

    await expect(store.get("fallback-thread")).resolves.toMatchObject({
      title: "Kiểm tra sách tồn kho",
    });
  });
});
