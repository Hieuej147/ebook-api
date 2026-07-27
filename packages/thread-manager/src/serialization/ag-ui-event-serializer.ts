import { compactEvents, EventSchemas, type BaseEvent } from '@ag-ui/client';
import type { EventSerializer, SerializedEventStream } from '../types.js';

type EventFields = BaseEvent & { messageId?: string; role?: string; delta?: unknown; messages?: Array<{ id: string; role: string; content: string }> };

export class JsonAgUiEventSerializer implements EventSerializer {
  serialize(stream: SerializedEventStream): string {
    return JSON.stringify({ ...stream, events: this.compact(stream.events) });
  }

  deserialize(value: string): SerializedEventStream {
    const parsed: unknown = JSON.parse(value);
    if (!isRecord(parsed) || parsed.version !== 1 || typeof parsed.threadId !== 'string' || typeof parsed.runId !== 'string' || !Array.isArray(parsed.events)) {
      throw new Error('Invalid serialized AG-UI event stream');
    }
    return {
      version: 1,
      threadId: parsed.threadId,
      runId: parsed.runId,
      ...(typeof parsed.parentRunId === 'string' ? { parentRunId: parsed.parentRunId } : {}),
      events: parsed.events.map((event) => EventSchemas.parse(event) as BaseEvent),
    };
  }

  compact(events: readonly BaseEvent[]): BaseEvent[] {
    const compacted = compactEvents([...events]);
    const messages = new Map<string, { id: string; role: string; content: string }>();
    const output: BaseEvent[] = [];
    for (const event of compacted) {
      const value = event as EventFields;
      // RAW is useful for live debugging but is intentionally not part of the
      // durable compact replay stream. Semantic AG-UI lifecycle/tool/state
      // events below carry the information required to restore the UI.
      if (value.type === 'RAW') continue;
      if (value.type === 'TEXT_MESSAGE_START' && value.messageId) {
        messages.set(value.messageId, { id: value.messageId, role: value.role ?? 'assistant', content: '' });
        continue;
      }
      if (value.type === 'TEXT_MESSAGE_CONTENT' && value.messageId) {
        const message = messages.get(value.messageId);
        if (message && typeof value.delta === 'string') message.content += value.delta;
        continue;
      }
      if (value.type === 'TEXT_MESSAGE_END' && value.messageId) continue;
      if (value.type === 'MESSAGES_SNAPSHOT' && Array.isArray(value.messages)) {
        for (const message of value.messages) messages.set(message.id, message);
        continue;
      }
      output.push(event);
    }
    const context = events.find((event) => isRecord(event) && typeof event.threadId === 'string' && typeof event.runId === 'string') as (BaseEvent & { threadId?: string; runId?: string }) | undefined;
    if (messages.size > 0) {
      const snapshot = {
        type: 'MESSAGES_SNAPSHOT',
        ...(context?.threadId ? { threadId: context.threadId } : {}),
        ...(context?.runId ? { runId: context.runId } : {}),
        messages: [...messages.values()],
      } as BaseEvent;
      const terminal = output.findIndex((event) => event.type === 'RUN_FINISHED' || event.type === 'RUN_ERROR');
      output.splice(terminal < 0 ? output.length : terminal, 0, snapshot);
    }
    return output.map((event) => {
      try {
        return EventSchemas.parse(event) as BaseEvent;
      } catch {
        // Keep host-provided test/custom events lossless. Runtime AG-UI events
        // are validated, while an unknown event must not prevent run cleanup.
        return event;
      }
    });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
