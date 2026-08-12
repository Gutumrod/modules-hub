import { describe, expect, it } from 'vitest';
import { createEventBus, type Event } from '../../index.js';

function createEvent(type = 'resource.created'): Event<{ value: number }> {
  return {
    id: 'evt_1',
    type,
    payload: { value: 1 },
    timestamp: '2026-08-12T00:00:00.000Z',
    correlationId: 'corr_1',
  };
}

describe('publish', () => {
  it('Publish one event: dispatched to registered subscriber, handler invoked with the event data', async () => {
    const bus = createEventBus();
    let received: Event<{ value: number }> | undefined;

    bus.subscribe<{ value: number }>('resource.created', {
      handle: (event) => { received = event; },
    });

    const result = await bus.publish(createEvent());

    expect(result.delivered).toBe(1);
    expect(received).toBeDefined();
    expect(received?.type).toBe('resource.created');
    expect(received?.payload).toEqual({ value: 1 });
  });

  it('Multiple subscribers: all registered subscribers for the eventType receive the event in FIFO order', async () => {
    const bus = createEventBus();
    const calls: string[] = [];

    bus.subscribe('resource.created', { handle: () => { calls.push('a'); } });
    bus.subscribe('resource.created', { handle: () => { calls.push('b'); } });
    bus.subscribe('resource.created', { handle: () => { calls.push('c'); } });

    await bus.publish(createEvent());

    expect(calls).toEqual(['a', 'b', 'c']);
  });

  it('Event with no subscriber: resolves PublishResult { delivered: 0, failed: 0 }', async () => {
    const bus = createEventBus();

    const result = await bus.publish(createEvent());

    expect(result).toEqual({ delivered: 0, failed: 0 });
    expect(result.failures).toBeUndefined();
  });

  it('Async subscriber: async handler promise resolves completely before publish() resolves', async () => {
    const bus = createEventBus();
    let resolved = false;

    bus.subscribe('resource.created', {
      handle: async () => {
        await new Promise<void>((r) => r());
        resolved = true;
      },
    });

    await bus.publish(createEvent());

    expect(resolved).toBe(true);
  });

  it('Publish result shape: resolves object with exact { delivered, failed, failures } structure', async () => {
    const bus = createEventBus();
    bus.subscribe('resource.created', { handle: () => {} });
    bus.subscribe('resource.created', { handle: () => { throw new Error('boom'); } });

    const result = await bus.publish(createEvent());

    expect(typeof result.delivered).toBe('number');
    expect(typeof result.failed).toBe('number');
    expect(result.delivered).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.failures).toBeDefined();
    expect(Array.isArray(result.failures)).toBe(true);
    expect(result.failures).toHaveLength(1);
    expect(result.failures?.[0]).toHaveProperty('error');
  });

  it('Publish result without failures has no failures property', async () => {
    const bus = createEventBus();
    bus.subscribe('resource.created', { handle: () => {} });

    const result = await bus.publish(createEvent());

    expect(result.delivered).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.failures).toBeUndefined();
  });

  it('Deterministic order: handlers execute sequentially in exact subscription registration order', async () => {
    const bus = createEventBus();
    const order: number[] = [];

    for (let i = 1; i <= 5; i++) {
      bus.subscribe('resource.created', { handle: () => { order.push(i); } });
    }

    await bus.publish(createEvent());

    expect(order).toEqual([1, 2, 3, 4, 5]);
  });

  it('Correlation ID preservation: correlationId passed in is preserved intact when received by handler', async () => {
    const bus = createEventBus();
    let receivedCorrelationId: string | undefined;

    bus.subscribe('resource.created', {
      handle: (event) => { receivedCorrelationId = event.correlationId; },
    });

    await bus.publish({
      id: 'evt_1',
      type: 'resource.created',
      payload: { value: 1 },
      timestamp: '2026-08-12T00:00:00.000Z',
      correlationId: 'trace-abc-123',
    });

    expect(receivedCorrelationId).toBe('trace-abc-123');
  });

  it('Exact-match routing: event of type "resource.updated" does NOT trigger handlers subscribed to "resource.created"', async () => {
    const bus = createEventBus();
    let createdCalls = 0;
    let updatedCalls = 0;

    bus.subscribe('resource.created', { handle: () => { createdCalls += 1; } });
    bus.subscribe('resource.updated', { handle: () => { updatedCalls += 1; } });

    await bus.publish(createEvent('resource.updated'));

    expect(createdCalls).toBe(0);
    expect(updatedCalls).toBe(1);
  });

  it('Auto-fill: publishing an event without id/timestamp fills them via config idGenerator/timestampProvider', async () => {
    const customId = 'custom-id-123';
    const customTimestamp = '2026-01-01T00:00:00.000Z';
    const bus = createEventBus({
      idGenerator: () => customId,
      timestampProvider: () => customTimestamp,
    });

    let received: Event<unknown> | undefined;
    bus.subscribe('resource.created', { handle: (event) => { received = event; } });

    await bus.publish({
      type: 'resource.created',
      payload: { value: 1 },
    } as unknown as Event<{ value: number }>);

    expect(received?.id).toBe(customId);
    expect(received?.timestamp).toBe(customTimestamp);
  });
});