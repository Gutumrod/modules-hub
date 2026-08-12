import { describe, expect, it, vi } from 'vitest';
import { createEventBus, type Event } from '../../index.js';

function createEvent(overrides: Partial<Event<unknown>> = {}): Event<unknown> {
  return {
    id: 'evt_1',
    type: 'resource.created',
    payload: { secret: 'sensitive-data' },
    timestamp: '2026-08-12T00:00:00.000Z',
    ...overrides,
  };
}

describe('security', () => {
  it('No payload logging: hooks receive the event object, not a stringified payload; no payload content is auto-logged', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    let hookEvent: Event<unknown> | undefined;

    const bus = createEventBus({
      hooks: {
        onPublish: (event) => { hookEvent = event; },
      },
    });

    bus.subscribe('resource.created', { handle: () => {} });

    await bus.publish(createEvent({ payload: { secret: 'super-secret-token' } }));

    expect(hookEvent).toBeDefined();
    expect(typeof hookEvent).toBe('object');
    expect(hookEvent).toHaveProperty('type');
    expect(hookEvent).toHaveProperty('id');
    expect(hookEvent).toHaveProperty('payload');

    expect(consoleSpy).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('Prototype pollution safety: event processing filters out __proto__, constructor, prototype keys from event and metadata', async () => {
    const bus = createEventBus();
    let received: Event<unknown> | undefined;

    bus.subscribe('resource.created', { handle: (event) => { received = event; } });

    const maliciousMetadata = JSON.parse(
      '{"__proto__":"evil","constructor":"evil","prototype":"evil","safe":"ok"}',
    );

    await bus.publish({
      id: 'evt_1',
      type: 'resource.created',
      payload: {},
      timestamp: '2026-08-12T00:00:00.000Z',
      metadata: maliciousMetadata,
    });

    expect(received).toBeDefined();
    const metadata = received?.metadata as Record<string, unknown> | undefined;
    expect(metadata).toBeDefined();
    expect(metadata).toHaveProperty('safe', 'ok');
    expect(Object.keys(metadata as object)).not.toContain('__proto__');
    expect(Object.keys(metadata as object)).not.toContain('constructor');
    expect(Object.keys(metadata as object)).not.toContain('prototype');
  });

  it('Unsafe metadata keys stripped: metadata containing __proto__/constructor/prototype keys has them removed', async () => {
    const bus = createEventBus();
    let received: Event<unknown> | undefined;

    bus.subscribe('resource.created', { handle: (event) => { received = event; } });

    const maliciousMetadata = JSON.parse(
      '{"__proto__":{"polluted":true},"constructor":"evil","prototype":"evil","normalKey":"safe","anotherKey":42}',
    );

    await bus.publish({
      id: 'evt_1',
      type: 'resource.created',
      payload: {},
      timestamp: '2026-08-12T00:00:00.000Z',
      metadata: maliciousMetadata,
    });

    const metadata = received?.metadata as Record<string, unknown> | undefined;
    expect(metadata).toHaveProperty('normalKey', 'safe');
    expect(metadata).toHaveProperty('anotherKey', 42);
    expect(Object.keys(metadata as object)).not.toContain('__proto__');
    expect(Object.keys(metadata as object)).not.toContain('constructor');
    expect(Object.keys(metadata as object)).not.toContain('prototype');

    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('Root-level unsafe keys are not copied to sanitized event', async () => {
    const bus = createEventBus();
    let received: Event<unknown> | undefined;

    bus.subscribe('resource.created', { handle: (event) => { received = event; } });

    const maliciousEvent = JSON.parse(
      '{"id":"evt_1","type":"resource.created","payload":{},"timestamp":"2026-08-12T00:00:00.000Z","__proto__":"evil","constructor":"evil","prototype":"evil"}',
    );

    await bus.publish(maliciousEvent as Event<unknown>);

    expect(received).toBeDefined();
    expect(received?.id).toBe('evt_1');
    expect(received?.type).toBe('resource.created');
    expect(Object.keys(received as object)).not.toContain('__proto__');
    expect(Object.keys(received as object)).not.toContain('constructor');
    expect(Object.keys(received as object)).not.toContain('prototype');
  });

  it('Hook safety: a throwing onPublish hook is swallowed and does not affect publish result', async () => {
    const bus = createEventBus({
      hooks: {
        onPublish: () => { throw new Error('hook explosion'); },
      },
    });

    let handlerCalled = false;
    bus.subscribe('resource.created', { handle: () => { handlerCalled = true; } });

    const result = await bus.publish({
      id: 'evt_1',
      type: 'resource.created',
      payload: {},
      timestamp: '2026-08-12T00:00:00.000Z',
    });

    expect(result.delivered).toBe(1);
    expect(result.failed).toBe(0);
    expect(handlerCalled).toBe(true);
  });

  it('Hook safety: a throwing onError hook is swallowed and does not affect publish result', async () => {
    const bus = createEventBus({
      hooks: {
        onError: () => { throw new Error('onError explosion'); },
      },
      onErrorSink: () => { throw new Error('sink explosion'); },
    });

    bus.subscribe('resource.created', { handle: () => { throw new Error('handler error'); } });

    const result = await bus.publish({
      id: 'evt_1',
      type: 'resource.created',
      payload: {},
      timestamp: '2026-08-12T00:00:00.000Z',
    });

    expect(result.delivered).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.failures).toHaveLength(1);
  });

  it('Hook safety: a throwing onSubscribe hook is swallowed', () => {
    const bus = createEventBus({
      hooks: {
        onSubscribe: () => { throw new Error('onSubscribe explosion'); },
      },
    });

    expect(() => bus.subscribe('resource.created', { handle: () => {} })).not.toThrow();
  });

  it('Hook safety: a throwing onUnsubscribe hook is swallowed', () => {
    const bus = createEventBus({
      hooks: {
        onUnsubscribe: () => { throw new Error('onUnsubscribe explosion'); },
      },
    });

    const unsub = bus.subscribe('resource.created', { handle: () => {} });
    expect(() => unsub()).not.toThrow();
  });

  it('Sanitized event has null prototype (no Object.prototype methods)', async () => {
    const bus = createEventBus();
    let received: Event<unknown> | undefined;

    bus.subscribe('resource.created', { handle: (event) => { received = event; } });

    await bus.publish({
      id: 'evt_1',
      type: 'resource.created',
      payload: {},
      timestamp: '2026-08-12T00:00:00.000Z',
    });

    expect(Object.getPrototypeOf(received)).toBeNull();
  });

  it('Sanitized metadata has null prototype', async () => {
    const bus = createEventBus();
    let received: Event<unknown> | undefined;

    bus.subscribe('resource.created', { handle: (event) => { received = event; } });

    await bus.publish({
      id: 'evt_1',
      type: 'resource.created',
      payload: {},
      timestamp: '2026-08-12T00:00:00.000Z',
      metadata: { key: 'value' },
    });

    expect(Object.getPrototypeOf(received?.metadata)).toBeNull();
  });

  it('onError hook throws, onErrorSink also throws — both swallowed, no crash', async () => {
    const bus = createEventBus({
      hooks: { onError: () => { throw new Error('onError boom'); } },
      onErrorSink: () => { throw new Error('sink boom'); },
    });

    bus.subscribe('resource.created', { handle: () => { throw new Error('handler'); } });

    const result = await bus.publish({
      id: 'evt_1',
      type: 'resource.created',
      payload: {},
      timestamp: '2026-08-12T00:00:00.000Z',
    });

    expect(result.failed).toBe(1);
  });

  it('onPublish hook throws after successful validation — swallowed', async () => {
    const bus = createEventBus({
      hooks: { onPublish: () => { throw new Error('publish boom'); } },
    });

    let called = false;
    bus.subscribe('resource.created', { handle: () => { called = true; } });

    const result = await bus.publish({
      id: 'evt_1',
      type: 'resource.created',
      payload: {},
      timestamp: '2026-08-12T00:00:00.000Z',
    });

    expect(called).toBe(true);
    expect(result.delivered).toBe(1);
  });

  it('onSubscribe hook throws — swallowed', () => {
    const bus = createEventBus({
      hooks: { onSubscribe: () => { throw new Error('sub boom'); } },
    });

    expect(() => bus.subscribe('resource.created', { handle: () => {} })).not.toThrow();
  });

  it('onUnsubscribe hook throws — swallowed', () => {
    const bus = createEventBus({
      hooks: { onUnsubscribe: () => { throw new Error('unsub boom'); } },
    });

    const unsub = bus.subscribe('resource.created', { handle: () => {} });
    expect(() => unsub()).not.toThrow();
  });

  it('onErrorSink throws without onError hook — swallowed', async () => {
    const bus = createEventBus({
      onErrorSink: () => { throw new Error('sink-only boom'); },
    });

    bus.subscribe('resource.created', { handle: () => { throw new Error('handler'); } });

    const result = await bus.publish({
      id: 'evt_1',
      type: 'resource.created',
      payload: {},
      timestamp: '2026-08-12T00:00:00.000Z',
    });

    expect(result.failed).toBe(1);
  });

  it('onError hook throws without onErrorSink — swallowed', async () => {
    const bus = createEventBus({
      hooks: { onError: () => { throw new Error('hook-only boom'); } },
    });

    bus.subscribe('resource.created', { handle: () => { throw new Error('handler'); } });

    const result = await bus.publish({
      id: 'evt_1',
      type: 'resource.created',
      payload: {},
      timestamp: '2026-08-12T00:00:00.000Z',
    });

    expect(result.failed).toBe(1);
  });

  it('onUnsubscribe hook throws — swallowed when calling bus.unsubscribe directly', () => {
    const bus = createEventBus({
      hooks: { onUnsubscribe: () => { throw new Error('unsub boom'); } },
    });

    const handler = { subscriberId: 'test-id', handle: () => {} };
    bus.subscribe('resource.created', handler);

    expect(() => bus.unsubscribe('resource.created', 'test-id')).not.toThrow();
  });
});