/**
 * Generic Cloudflare Worker Host Example — reference only when integrating into a real
 * project. Do NOT copy this file wholesale into production.
 *
 * Shows how a Host wires the Event Bus module:
 *   - The Host declares its own Env interface; the module never reads env.
 *   - All config (hooks, onErrorSink) is injected via EventBusConfig.
 *   - Demonstrates both object EventHandler (with subscriberId) and function EventHandlerFn.
 *   - Shows handler failure isolation: one failing subscriber does not stop others.
 */

import { createEventBus, EventBusError } from '../index.js';
import type {
  Event,
  EventBus,
  EventBusConfig,
  EventHandler,
  PublishResult,
} from '../index.js';

// Host-owned environment bindings — the module never reads these.
interface Env {
  SERVICE_NAME: string;  // e.g. 'order-service' — used to tag log output
}

// Typed payload for a host-defined domain event.
type OrderCreatedPayload = {
  orderId: string;
  userId: string;
  totalCents: number;
};

// Object handler form — carries an explicit subscriberId for stable registry identity.
const auditHandler: EventHandler<OrderCreatedPayload> = {
  subscriberId: 'audit-logger',
  handle(event: Event<OrderCreatedPayload>): void {
    // Never log event.payload directly in production — it may contain PII or secrets.
    console.log(`[audit] type=${event.type} id=${event.id}`);
  },
};

// Function handler form — EventHandlerFn.
async function notificationHandler(event: Event<OrderCreatedPayload>): Promise<void> {
  await Promise.resolve();
  console.log(`[notify] order=${event.payload.orderId} user=${event.payload.userId}`);
}

// Handler that intentionally throws — demonstrates failure isolation:
// remaining subscribers still execute after this one fails.
function flakyMetricsHandler(_event: Event<OrderCreatedPayload>): void {
  throw new Error('Metrics backend unavailable');
}

// Build a configured EventBus for this Worker.
// Hoist outside fetch() in production to reuse the same bus instance across requests.
function buildBus(serviceName: string): EventBus {
  const config: EventBusConfig = {
    hooks: {
      onPublish: (event: Event) =>
        console.log(`[bus] publish service=${serviceName} type=${event.type} id=${event.id}`),
      onSubscribe: (eventType: string, subscriberId?: string) =>
        console.log(`[bus] subscribe type=${eventType} id=${subscriberId ?? '<fn>'}`),
      onUnsubscribe: (eventType: string, subscriberId?: string) =>
        console.log(`[bus] unsubscribe type=${eventType} id=${subscriberId ?? '<fn>'}`),
      onError: (error: EventBusError, context: { event: Event; subscriberId?: string }) =>
        console.error(
          `[bus] error code=${error.code} subscriber=${context.subscriberId ?? '<fn>'} eventId=${context.event.id}`,
        ),
    },
    onErrorSink: (error: EventBusError, context: { event: Event; subscriberId?: string }) => {
      // Forward to APM / Sentry in production.
      console.error(
        `[sink] code=${error.code} subscriber=${context.subscriberId ?? '<fn>'} eventId=${context.event.id}`,
      );
    },
  };

  return createEventBus(config);
}

// Print a PublishResult summary — inspect failures[] for HANDLER_FAILED details.
function logResult(result: PublishResult): void {
  console.log(`delivered=${result.delivered} failed=${result.failed}`);
  for (const failure of result.failures ?? []) {
    console.error(`  ↳ [${failure.subscriberId ?? '<fn>'}] ${failure.error.code}: ${failure.error.message}`);
  }
}

// Cloudflare Worker default export.
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    const bus = buildBus(env.SERVICE_NAME);

    // Register object handler — subscriberId='audit-logger'; idempotent re-subscribe.
    const unsubAudit = bus.subscribe<OrderCreatedPayload>('order.created', auditHandler);

    // Register function handler.
    const unsubNotify = bus.subscribe<OrderCreatedPayload>('order.created', notificationHandler);

    // Register failing handler — failure isolation keeps auditHandler and notificationHandler running.
    void bus.subscribe<OrderCreatedPayload>('order.created', flakyMetricsHandler);

    if (request.method === 'POST' && pathname === '/orders') {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return new Response('Invalid JSON body.', { status: 400 });
      }

      // Construct a domain event — id and timestamp are auto-filled by the bus if omitted.
      const event: Event<OrderCreatedPayload> = {
        id: crypto.randomUUID(),
        type: 'order.created',
        timestamp: new Date().toISOString(),
        payload: body as OrderCreatedPayload,
        source: env.SERVICE_NAME,
        correlationId: request.headers.get('x-correlation-id') ?? undefined,
      };

      const result = await bus.publish(event);
      // Typical output: delivered=2, failed=1 — flakyMetricsHandler recorded as HANDLER_FAILED.
      // publish() resolves normally; handler errors never cause publish() to throw.
      logResult(result);

      // Unsubscribe notificationHandler via the returned UnsubscribeFn (returns true).
      const notifyRemoved = unsubNotify();
      console.log(`notificationHandler removed=${notifyRemoved}`);

      // Alternatively, unsubscribe by subscriberId via bus.unsubscribe() (returns true).
      const auditRemoved = bus.unsubscribe('order.created', 'audit-logger');
      console.log(`auditHandler removed=${auditRemoved}`);

      // Re-calling the UnsubscribeFn for an already-removed handler returns false — no throw.
      const alreadyGone = unsubAudit();
      console.log(`unsubAudit re-call removed=${alreadyGone}`);

      return Response.json(
        { delivered: result.delivered, failed: result.failed },
        { status: 202 },
      );
    }

    // Clean up subscriptions before returning on non-matching routes.
    unsubAudit();
    unsubNotify();

    return new Response('Not found.', { status: 404 });
  },
};
