/**
 * Single-command runnable example for the Event Bus module.
 *
 * Run it with:  npm run example
 *
 * Self-contained: no network, no file system access, no environment reads, no secrets.
 * It exercises the real module behaviour and prints one final line starting with
 * `EXAMPLE_RESULT: OK` followed by the counts it actually observed.
 */

import { createEventBus, EventBusError } from '../index.js';
import type { Event, EventHandler, PublishResult } from '../index.js';

type OrderPayload = {
  orderId: string;
  totalCents: number;
};

/** Build a domain event with an explicit id and timestamp (both are required fields). */
function orderEvent(type: string, orderId: string, totalCents: number, correlationId: string): Event<OrderPayload> {
  return {
    id: `${type}:${orderId}`,
    type,
    payload: { orderId, totalCents },
    timestamp: '2026-09-27T00:00:00.000Z',
    source: 'example-host',
    correlationId,
  };
}

async function main(): Promise<void> {
  // 1. Observed side effects, recorded so the summary line is measured, not assumed.
  const received: string[] = [];
  let publishHookCount = 0;
  let subscribeHookCount = 0;
  let unsubscribeHookCount = 0;
  const reportedErrorCodes: string[] = [];
  let errorSinkCount = 0;

  // 2. Wire the bus with hooks. The module never reads env or auto-logs payloads.
  const bus = createEventBus({
    hooks: {
      onPublish: (event: Event) => {
        publishHookCount += 1;
        received.push(`publish:${event.type}`);
      },
      onSubscribe: () => {
        subscribeHookCount += 1;
      },
      onUnsubscribe: () => {
        unsubscribeHookCount += 1;
      },
      onError: (error: EventBusError) => {
        reportedErrorCodes.push(error.code);
      },
    },
    onErrorSink: (error: EventBusError) => {
      errorSinkCount += 1;
      reportedErrorCodes.push(`sink:${error.code}`);
    },
  });

  // 3. Subscribe three handlers to 'order.created'. Execution is sequential, in
  //    registration order (FIFO) — no parallel fan-out in this version.
  const auditHandler: EventHandler<OrderPayload> = {
    subscriberId: 'order-created-audit',
    handle(event: Event<OrderPayload>): void {
      received.push(`audit:${event.id}`);
    },
  };

  const metricsHandler: EventHandler<OrderPayload> = {
    subscriberId: 'order-created-metrics',
    handle(): void {
      // Deliberately throws to demonstrate handler failure isolation.
      throw new Error('metrics backend unavailable');
    },
  };

  const notifyHandler = async (event: Event<OrderPayload>): Promise<void> => {
    received.push(`notify:${event.payload.orderId}`);
  };

  const unsubscribeAudit = bus.subscribe<OrderPayload>('order.created', auditHandler);
  // Re-subscribing the exact same handler reference is a no-op: the registry returns
  // the existing UnsubscribeFn instead of creating a second execution entry.
  const duplicateUnsubscribe = bus.subscribe<OrderPayload>('order.created', auditHandler);
  const duplicateIsNoOp = duplicateUnsubscribe === unsubscribeAudit;

  bus.subscribe<OrderPayload>('order.created', metricsHandler);
  bus.subscribe<OrderPayload>('order.created', notifyHandler);
  bus.subscribe<OrderPayload>('order.updated', {
    subscriberId: 'order-updated-audit',
    handle(event: Event<OrderPayload>): void {
      received.push(`audit:${event.id}`);
    },
  });

  // 4. Publish to the type with three subscribers: two succeed, one throws.
  //    publish() never throws on handler failure — it reports the failure instead.
  const createdResult: PublishResult = await bus.publish(
    orderEvent('order.created', 'ord_1001', 4999, 'trace-ord-1001'),
  );
  const createdFailures = createdResult.failures ?? [];
  const createdFailureCode = createdFailures[0]?.error.code ?? 'none';

  // 5. Publish to a type with exactly one subscriber: no failure, and the
  //    `failures` property is absent on the result.
  const updatedResult: PublishResult = await bus.publish(
    orderEvent('order.updated', 'ord_1002', 1200, 'trace-ord-1002'),
  );

  // 6. Publish to a type nobody subscribed to: deliver nothing, report nothing.
  const unsubscribedResult: PublishResult = await bus.publish(
    orderEvent('order.cancelled', 'ord_1003', 0, 'trace-ord-1003'),
  );

  // 7. Remove subscribers both ways, and confirm a second removal reports false.
  const removedViaHandle = unsubscribeAudit();
  const removedViaHandleAgain = unsubscribeAudit();
  const removedViaIdArgument = bus.unsubscribe('order.updated', 'order-updated-audit');
  const removedViaIdArgumentAgain = bus.unsubscribe('order.updated', 'order-updated-audit');

  // 8. Invalid input throws a typed EventBusError synchronously.
  const invalidCodes: string[] = [];
  try {
    await bus.publish({ id: '', type: 'order.created', payload: null, timestamp: '' });
  } catch (error) {
    if (error instanceof EventBusError) {
      invalidCodes.push(error.code);
    }
  }
  try {
    bus.subscribe<OrderPayload>('order created', notifyHandler);
  } catch (error) {
    if (error instanceof EventBusError) {
      invalidCodes.push(error.code);
    }
  }

  // 9. Print what happened.
  console.log('published event types: order.created, order.updated, order.cancelled');
  console.log('handlers registered: 4 (3 for order.created, 1 for order.updated)');
  console.log(`order.created  -> delivered=${createdResult.delivered} failed=${createdResult.failed} failureCode=${createdFailureCode}`);
  console.log(`order.updated  -> delivered=${updatedResult.delivered} failed=${updatedResult.failed} failures=${updatedResult.failures === undefined ? 'absent' : 'present'}`);
  console.log(`order.cancelled-> delivered=${unsubscribedResult.delivered} failed=${unsubscribedResult.failed} failures=${unsubscribedResult.failures === undefined ? 'absent' : 'present'}`);
  console.log(`duplicate subscribe returned same UnsubscribeFn: ${duplicateIsNoOp}`);
  console.log(`unsubscribe via handle: ${removedViaHandle}, second call: ${removedViaHandleAgain}`);
  console.log(`unsubscribe via subscriberId: ${removedViaIdArgument}, second call: ${removedViaIdArgumentAgain}`);
  console.log(`handler invocations recorded: ${received.join(', ')}`);

  const totalPublished = 3;
  const totalDelivered = createdResult.delivered + updatedResult.delivered + unsubscribedResult.delivered;
  const totalFailed = createdResult.failed + updatedResult.failed + unsubscribedResult.failed;
  const removals = [removedViaHandle, removedViaHandleAgain, removedViaIdArgument, removedViaIdArgumentAgain].filter(Boolean).length;

  console.log(
    `EXAMPLE_RESULT: OK published=${totalPublished} delivered=${totalDelivered} failed=${totalFailed} ` +
      `handlerFailureCode=${createdFailureCode} newSubscriptions=${subscribeHookCount} removals=${removals} ` +
      `publishHooks=${publishHookCount} unsubscribeHooks=${unsubscribeHookCount} onErrorCalls=${reportedErrorCodes.filter((c) => !c.startsWith('sink:')).length} ` +
      `onErrorSinkCalls=${errorSinkCount} invalidInputCodes=${invalidCodes.join('+')}`,
  );
}

await main();
