import { describe, expect, it } from 'vitest';
import { JsonAgUiEventSerializer } from '../src/serialization/ag-ui-event-serializer.js';

describe('JsonAgUiEventSerializer', () => {
  const serializer = new JsonAgUiEventSerializer();

  it('round-trips and compacts text into a messages snapshot', () => {
    const stream = {
      version: 1 as const,
      threadId: 'thread-1',
      runId: 'run-1',
      events: [
        { type: 'RUN_STARTED', threadId: 'thread-1', runId: 'run-1' },
        { type: 'TEXT_MESSAGE_START', messageId: 'message-1', role: 'assistant' },
        { type: 'TEXT_MESSAGE_CONTENT', messageId: 'message-1', delta: 'Hello ' },
        { type: 'TEXT_MESSAGE_CONTENT', messageId: 'message-1', delta: 'world' },
        { type: 'TEXT_MESSAGE_END', messageId: 'message-1' },
        { type: 'RUN_FINISHED', threadId: 'thread-1', runId: 'run-1' },
      ],
    };
    const restored = serializer.deserialize(serializer.serialize(stream));
    expect(restored.events).toContainEqual(expect.objectContaining({
      type: 'MESSAGES_SNAPSHOT',
      messages: [{ id: 'message-1', role: 'assistant', content: 'Hello world' }],
    }));
  });

  it('keeps tool results and validates malformed streams', () => {
    const compacted = serializer.compact([
      { type: 'TOOL_CALL_START', toolCallId: 'tool-1', toolCallName: 'stats' },
      { type: 'TOOL_CALL_ARGS', toolCallId: 'tool-1', delta: '{"period":' },
      { type: 'TOOL_CALL_ARGS', toolCallId: 'tool-1', delta: '"month"}' },
      { type: 'TOOL_CALL_END', toolCallId: 'tool-1' },
      { type: 'TOOL_CALL_RESULT', messageId: 'tool-message-1', toolCallId: 'tool-1', role: 'tool', content: '{}' },
    ]);
    expect(compacted).toContainEqual(expect.objectContaining({ type: 'TOOL_CALL_RESULT' }));
    expect(() => serializer.deserialize('{"version":2}')).toThrow();
  });

  it('removes RAW traces from the durable compact stream', () => {
    const serializer = new JsonAgUiEventSerializer();
    const events = serializer.compact([
      { type: 'RAW', threadId: 'thread-1', runId: 'run-1', event: { noisy: true } } as never,
      { type: 'RUN_FINISHED', threadId: 'thread-1', runId: 'run-1' } as never,
    ]);
    expect(events.map((event) => event.type)).toEqual(['RUN_FINISHED']);
  });
});
