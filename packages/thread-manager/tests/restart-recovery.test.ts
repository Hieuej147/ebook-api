import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SqliteEventStore } from "../src/runner/event-store.js";
import { SqliteThreadStore } from "../src/stores/sqlite-store.js";
import type { BaseEvent, RunAgentInput } from "@ag-ui/client";
import { createCheckpointer } from "../src/checkpointer/create-checkpointer.js";
import { langGraphConfig } from "../src/types.js";

describe("restart recovery", () => {
  it("recovers AG-UI history and LangGraph checkpoint state from one SQLite file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "thread-manager-restart-"));
    const path = join(directory, "threads.sqlite");
    const input = { threadId: "thread-X", runId: "run-X", messages: [], state: {} } as unknown as RunAgentInput;
    const event = {
      type: "TEXT_MESSAGE_CONTENT",
      threadId: "thread-X",
      runId: "run-X",
      messageId: "message-X",
      delta: "recovered",
    } as unknown as BaseEvent;

    const store1 = new SqliteThreadStore({ path });
    const events1 = new SqliteEventStore({ path });
    await store1.create("default", "thread-X");
    await events1.startRun("thread-X", "run-X", input, "default");
    await events1.append({ threadId: "thread-X", runId: "run-X", sequence: 0, event });
    await events1.finishRun("thread-X", "run-X", "completed");

    const checkpointer1 = await createCheckpointer({ driver: "sqlite", sqlitePath: path });
    const graphConfig = langGraphConfig("thread-X");
    const graphState = {
      v: 1,
      id: "checkpoint-X",
      ts: new Date().toISOString(),
      channel_values: { recovered: true },
      channel_versions: {},
      versions_seen: {},
      pending_sends: [],
    } as never;
    await checkpointer1.put(graphConfig, graphState, {});
    await store1.close?.();
    await events1.close?.();

    const store2 = new SqliteThreadStore({ path });
    const events2 = new SqliteEventStore({ path });
    const checkpointer2 = await createCheckpointer({ driver: "sqlite", sqlitePath: path });
    await expect(events2.history("thread-X")).resolves.toHaveLength(1);
    await expect(store2.get("thread-X")).resolves.toMatchObject({ id: "thread-X" });
    await expect(checkpointer2.getTuple(graphConfig)).resolves.toMatchObject({
      checkpoint: { channel_values: { recovered: true } },
    });
    await store2.close?.();
    await events2.close?.();
    await rm(directory, { recursive: true, force: true });
  });
});
