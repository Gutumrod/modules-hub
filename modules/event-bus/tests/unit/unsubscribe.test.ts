import { describe, expect, it } from 'vitest';
import { createEventBus, type Event, type EventHandler, type EventHandlerFn } from '../../index.js';

function createEvent(type = 'resource.created'): Event<{ value: number }> {
  return {
    id: 'evt_1',
    type,
    payload: { value: 1 },
    timestamp: '2026-08-12T00:00:00.000Z',
  };
}

describe('unsubscribe', () => {
  it('Unsubscribe via handle: calling returned UnsubscribeFn() removes handler; subsequent publish skips it', async () => {
    const bus = createEventBus();
    let calls = 0;
    const handler: EventHandler = { handle: () => { calls += 1; } };

    const unsub = bus.subscribe('resource.created', handler);
    expect(unsub()).toBe(true);

    const result = await bus.publish(createEvent());

    expect(result.delivered).toBe(0);
    expect(calls).toBe(0);
  });

  it('Unsubscribe via method: bus.unsubscribe(type, handler) removes and returns true', async () => {
    const bus = createEventBus();
    let calls = 0;
    const handler: EventHandler = { handle: () => { calls += 1; } };

    bus.subscribe('resource.created', handler);
    expect(bus.unsubscribe('resource.created', handler)).toBe(true);

    const result = await bus.publish(createEvent());

    expect(result.delivered).toBe(0);
    expect(calls).toBe(0);
  });

  it('Unsubscribe by subscriberId string: bus.unsubscribe(type, "id") removes and returns true', async () => {
    const bus = createEventBus();
    let calls = 0;
    const handler: EventHandler = {
      subscriberId: 'my-id',
      handle: () => { calls += 1; },
    };

    bus.subscribe('resource.created', handler);
    expect(bus.unsubscribe('resource.created', 'my-id')).toBe(true);

    const result = await bus.publish(createEvent());

    expect(result.delivered).toBe(0);
    expect(calls).toBe(0);
  });

  it('Unsubscribe non-existent: unsubscribing unknown handler or subscriberId returns false without throwing', () => {
    const bus = createEventBus();
    const handler: EventHandler = { handle: () => {} };
    bus.subscribe('resource.created', handler);

    expect(bus.unsubscribe('resource.created', { handle: () => {} })).toBe(false);
    expect(bus.unsubscribe('resource.created', 'nonexistent')).toBe(false);
    expect(bus.unsubscribe('unknown.type', handler)).toBe(false);
  });

  it('Unsubscribe idempotent: calling an UnsubscribeFn twice → second returns false', () => {
    const bus = createEventBus();
    const handler: EventHandler = { handle: () => {} };

    const unsub = bus.subscribe('resource.created', handler);

    expect(unsub()).toBe(true);
    expect(unsub()).toBe(false);
  });

  it('Unsubscribe function handler by reference via bus.unsubscribe', async () => {
    const bus = createEventBus();
    let calls = 0;
    const fn: EventHandlerFn = () => { calls += 1; };

    bus.subscribe('resource.created', fn);
    expect(bus.unsubscribe('resource.created', fn)).toBe(true);

    const result = await bus.publish(createEvent());
    expect(result.delivered).toBe(0);
    expect(calls).toBe(0);
  });

  it('Unsubscribe one of multiple handlers leaves others intact', async () => {
    const bus = createEventBus();
    const calls: string[] = [];

    const h1: EventHandler = { handle: () => { calls.push('h1'); } };
    const h2: EventHandler = { handle: () => { calls.push('h2'); } };

    bus.subscribe('resource.created', h1);
    bus.subscribe('resource.created', h2);

    expect(bus.unsubscribe('resource.created', h1)).toBe(true);

    const result = await bus.publish(createEvent());
    expect(result.delivered).toBe(1);
    expect(calls).toEqual(['h2']);
  });
});