import { describe, expect, it } from 'vitest';
import { createEventBus, EventBusError, type Event, type EventHandler, type EventHandlerFn } from '../../index.js';

function createEvent(type = 'resource.created'): Event<{ value: number }> {
  return {
    id: 'evt_1',
    type,
    payload: { value: 1 },
    timestamp: '2026-08-12T00:00:00.000Z',
  };
}

function expectEventBusError(fn: () => void, code: string): void {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(EventBusError);
    expect((err as EventBusError).code).toBe(code);
    return;
  }
  expect.fail('Expected to throw EventBusError');
}

describe('subscribe', () => {
  it('Subscribe handler: registering returns a valid UnsubscribeFn; handler count increments', async () => {
    const bus = createEventBus();
    const handler: EventHandler = { handle: () => {} };

    const unsub = bus.subscribe('resource.created', handler);

    expect(typeof unsub).toBe('function');

    const result = await bus.publish(createEvent());
    expect(result.delivered).toBe(1);
  });

  it('Duplicate subscriber handling: registering the exact same handler twice does not double-execute', async () => {
    const bus = createEventBus();
    let calls = 0;
    const handler: EventHandler = { handle: () => { calls += 1; } };

    const firstUnsub = bus.subscribe('resource.created', handler);
    const secondUnsub = bus.subscribe('resource.created', handler);

    expect(secondUnsub).toBe(firstUnsub);

    const result = await bus.publish(createEvent());
    expect(result.delivered).toBe(1);
    expect(calls).toBe(1);
  });

  it('Duplicate subscriberId handling: two different handlers with the same subscriberId → only first executes', async () => {
    const bus = createEventBus();
    const calls: string[] = [];

    const first: EventHandler = {
      subscriberId: 'dup-id',
      handle: () => { calls.push('first'); },
    };
    const second: EventHandler = {
      subscriberId: 'dup-id',
      handle: () => { calls.push('second'); },
    };

    bus.subscribe('resource.created', first);
    bus.subscribe('resource.created', second);

    const result = await bus.publish(createEvent());
    expect(result.delivered).toBe(1);
    expect(calls).toEqual(['first']);
  });

  it('Invalid subscriber check: non-function / non-handler object throws SUBSCRIBER_INVALID', () => {
    const bus = createEventBus();

    expectEventBusError(
      () => bus.subscribe('resource.created', {} as unknown as EventHandler),
      'SUBSCRIBER_INVALID',
    );
    expectEventBusError(
      () => bus.subscribe('resource.created', 42 as unknown as EventHandler),
      'SUBSCRIBER_INVALID',
    );
    expectEventBusError(
      () => bus.subscribe('resource.created', null as unknown as EventHandler),
      'SUBSCRIBER_INVALID',
    );
  });

  it('Max subscribers per type: registering beyond maxSubscribersPerType throws SUBSCRIBER_INVALID', () => {
    const bus = createEventBus({ maxSubscribersPerType: 2 });

    bus.subscribe('resource.created', { handle: () => {} });
    bus.subscribe('resource.created', { handle: () => {} });

    expectEventBusError(
      () => bus.subscribe('resource.created', { handle: () => {} }),
      'SUBSCRIBER_INVALID',
    );
  });

  it('Invalid event type on subscribe: empty string / spaces / wildcard "*" throws EVENT_TYPE_INVALID', () => {
    const bus = createEventBus();
    const handler: EventHandlerFn = () => {};

    expectEventBusError(() => bus.subscribe('', handler), 'EVENT_TYPE_INVALID');
    expectEventBusError(() => bus.subscribe('resource created', handler), 'EVENT_TYPE_INVALID');
    expectEventBusError(() => bus.subscribe('*', handler), 'EVENT_TYPE_INVALID');
  });

  it('Duplicate function handler reference is a no-op', async () => {
    const bus = createEventBus();
    let calls = 0;
    const fn: EventHandlerFn = () => { calls += 1; };

    const first = bus.subscribe('resource.created', fn);
    const second = bus.subscribe('resource.created', fn);

    expect(second).toBe(first);

    await bus.publish(createEvent());
    expect(calls).toBe(1);
  });
});