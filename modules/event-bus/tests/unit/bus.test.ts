import { describe, expect, it } from 'vitest';
import * as coreIndex from '../../core/index.js';
import { createEventBus, type Event, type EventHandler, type EventHandlerFn } from '../../index.js';

function createEvent(type = 'resource.created'): Event<{ value: number }> {
  return {
    id: 'evt_1',
    type,
    payload: { value: 1 },
    timestamp: '2026-08-12T00:00:00.000Z',
  };
}

describe('bus integration', () => {
  it('core/index re-exports are accessible', () => {
    expect(coreIndex.createEventBus).toBeDefined();
    expect(coreIndex.EventBusError).toBeDefined();
  });

  it('End-to-end: subscribe multiple handlers (object + function forms), publish, verify FIFO delivery and PublishResult', async () => {
    const bus = createEventBus();
    const calls: string[] = [];

    const objHandler: EventHandler = {
      subscriberId: 'obj-1',
      handle: () => { calls.push('object'); },
    };
    const fnHandler: EventHandlerFn = () => { calls.push('function'); };

    bus.subscribe('resource.created', objHandler);
    bus.subscribe('resource.created', fnHandler);

    const result = await bus.publish(createEvent());

    expect(result.delivered).toBe(2);
    expect(result.failed).toBe(0);
    expect(calls).toEqual(['object', 'function']);
  });

  it('Config injection: custom idGenerator + timestampProvider are used for auto-filled fields', async () => {
    let idCount = 0;
    const bus = createEventBus({
      idGenerator: () => `custom-id-${++idCount}`,
      timestampProvider: () => '2026-01-01T00:00:00.000Z',
    });

    let received: Event<unknown> | undefined;
    bus.subscribe('resource.created', { handle: (e) => { received = e; } });

    await bus.publish({ type: 'resource.created', payload: {} } as unknown as Event);

    expect(received?.id).toBe('custom-id-1');
    expect(received?.timestamp).toBe('2026-01-01T00:00:00.000Z');
  });

  it('Hooks wiring: onPublish/onSubscribe/onUnsubscribe fire at the documented times', async () => {
    const events: string[] = [];
    const bus = createEventBus({
      hooks: {
        onPublish: (event) => { events.push(`publish:${event.type}`); },
        onSubscribe: (eventType, subscriberId) => { events.push(`subscribe:${eventType}:${subscriberId ?? 'fn'}`); },
        onUnsubscribe: (eventType, subscriberId) => { events.push(`unsubscribe:${eventType}:${subscriberId ?? 'fn'}`); },
      },
    });

    const handler: EventHandler = {
      subscriberId: 'test-handler',
      handle: () => {},
    };

    bus.subscribe('resource.created', handler);
    expect(events).toContain('subscribe:resource.created:test-handler');

    await bus.publish(createEvent());
    expect(events).toContain('publish:resource.created');

    bus.unsubscribe('resource.created', 'test-handler');
    expect(events).toContain('unsubscribe:resource.created:test-handler');

    const subscribeIdx = events.indexOf('subscribe:resource.created:test-handler');
    const publishIdx = events.indexOf('publish:resource.created');
    const unsubscribeIdx = events.indexOf('unsubscribe:resource.created:test-handler');
    expect(subscribeIdx).toBeLessThan(publishIdx);
    expect(publishIdx).toBeLessThan(unsubscribeIdx);
  });

  it('Full lifecycle: subscribe → publish → unsubscribe → publish again (handler no longer called)', async () => {
    const bus = createEventBus();
    let calls = 0;

    const handler: EventHandler = { handle: () => { calls += 1; } };
    const unsub = bus.subscribe('resource.created', handler);

    const r1 = await bus.publish(createEvent());
    expect(r1.delivered).toBe(1);
    expect(calls).toBe(1);

    expect(unsub()).toBe(true);

    const r2 = await bus.publish(createEvent());
    expect(r2.delivered).toBe(0);
    expect(calls).toBe(1);
  });

  it('Mixed handler forms: object handler and function handler both work and execute in registration order', async () => {
    const bus = createEventBus();
    const calls: string[] = [];

    const objHandler: EventHandler = { handle: () => { calls.push('obj-first'); } };
    const fnHandler: EventHandlerFn = () => { calls.push('fn-second'); };
    const objHandler2: EventHandler = {
      subscriberId: 'obj-third',
      handle: () => { calls.push('obj-third'); },
    };

    bus.subscribe('resource.created', objHandler);
    bus.subscribe('resource.created', fnHandler);
    bus.subscribe('resource.created', objHandler2);

    await bus.publish(createEvent());

    expect(calls).toEqual(['obj-first', 'fn-second', 'obj-third']);
  });

  it('Multiple publishes maintain handler registry correctly', async () => {
    const bus = createEventBus();
    let totalCalls = 0;
    bus.subscribe('resource.created', { handle: () => { totalCalls += 1; } });

    await bus.publish(createEvent());
    await bus.publish(createEvent());
    await bus.publish(createEvent());

    expect(totalCalls).toBe(3);
  });

  it('Different event types maintain independent registries', async () => {
    const bus = createEventBus();
    let createdCalls = 0;
    let updatedCalls = 0;

    bus.subscribe('resource.created', { handle: () => { createdCalls += 1; } });
    bus.subscribe('resource.updated', { handle: () => { updatedCalls += 1; } });

    await bus.publish(createEvent('resource.created'));
    await bus.publish(createEvent('resource.updated'));
    await bus.publish(createEvent('resource.created'));

    expect(createdCalls).toBe(2);
    expect(updatedCalls).toBe(1);
  });

  it('onSubscribe does not fire for duplicate subscriptions', () => {
    const subCalls: string[] = [];
    const bus = createEventBus({
      hooks: {
        onSubscribe: (eventType) => { subCalls.push(eventType); },
      },
    });

    const handler: EventHandler = { handle: () => {} };
    bus.subscribe('resource.created', handler);
    bus.subscribe('resource.created', handler);

    expect(subCalls).toHaveLength(1);
  });

  it('onUnsubscribe does not fire when removing non-existent subscriber', () => {
    const unsubCalls: string[] = [];
    const bus = createEventBus({
      hooks: {
        onUnsubscribe: (eventType) => { unsubCalls.push(eventType); },
      },
    });

    bus.unsubscribe('resource.created', 'nonexistent');

    expect(unsubCalls).toHaveLength(0);
  });

  it('Default config creates a working bus', async () => {
    const bus = createEventBus();
    let called = false;
    bus.subscribe('resource.created', { handle: () => { called = true; } });

    const result = await bus.publish(createEvent());

    expect(called).toBe(true);
    expect(result.delivered).toBe(1);
  });

  it('onSubscribe fires with function handler subscriberId as undefined', () => {
    let receivedSubscriberId: string | undefined;
    const bus = createEventBus({
      hooks: {
        onSubscribe: (_eventType, subscriberId) => { receivedSubscriberId = subscriberId; },
      },
    });

    bus.subscribe('resource.created', () => {});

    expect(receivedSubscriberId).toBeUndefined();
  });
});