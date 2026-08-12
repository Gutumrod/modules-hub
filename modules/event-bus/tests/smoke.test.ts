import { describe, expect, it } from 'vitest';
import { createEventBus, EventBusError, type Event, type EventHandler, type EventHandlerFn } from '../index.js';

function createEvent(type = 'resource.created'): Event<{ value: number }> {
  return {
    id: 'evt_1',
    type,
    payload: { value: 1 },
    timestamp: '2026-08-12T00:00:00.000Z',
    correlationId: 'corr_1',
  };
}

describe('event bus smoke', () => {
  it('subscribes, publishes, and unsubscribes handlers in order', async () => {
    const bus = createEventBus();
    const calls: string[] = [];
    const first: EventHandler = {
      handle: () => {
        calls.push('first');
      },
    };
    const second: EventHandler = {
      handle: () => {
        calls.push('second');
      },
    };

    const unsubscribeFirst = bus.subscribe('resource.created', first);
    bus.subscribe('resource.created', second);

    const publishResult = await bus.publish(createEvent());

    expect(publishResult).toEqual({ delivered: 2, failed: 0 });
    expect(calls).toEqual(['first', 'second']);
    expect(unsubscribeFirst()).toBe(true);

    const secondPublishResult = await bus.publish(createEvent());

    expect(secondPublishResult).toEqual({ delivered: 1, failed: 0 });
    expect(calls).toEqual(['first', 'second', 'second']);
  });

  it('treats duplicate subscriptions as a no-op', async () => {
    const bus = createEventBus();
    let calls = 0;
    const handler: EventHandler = { handle: () => { calls += 1; } };

    const firstUnsubscribe = bus.subscribe('resource.created', handler);
    const duplicateUnsubscribe = bus.subscribe('resource.created', handler);

    const result = await bus.publish(createEvent());

    expect(result).toEqual({ delivered: 1, failed: 0 });
    expect(calls).toBe(1);
    expect(duplicateUnsubscribe).toBe(firstUnsubscribe);
  });

  it('treats duplicate subscriber ids as a no-op', async () => {
    const bus = createEventBus();
    let calls = 0;
    const first: EventHandlerFn = Object.assign(() => { calls += 1; }, { subscriberId: 'dup' });
    const second: EventHandlerFn = Object.assign(() => { calls += 10; }, { subscriberId: 'dup' });

    bus.subscribe('resource.created', first);
    bus.subscribe('resource.created', second);

    const result = await bus.publish(createEvent());

    expect(result).toEqual({ delivered: 1, failed: 0 });
    expect(calls).toBe(1);
  });

  it('isolates handler failures and continues remaining handlers', async () => {
    const bus = createEventBus();
    const calls: string[] = [];
    const failing: EventHandler = {
      handle: () => {
        calls.push('failing');
        throw new Error('boom');
      },
    };
    const succeeding: EventHandler = {
      handle: () => {
        calls.push('succeeding');
      },
    };

    bus.subscribe('resource.created', failing);
    bus.subscribe('resource.created', succeeding);

    const result = await bus.publish(createEvent());

    expect(result.delivered).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.failures?.[0]?.error).toBeInstanceOf(EventBusError);
    expect(result.failures?.[0]?.error.code).toBe('HANDLER_FAILED');
    expect(calls).toEqual(['failing', 'succeeding']);
  });

  it('does not deliver to non-matching event types', async () => {
    const bus = createEventBus();
    let calls = 0;
    bus.subscribe('resource.created', { handle: () => { calls += 1; } });

    const result = await bus.publish(createEvent('resource.updated'));

    expect(result).toEqual({ delivered: 0, failed: 0 });
    expect(calls).toBe(0);
  });
});
