import { describe, expect, it } from "vitest";
import { EventCoalescer } from "../src/runner/event-coalescer.js";

describe("EventCoalescer", () => {
  it("coalesces text content for one message without changing live events", () => {
    const coalescer = new EventCoalescer();
    expect(coalescer.push({
      type: "TEXT_MESSAGE_CONTENT",
      messageId: "m1",
      delta: "Xin ",
    } as never)).toEqual([]);
    expect(coalescer.push({
      type: "TEXT_MESSAGE_CONTENT",
      messageId: "m1",
      delta: "chào",
    } as never)).toEqual([]);

    const flushed = coalescer.push({
      type: "TEXT_MESSAGE_END",
      messageId: "m1",
    } as never);

    expect(flushed).toHaveLength(2);
    expect((flushed[0]!.event as { delta?: string }).delta).toBe("Xin chào");
    expect(flushed[0]!.rawCount).toBe(2);
    expect(flushed[1]!.event.type).toBe("TEXT_MESSAGE_END");
  });

  it("coalesces tool args by toolCallId and flushes at tool boundaries", () => {
    const coalescer = new EventCoalescer();
    coalescer.push({
      type: "TOOL_CALL_ARGS",
      toolCallId: "tool-1",
      delta: "{\"period\"",
    } as never);
    coalescer.push({
      type: "TOOL_CALL_ARGS",
      toolCallId: "tool-1",
      delta: ":\"month\"}",
    } as never);

    const flushed = coalescer.push({
      type: "TOOL_CALL_END",
      toolCallId: "tool-1",
    } as never);

    expect((flushed[0]!.event as { delta?: string }).delta).toBe(
      "{\"period\":\"month\"}",
    );
    expect(flushed[0]!.rawCount).toBe(2);
    expect(flushed[1]!.event.type).toBe("TOOL_CALL_END");
  });

  it("coalesces consecutive RFC 6902 state deltas without applying them", () => {
    const coalescer = new EventCoalescer();
    coalescer.push({
      type: "STATE_DELTA",
      delta: [{ op: "add", path: "/progress", value: 1 }],
    } as never);
    coalescer.push({
      type: "STATE_DELTA",
      delta: [{ op: "replace", path: "/progress", value: 2 }],
    } as never);

    const flushed = coalescer.push({
      type: "STATE_SNAPSHOT",
      snapshot: { progress: 2 },
    } as never);

    expect((flushed[0]!.event as { delta?: unknown[] }).delta).toEqual([
      { op: "add", path: "/progress", value: 1 },
      { op: "replace", path: "/progress", value: 2 },
    ]);
    expect(flushed[0]!.rawCount).toBe(2);
    expect(flushed[1]!.event.type).toBe("STATE_SNAPSHOT");
  });
});
