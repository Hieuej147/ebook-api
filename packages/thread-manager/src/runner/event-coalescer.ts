import type { BaseEvent } from "@ag-ui/client";

type EventWithOptionalId = BaseEvent & {
  messageId?: string;
  toolCallId?: string;
  delta?: unknown;
  args?: string;
};

export interface PersistedEvent {
  event: BaseEvent;
  rawCount: number;
}

interface TextBuffer {
  kind: "text";
  key: string;
  event: EventWithOptionalId;
  rawCount: number;
}

interface ToolArgsBuffer {
  kind: "toolArgs";
  key: string;
  event: EventWithOptionalId;
  rawCount: number;
}

interface StateDeltaBuffer {
  kind: "stateDelta";
  key: string;
  event: EventWithOptionalId;
  rawCount: number;
}

type BufferEntry = TextBuffer | ToolArgsBuffer | StateDeltaBuffer;

/**
 * Converts high-frequency streaming deltas into semantically equivalent
 * persisted events. The live AG-UI stream is never passed through this class.
 */
export class EventCoalescer {
  private readonly buffers = new Map<string, BufferEntry>();

  push(event: BaseEvent): PersistedEvent[] {
    const value = event as EventWithOptionalId;
    const type = String(value.type);
    if (type === "TEXT_MESSAGE_CONTENT" && value.messageId) {
      return this.pushText(value);
    }
    if (type === "TOOL_CALL_ARGS" && value.toolCallId) {
      return this.pushToolArgs(value);
    }
    if (type === "STATE_DELTA" && Array.isArray(value.delta)) {
      return this.pushStateDelta(value);
    }
    return [...this.flushAll(), { event, rawCount: 1 }];
  }

  flushAll(): PersistedEvent[] {
    const flushed = [...this.buffers.values()].map((entry) => ({
      event: entry.event as BaseEvent,
      rawCount: entry.rawCount,
    }));
    this.buffers.clear();
    return flushed;
  }

  reset(): void {
    this.buffers.clear();
  }

  private pushText(value: EventWithOptionalId): PersistedEvent[] {
    const key = `text:${value.messageId}`;
    const delta = typeof value.delta === "string" ? value.delta : "";
    const existing = this.buffers.get(key);
    if (existing?.kind === "text") {
      const previous = typeof existing.event.delta === "string" ? existing.event.delta : "";
      existing.event = { ...existing.event, delta: `${previous}${delta}` };
      existing.rawCount += 1;
      return [];
    }
    const flushed = this.flushAll();
    this.buffers.set(key, { kind: "text", key, event: { ...value, delta }, rawCount: 1 });
    return flushed;
  }

  private pushToolArgs(value: EventWithOptionalId): PersistedEvent[] {
    const key = `toolArgs:${value.toolCallId}`;
    const args = typeof value.delta === "string"
      ? value.delta
      : typeof value.args === "string" ? value.args : "";
    const existing = this.buffers.get(key);
    if (existing?.kind === "toolArgs") {
      const previousDelta = typeof existing.event.delta === "string"
        ? existing.event.delta
        : "";
      existing.event = {
        ...existing.event,
        ...(typeof existing.event.delta === "string"
          ? { delta: `${previousDelta}${args}` }
          : { args: `${existing.event.args ?? ""}${args}` }),
      };
      existing.rawCount += 1;
      return [];
    }
    const flushed = this.flushAll();
    this.buffers.set(key, {
      kind: "toolArgs",
      key,
      event: { ...value, ...(typeof value.delta === "string" ? { delta: args } : { args }) },
      rawCount: 1,
    });
    return flushed;
  }

  private pushStateDelta(value: EventWithOptionalId): PersistedEvent[] {
    const key = "stateDelta";
    const delta = Array.isArray(value.delta) ? value.delta : [];
    const existing = this.buffers.get(key);
    if (existing?.kind === "stateDelta") {
      const previous = Array.isArray(existing.event.delta) ? existing.event.delta : [];
      existing.event = { ...existing.event, delta: [...previous, ...delta] };
      existing.rawCount += 1;
      return [];
    }
    const flushed = this.flushAll();
    this.buffers.set(key, {
      kind: "stateDelta",
      key,
      event: { ...value, delta: [...delta] },
      rawCount: 1,
    });
    return flushed;
  }
}
