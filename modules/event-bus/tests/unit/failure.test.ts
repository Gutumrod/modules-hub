import { describe, expect, it } from 'vitest';
import { createEventBus, EventBusError, type Event } from '../../index.js';

function createEvent(): Event<{ value: number }> {
  return {
    id: 'evt_1',
    type: 'resource.created',
    payload: { value: 1 },
    timestamp: '2026-08-12T00:00:00.000Z',
  };
}

describe('failure', () => {
  it('Handler failure isolation: handler 1 throwing does NOT stop handler 2 from executing', async () => {
    const bus = createEventBus();
    const calls: string[] = [];

    bus.subscribe('resource.created', {
      handle: () => { calls.push('failing'); throw new Error('boom'); },
    });
    bus.subscribe('resource.created', {
      handle: () => { calls.push('succeeding'); },
    });

    const result = await bus.publish(createEvent());

    expect(calls).toEqual(['failing', 'succeeding']);
    expect(result.delivered).toBe(1);
    expect(result.failed).toBe(1);
  });

  it('Failure collection: failed handler exception normalized into EventBusError (HANDLER_FAILED) inside failures[]', async () => {
    const bus = createEventBus();

    bus.subscribe('resource.created', {
      subscriberId: 'failing-handler',
      handle: () => { throw new Error('handler error'); },
    });

    const result = await bus.publish(createEvent());

    expect(result.failed).toBe(1);
    expect(result.failures).toHaveLength(1);
    const failure = result.failures?.[0];
    expect(failure?.subscriberId).toBe('failing-handler');
    expect(failure?.error).toBeInstanceOf(EventBusError);
    expect(failure?.error.code).toBe('HANDLER_FAILED');
    expect(failure?.error.cause).toBeInstanceOf(Error);
    expect((failure?.error.cause as Error).message).toBe('handler error');
  });

  it('PublishResult counts: delivered/failed reflect correct numbers when some handlers fail', async () => {
    const bus = createEventBus();

    bus.subscribe('resource.created', { handle: () => {} });
    bus.subscribe('resource.created', { handle: () => { throw new Error('boom'); } });
    bus.subscribe('resource.created', { handle: () => {} });
    bus.subscribe('resource.created', { handle: () => { throw new Error('boom2'); } });

    const result = await bus.publish(createEvent());

    expect(result.delivered).toBe(2);
    expect(result.failed).toBe(2);
    expect(result.failures).toHaveLength(2);
  });

  it('Error sink notification: injected onErrorSink receives normalized EventBusError + event context', async () => {
    const sinkCalls: Array<{ error: EventBusError; eventType: string; subscriberId?: string }> = [];
    const bus = createEventBus({
      onErrorSink: (error, context) => {
        sinkCalls.push({
          error,
          eventType: context.event.type,
          subscriberId: context.subscriberId,
        });
      },
    });

    bus.subscribe('resource.created', {
      subscriberId: 'fail-sink',
      handle: () => { throw new Error('sink test'); },
    });

    await bus.publish(createEvent());

    expect(sinkCalls).toHaveLength(1);
    expect(sinkCalls[0].error).toBeInstanceOf(EventBusError);
    expect(sinkCalls[0].error.code).toBe('HANDLER_FAILED');
    expect(sinkCalls[0].subscriberId).toBe('fail-sink');
    expect(sinkCalls[0].eventType).toBe('resource.created');
  });

  it('onError hook notification: hooks.onError receives the normalized error', async () => {
    const hookCalls: Array<{ error: EventBusError; subscriberId?: string }> = [];
    const bus = createEventBus({
      hooks: {
        onError: (error, context) => {
          hookCalls.push({ error, subscriberId: context.subscriberId });
        },
      },
    });

    bus.subscribe('resource.created', {
      subscriberId: 'fail-hook',
      handle: () => { throw new Error('hook test'); },
    });

    await bus.publish(createEvent());

    expect(hookCalls).toHaveLength(1);
    expect(hookCalls[0].error).toBeInstanceOf(EventBusError);
    expect(hookCalls[0].error.code).toBe('HANDLER_FAILED');
    expect(hookCalls[0].subscriberId).toBe('fail-hook');
  });

  it('Async handler rejection: a rejected async handler is collected as a failure, remaining handlers still run', async () => {
    const bus = createEventBus();
    const calls: string[] = [];

    bus.subscribe('resource.created', {
      handle: async () => { calls.push('rejecting'); throw new Error('async reject'); },
    });
    bus.subscribe('resource.created', {
      handle: () => { calls.push('succeeding'); },
    });

    const result = await bus.publish(createEvent());

    expect(calls).toEqual(['rejecting', 'succeeding']);
    expect(result.delivered).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.failures?.[0]?.error.code).toBe('HANDLER_FAILED');
  });

  it('onError fires before onErrorSink', async () => {
    const order: string[] = [];
    const bus = createEventBus({
      hooks: {
        onError: () => { order.push('hook'); },
      },
      onErrorSink: () => { order.push('sink'); },
    });

    bus.subscribe('resource.created', { handle: () => { throw new Error('boom'); } });

    await bus.publish(createEvent());

    expect(order).toEqual(['hook', 'sink']);
  });

  it('Function handler without subscriberId has undefined subscriberId in failure', async () => {
    const bus = createEventBus();

    bus.subscribe('resource.created', () => { throw new Error('fn boom'); });

    const result = await bus.publish(createEvent());

    expect(result.failed).toBe(1);
    expect(result.failures?.[0]?.subscriberId).toBeUndefined();
  });

  it('Multiple failures each get separate entries in failures[]', async () => {
    const bus = createEventBus();

    bus.subscribe('resource.created', { subscriberId: 'a', handle: () => { throw new Error('a'); } });
    bus.subscribe('resource.created', { subscriberId: 'b', handle: () => { throw new Error('b'); } });

    const result = await bus.publish(createEvent());

    expect(result.failed).toBe(2);
    expect(result.failures).toHaveLength(2);
    expect(result.failures?.[0]?.subscriberId).toBe('a');
    expect(result.failures?.[1]?.subscriberId).toBe('b');
  });
});