import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SqliteMessageProjector } from "../src/runner/message-projector.js";

describe("SqliteMessageProjector", () => {
  it("materializes a complete message from semantic text events", async () => {
    const directory = mkdtempSync(join(tmpdir(), "thread-message-projector-"));
    const projector = new SqliteMessageProjector({
      path: join(directory, "messages.sqlite"),
    });

    await projector.apply("thread-1", "run-1", {
      type: "TEXT_MESSAGE_START",
      messageId: "message-1",
      role: "assistant",
    } as never);
    await projector.apply("thread-1", "run-1", {
      type: "TEXT_MESSAGE_CONTENT",
      messageId: "message-1",
      delta: "Xin chào bạn",
    } as never);
    await projector.apply("thread-1", "run-1", {
      type: "TEXT_MESSAGE_END",
      messageId: "message-1",
    } as never);

    expect(await projector.listMessages("thread-1")).toEqual([
      expect.objectContaining({
        id: "message-1",
        threadId: "thread-1",
        runId: "run-1",
        role: "assistant",
        content: "Xin chào bạn",
        status: "completed",
      }),
    ]);
    projector.close();
  });

  it("is idempotent when the same message snapshot is replayed", async () => {
    const directory = mkdtempSync(join(tmpdir(), "thread-message-projector-"));
    const projector = new SqliteMessageProjector({
      path: join(directory, "messages.sqlite"),
    });
    const snapshot = {
      type: "MESSAGES_SNAPSHOT",
      messages: [
        { id: "message-1", role: "assistant", content: "Một câu hoàn chỉnh." },
      ],
    } as never;

    await projector.apply("thread-1", "run-1", snapshot);
    await projector.apply("thread-1", "run-1", snapshot);

    expect(await projector.listMessages("thread-1")).toEqual([
      expect.objectContaining({
        id: "message-1",
        content: "Một câu hoàn chỉnh.",
        status: "completed",
      }),
    ]);
    projector.close();
  });
});
