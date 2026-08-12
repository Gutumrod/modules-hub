import { describe, expect, it } from 'vitest';
import { createEventBus, EventBusError, type Event, type EventHandler } from '../../index.js';

function expectAsyncEventBusError(fn: () => Promise<unknown>, code: string): Promise<void> {
  return fn().then(
    () => { expect.fail('Expected to throw EventBusError'); },
    (err: unknown) => {
      expect(err).toBeInstanceOf(EventBusError);
      expect((err as EventBusError).code).toBe(code);
    },
  );
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

describe('validation', () => {
  it('Event validation: event missing type throws EVENT_TYPE_INVALID', async () => {
    const bus = createEventBus();
    await expectAsyncEventBusError(
      () => bus.publish({ id: 'evt_1', payload: {}, timestamp: '2026-08-12T00:00:00.000Z' } as unknown as Event),
      'EVENT_TYPE_INVALID',
    );
  });

  it('Event validation: event with empty-string id throws EVENT_INVALID', async () => {
    const bus = createEventBus();
    await expectAsyncEventBusError(
      () => bus.publish({ id: '', type: 'resource.created', payload: {}, timestamp: '2026-08-12T00:00:00.000Z' }),
      'EVENT_INVALID',
    );
  });

  it('Event validation: event missing payload throws EVENT_INVALID', async () => {
    const bus = createEventBus();
    await expectAsyncEventBusError(
      () => bus.publish({ id: 'evt_1', type: 'resource.created', timestamp: '2026-08-12T00:00:00.000Z' } as unknown as Event),
      'EVENT_INVALID',
    );
  });

  it('Event validation: event with empty-string timestamp throws EVENT_INVALID', async () => {
    const bus = createEventBus();
    await expectAsyncEventBusError(
      () => bus.publish({ id: 'evt_1', type: 'resource.created', payload: {}, timestamp: '' }),
      'EVENT_INVALID',
    );
  });

  it('Event validation: missing id is auto-filled per MODULE.md contract (not thrown)', async () => {
    const bus = createEventBus({ idGenerator: () => 'auto-id' });
    let received: Event<unknown> | undefined;
    bus.subscribe('resource.created', { handle: (e) => { received = e; } });

    const result = await bus.publish({
      type: 'resource.created',
      payload: {},
      timestamp: '2026-08-12T00:00:00.000Z',
    } as unknown as Event);

    expect(result.delivered).toBe(1);
    expect(received?.id).toBe('auto-id');
  });

  it('Event validation: missing timestamp is auto-filled per MODULE.md contract (not thrown)', async () => {
    const bus = createEventBus({ timestampProvider: () => 'auto-ts' });
    let received: Event<unknown> | undefined;
    bus.subscribe('resource.created', { handle: (e) => { received = e; } });

    const result = await bus.publish({
      id: 'evt_1',
      type: 'resource.created',
      payload: {},
    } as unknown as Event);

    expect(result.delivered).toBe(1);
    expect(received?.timestamp).toBe('auto-ts');
  });

  it('Event not an object: publishing a non-object throws EVENT_INVALID', async () => {
    const bus = createEventBus();

    await expectAsyncEventBusError(() => bus.publish(null as unknown as Event), 'EVENT_INVALID');
    await expectAsyncEventBusError(() => bus.publish(undefined as unknown as Event), 'EVENT_INVALID');
    await expectAsyncEventBusError(() => bus.publish('string' as unknown as Event), 'EVENT_INVALID');
    await expectAsyncEventBusError(() => bus.publish(42 as unknown as Event), 'EVENT_INVALID');
  });

  it('Event type validation: invalid eventType (empty, spaces, wildcard) throws EVENT_TYPE_INVALID on publish', async () => {
    const bus = createEventBus();

    await expectAsyncEventBusError(
      () => bus.publish({ id: 'evt_1', type: '', payload: {}, timestamp: '2026-08-12T00:00:00.000Z' }),
      'EVENT_TYPE_INVALID',
    );
    await expectAsyncEventBusError(
      () => bus.publish({ id: 'evt_1', type: 'resource created', payload: {}, timestamp: '2026-08-12T00:00:00.000Z' }),
      'EVENT_TYPE_INVALID',
    );
    await expectAsyncEventBusError(
      () => bus.publish({ id: 'evt_1', type: '*', payload: {}, timestamp: '2026-08-12T00:00:00.000Z' }),
      'EVENT_TYPE_INVALID',
    );
  });

  it('Event type validation: wildcard pattern "payment.*" throws EVENT_TYPE_INVALID', async () => {
    const bus = createEventBus();
    await expectAsyncEventBusError(
      () => bus.publish({ id: 'evt_1', type: 'payment.*', payload: {}, timestamp: '2026-08-12T00:00:00.000Z' }),
      'EVENT_TYPE_INVALID',
    );
  });

  it('Event type validation: invalid eventType on subscribe throws EVENT_TYPE_INVALID', () => {
    const bus = createEventBus();

    expectEventBusError(() => bus.subscribe('', { handle: () => {} }), 'EVENT_TYPE_INVALID');
    expectEventBusError(() => bus.subscribe('resource created', { handle: () => {} }), 'EVENT_TYPE_INVALID');
    expectEventBusError(() => bus.subscribe('*', { handle: () => {} }), 'EVENT_TYPE_INVALID');
  });

  it('Metadata validation: metadata that is not an object throws EVENT_INVALID', async () => {
    const bus = createEventBus();

    await expectAsyncEventBusError(
      () => bus.publish({
        id: 'evt_1', type: 'resource.created', payload: {}, timestamp: '2026-08-12T00:00:00.000Z',
        metadata: 'not-an-object',
      } as unknown as Event),
      'EVENT_INVALID',
    );
    await expectAsyncEventBusError(
      () => bus.publish({
        id: 'evt_1', type: 'resource.created', payload: {}, timestamp: '2026-08-12T00:00:00.000Z',
        metadata: 42,
      } as unknown as Event),
      'EVENT_INVALID',
    );
  });

  it('Subscriber id validation: subscriberId that is not a non-empty string throws SUBSCRIBER_INVALID', () => {
    const bus = createEventBus();

    expectEventBusError(
      () => bus.subscribe('resource.created', { subscriberId: '', handle: () => {} } as EventHandler),
      'SUBSCRIBER_INVALID',
    );
    expectEventBusError(
      () => bus.subscribe('resource.created', { subscriberId: 123, handle: () => {} } as unknown as EventHandler),
      'SUBSCRIBER_INVALID',
    );
    expectEventBusError(
      () => bus.subscribe('resource.created', { subscriberId: null, handle: () => {} } as unknown as EventHandler),
      'SUBSCRIBER_INVALID',
    );
  });

  it('maxSubscribersPerType config validation: non-positive-integer throws SUBSCRIBER_INVALID', () => {
    expectEventBusError(() => createEventBus({ maxSubscribersPerType: 0 }), 'SUBSCRIBER_INVALID');
    expectEventBusError(() => createEventBus({ maxSubscribersPerType: -1 }), 'SUBSCRIBER_INVALID');
    expectEventBusError(() => createEventBus({ maxSubscribersPerType: 1.5 }), 'SUBSCRIBER_INVALID');
    expectEventBusError(() => createEventBus({ maxSubscribersPerType: NaN }), 'SUBSCRIBER_INVALID');
  });

  it('Invalid id type (number) throws EVENT_INVALID', async () => {
    const bus = createEventBus();
    await expectAsyncEventBusError(
      () => bus.publish({ id: 123, type: 'resource.created', payload: {}, timestamp: '2026-08-12T00:00:00.000Z' } as unknown as Event),
      'EVENT_INVALID',
    );
  });

  it('Invalid timestamp type (number) throws EVENT_INVALID', async () => {
    const bus = createEventBus();
    await expectAsyncEventBusError(
      () => bus.publish({ id: 'evt_1', type: 'resource.created', payload: {}, timestamp: 123 } as unknown as Event),
      'EVENT_INVALID',
    );
  });

  it('PUBLISH_FAILED: internal error during event preparation throws PUBLISH_FAILED', async () => {
    const bus = createEventBus();

    const maliciousMetadata: Record<string, unknown> = {};
    Object.defineProperty(maliciousMetadata, 'safe', {
      get() { throw new Error('metadata getter explosion'); },
      enumerable: true,
      configurable: true,
    });

    await expectAsyncEventBusError(
      () => bus.publish({
        id: 'evt_1',
        type: 'resource.created',
        payload: {},
        timestamp: '2026-08-12T00:00:00.000Z',
        metadata: maliciousMetadata,
      }),
      'PUBLISH_FAILED',
    );
  });

  it('Event type validation: non-string type (number) on publish throws EVENT_TYPE_INVALID', async () => {
    const bus = createEventBus();
    await expectAsyncEventBusError(
      () => bus.publish({ id: 'evt_1', type: 123, payload: {}, timestamp: '2026-08-12T00:00:00.000Z' } as unknown as Event),
      'EVENT_TYPE_INVALID',
    );
  });

  it('Event type validation: non-string eventType on subscribe (number) throws EVENT_TYPE_INVALID', () => {
    const bus = createEventBus();
    expectEventBusError(
      () => bus.subscribe(123 as unknown as string, { handle: () => {} }),
      'EVENT_TYPE_INVALID',
    );
  });

  it('Event validation: boolean event throws EVENT_INVALID', async () => {
    const bus = createEventBus();
    await expectAsyncEventBusError(
      () => bus.publish(true as unknown as Event),
      'EVENT_INVALID',
    );
  });

  it('Event type validation: undefined type throws EVENT_TYPE_INVALID', async () => {
    const bus = createEventBus();
    await expectAsyncEventBusError(
      () => bus.publish({ id: 'evt_1', payload: {}, timestamp: '2026-08-12T00:00:00.000Z' } as unknown as Event),
      'EVENT_TYPE_INVALID',
    );
  });

  it('PUBLISH_FAILED with non-string type: eventType in error is undefined', async () => {
    const bus = createEventBus();

    const maliciousMetadata: Record<string, unknown> = {};
    Object.defineProperty(maliciousMetadata, 'safe', {
      get() { throw new Error('getter explosion'); },
      enumerable: true,
      configurable: true,
    });

    try {
      await bus.publish({
        id: 'evt_1',
        type: 123,
        payload: {},
        timestamp: '2026-08-12T00:00:00.000Z',
        metadata: maliciousMetadata,
      } as unknown as Event);
    } catch (err) {
      expect(err).toBeInstanceOf(EventBusError);
      const e = err as EventBusError;
      expect(e.code).toBe('PUBLISH_FAILED');
      expect(e.eventType).toBeUndefined();
      return;
    }
    expect.fail('Expected PUBLISH_FAILED');
  });

  it('Valid event with all optional fields passes validation', async () => {
    const bus = createEventBus();
    let received = false;
    bus.subscribe('resource.created', { handle: () => { received = true; } });

    const result = await bus.publish({
      id: 'evt_1',
      type: 'resource.created',
      payload: { value: 1 },
      timestamp: '2026-08-12T00:00:00.000Z',
      source: 'test-source',
      subject: 'test-subject',
      correlationId: 'corr-1',
      metadata: { key: 'value' },
    });

    expect(result.delivered).toBe(1);
    expect(received).toBe(true);
  });

  it('metadata null is allowed (undefined-check passes)', async () => {
    const bus = createEventBus();
    let received: Event<unknown> | undefined;
    bus.subscribe('resource.created', { handle: (e) => { received = e; } });

    const result = await bus.publish({
      id: 'evt_1',
      type: 'resource.created',
      payload: {},
      timestamp: '2026-08-12T00:00:00.000Z',
      metadata: undefined,
    });

    expect(result.delivered).toBe(1);
    expect(received?.metadata).toBeUndefined();
  });

  it('payload null is allowed (present but null)', async () => {
    const bus = createEventBus();
    let received: Event<unknown> | undefined;
    bus.subscribe('resource.created', { handle: (e) => { received = e; } });

    const result = await bus.publish({
      id: 'evt_1',
      type: 'resource.created',
      payload: null,
      timestamp: '2026-08-12T00:00:00.000Z',
    });

    expect(result.delivered).toBe(1);
    expect(received?.payload).toBeNull();
  });
});