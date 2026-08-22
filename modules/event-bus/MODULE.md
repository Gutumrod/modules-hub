# Event Bus Module

**Version:** 0.1.0 (P1, verified)
**Status:** Reusable embedded module — core implemented, 91/91 tests passing, typecheck clean.

## Architecture

This module is a **reusable embedded module** — not a standalone service or message broker.
A Host project that needs a lightweight publish/subscribe mechanism embeds this module into its
own codebase and wires it up by injecting configuration via `EventBusConfig`.

The module has one job: maintain a subscriber registry per event type → validate and prepare
each event on `publish()` → dispatch to all registered handlers sequentially → return a
structured `PublishResult` summarizing delivery.

```
Producer (Publisher)
        ↓
  Event Bus (Registry & Pipeline)
        ↓
Subscribers (Sequential Handlers)
```

### Business example

```
[ Business Action ]  (e.g. Order Created)
        ↓
[ Domain Event ]  ("order.created")
        ↓
  [ Host Event Bus ]
        ↓
 ┌──────────────────┬──────────────────┬──────────────────┐
 ↓                  ↓                  ↓                  ↓
[ Audit Logger ] [ Notification ]  [ Metrics ]   [ Side Effects ]
```

### Architectural boundary

> **CRITICAL BOUNDARY:** The Event Bus module (v0.1) is strictly an **in-process
> publish/subscribe event bus**. It is **NOT** a distributed message queue, message broker,
> Kafka abstraction, Cloudflare Queue, RabbitMQ, durable event store, or transaction manager.
>
> Distributed messaging, event persistence across restarts, background queue retries, dead
> letter queues, cron scheduling, event sourcing, cross-service transport, webhook delivery,
> and transaction management are **explicitly out of scope**.
>
> For transaction-critical sequences, the Host must orchestrate directly. The Event Bus MUST
> NOT hide or manage critical database transactions.

The module **never** reads env (`process.env` / `env` / `globalThis`). The Host reads its
own env and injects all configuration via `createEventBus(config)`.

### Host vs. module responsibilities

| Host must do | Module does |
|---|---|
| Read env / secrets (service names, feature flags) | Never touches env — receives all configuration via `EventBusConfig` |
| Register domain event handlers and subscribe to event types | Manages subscriber registry, handler identity, and duplicate prevention |
| Define typed domain event payload structures (`Event<T>`) | Enforces core generic event schema; never knows business domain logic |
| Orchestrate database transactions and atomic rollbacks | Dispatches events strictly in-process to registered subscribers |
| Handle background job queuing and persistent retries | Delivers events at-most-once per `publish()` without any persistence |
| Sanitize hook output before writing to external log sinks | Fires hooks with event structures; never auto-logs payloads or secrets |

## Public API

All exports come from the module entry point `index.ts`. Do not import from sub-files directly.

```ts
import {
  createEventBus,
  EventBusError,
} from './index.js';
import type {
  Event,
  EventBus,
  EventBusConfig,
  EventBusErrorCode,
  EventBusHooks,
  EventHandler,
  EventHandlerFn,
  PublishFailure,
  PublishResult,
  UnsubscribeFn,
} from './index.js';
```

### `createEventBus(config?: EventBusConfig): EventBus`

Factory function that returns an `EventBus` bound to the given config. Config is optional;
if omitted, defaults apply (`crypto.randomUUID` for IDs, `new Date().toISOString()` for
timestamps, 100 max subscribers per event type, no hooks).

### `EventBus` interface

```ts
type EventBus = {
  publish<T = unknown>(event: Event<T>): Promise<PublishResult>;
  subscribe<T = unknown>(eventType: string, handler: EventHandler<T> | EventHandlerFn<T>): UnsubscribeFn;
  unsubscribe(eventType: string, subscriberIdOrHandler: string | EventHandler | EventHandlerFn): boolean;
};
```

- **`publish(event)`** — Validates and dispatches the event to all subscribers registered for
  `event.type`. Returns a `PublishResult`; never throws on handler failures.
- **`subscribe(eventType, handler)`** — Registers a handler for the given event type. Returns
  an `UnsubscribeFn` that removes the registration when called.
- **`unsubscribe(eventType, subscriberIdOrHandler)`** — Removes a subscriber by handler
  reference or `subscriberId` string. Returns `true` if removed, `false` if not found.

### Handler types

```ts
type EventHandler<T = unknown> = {
  handle(event: Event<T>): Promise<void> | void;
  subscriberId?: string;
};

type EventHandlerFn<T = unknown> = (event: Event<T>) => Promise<void> | void;

type UnsubscribeFn = () => boolean;
```

Both forms are accepted everywhere a handler is expected. Use the object form (`EventHandler`)
when you need a stable `subscriberId` for identity-based unsubscribe.

### `EventBusError` class

All errors thrown or collected by the module are instances of `EventBusError`.

```ts
class EventBusError extends Error {
  readonly code: EventBusErrorCode;
  readonly eventId?: string;
  readonly eventType?: string;
  readonly subscriberId?: string;
  readonly cause?: unknown;
}
```

## Event contract

```ts
type Event<T = unknown> = {
  id: string;            // required, non-empty string
  type: string;          // required, matches /^[a-zA-Z0-9_.-]+$/
  payload: T;            // required
  timestamp: string;     // required, non-empty string
  source?: string;
  subject?: string;
  correlationId?: string;
  metadata?: Record<string, unknown>;  // must be an object when provided
};
```

### Event auto-fill

If `id` or `timestamp` is omitted when calling `publish()`, the bus fills them using
`idGenerator` and `timestampProvider` from `EventBusConfig`. The `payload` field is always
required and must be explicitly provided by the caller.

### Event type namespacing

Event types are free-form strings matching `/^[a-zA-Z0-9_.-]+$/`. The recommended convention
is dot-separated namespacing — for example: `resource.created`, `payment.succeeded`,
`subscription.expired`. The core never enforces business event naming; any valid string is
accepted.

## Delivery semantics

| Semantic | Behavior |
|---|---|
| In-process | Delivery occurs strictly within the current process memory space |
| At-most-once | Each `publish()` invocation delivers to currently registered subscribers at most once |
| Not durable | Zero disk, database, or queue backing |
| No restart recovery | Unprocessed events are lost on process crash or restart |
| No exactly-once | The Event Bus makes no exactly-once delivery guarantees — never claim this |

> **Implication:** If the process crashes mid-publish, in-flight events are lost. For durable
> event delivery, use a dedicated queue (Cloudflare Queues, RabbitMQ, etc.) outside this module.

## Subscriber execution

Subscriber execution is deterministic and sequential:

1. Subscribers registered for a given `eventType` execute in the exact order of registration (FIFO).
2. Each handler is awaited individually before the next one runs.
3. **No parallel execution in v0.1** — `Promise.all` fan-out is not supported and is reserved
   as a future explicit opt-in mode.

```
publish("order.created")
   ├─► await Subscriber 1  (audit-logger)
   ├─► await Subscriber 2  (notification-handler)
   └─► await Subscriber 3  (metrics-handler)
```

## Handler failure isolation

One failing subscriber never disrupts the remaining subscribers:

1. Each subscriber call is wrapped in its own `try / catch`.
2. A handler exception is caught, normalized into `EventBusError` with code `HANDLER_FAILED`,
   recorded in `PublishResult.failures`, and execution continues with the next subscriber.
3. `publish()` always resolves — it never throws on handler failures.

```ts
const result = await bus.publish(event);
// result shape when one of three handlers throws:
// {
//   delivered: 2,
//   failed: 1,
//   failures: [
//     {
//       subscriberId: 'metrics-handler',
//       error: EventBusError { code: 'HANDLER_FAILED', message: '...', ... }
//     }
//   ]
// }
```

### `PublishResult` type

```ts
type PublishResult = {
  delivered: number;
  failed: number;
  failures?: PublishFailure[];
};

type PublishFailure = {
  subscriberId?: string;
  error: EventBusError;
};
```

`failures` is only present when `failed > 0`. When there are no failures, `failures` is
`undefined`.

## Duplicate subscription & registry management

The registry enforces idempotent subscriptions:

- Registering the exact same handler reference for the same `eventType` is a no-op — the
  existing `UnsubscribeFn` is returned, no second execution entry is created.
- Registering a handler with the same `subscriberId` for the same `eventType` is also a
  no-op under the same rule.
- `maxSubscribersPerType` (default: 100) caps the number of distinct handlers per event type.
  Exceeding this limit throws `SUBSCRIBER_INVALID`.

### Unsubscribe

Two equivalent approaches:

```ts
// 1. Via the returned UnsubscribeFn
const unsub = bus.subscribe('order.created', handler);
const removed = unsub(); // true if removed, false if already gone

// 2. Via bus.unsubscribe()
bus.unsubscribe('order.created', 'audit-logger');    // by subscriberId string
bus.unsubscribe('order.created', handlerReference);  // by handler reference
```

Both return `true` if a subscription was removed, `false` if no matching handler was found.
Calling an `UnsubscribeFn` for an already-removed handler returns `false` without throwing.

## Wildcards & routing

v0.1 supports **exact event type matching only**. Pattern routing is not supported:

| Pattern | Supported |
|---|---|
| `'order.created'` (exact match) | ✓ |
| `'*'` (global wildcard) | ✗ — not in v0.1 |
| `'payment.*'` (prefix wildcard) | ✗ — not in v0.1 |
| `/regex/` (pattern routing) | ✗ — not in v0.1 |

An event published with type `'payment.succeeded'` triggers only handlers subscribed to the
exact string `'payment.succeeded'`.

## Error model

| Code | Trigger | Handling |
|---|---|---|
| `EVENT_INVALID` | Event is not an object, or missing/invalid `id`, `payload`, or `timestamp`; `metadata` is not an object when provided | Thrown synchronously during `publish()` |
| `EVENT_TYPE_INVALID` | `eventType` is empty, not a string, contains spaces, or fails `/^[a-zA-Z0-9_.-]+$/` | Thrown synchronously during `subscribe()` or `publish()` |
| `SUBSCRIBER_INVALID` | Handler is not a function and lacks `.handle()`; `subscriberId` is not a valid non-empty string; or `maxSubscribersPerType` exceeded | Thrown synchronously during `subscribe()` |
| `HANDLER_FAILED` | A subscriber handler threw during execution | Normalized and collected in `PublishResult.failures[]`; `publish()` still resolves |
| `PUBLISH_FAILED` | Internal error preparing the event for dispatch | Thrown during `publish()` |

## Security

1. **No payload auto-logging.** The module never auto-logs `event.payload`, tokens, passwords,
   secrets, or PII. Telemetry hooks receive event structures but must not log unsanitized payload
   contents. Sanitize before passing to any external log sink.

2. **Not an audit log.** The Event Bus is a transient in-process dispatcher. It provides no
   immutability, ordering guarantees, or audit trail. Use a dedicated audit log service for
   compliance-grade event recording.

3. **No env access.** The module never reads `process.env`, `env`, or `globalThis.process`. All
   configuration is injected explicitly by the Host via `EventBusConfig`.

4. **Cloudflare Workers compatible.** Zero `node:*` imports. Uses Web APIs exclusively:
   `crypto.randomUUID`, `Date`, `Object`, `Promise`.

5. **Prototype pollution protection.** Unsafe keys (`__proto__`, `constructor`, `prototype`) are
   filtered out during event preparation and metadata sanitization. All internal containers are
   created via `Object.create(null)`.

6. **Hook safety.** All hook calls (`onPublish`, `onSubscribe`, `onUnsubscribe`, `onError`,
   `onErrorSink`) are wrapped in individual `try / catch` blocks. A throwing hook is silently
   swallowed and never affects the publish outcome or return value.

## Config contract

### `EventBusConfig`

```ts
type EventBusConfig = {
  idGenerator?: () => string;
  timestampProvider?: () => string;
  maxSubscribersPerType?: number;
  hooks?: EventBusHooks;
  onErrorSink?: (error: EventBusError, context: { event: Event; subscriberId?: string }) => void;
};
```

| Field | Default | Description |
|---|---|---|
| `idGenerator` | `() => crypto.randomUUID()` | Custom ID generator for events published without an explicit `id`. |
| `timestampProvider` | `() => new Date().toISOString()` | Custom timestamp provider for events published without a `timestamp`. |
| `maxSubscribersPerType` | `100` | Safety limit on distinct handlers per event type. Must be a positive integer. |
| `hooks` | `undefined` | Optional telemetry and logging hooks. Hook exceptions are silently swallowed. |
| `onErrorSink` | `undefined` | Optional handler failure callback for reporting to APM or Sentry. Fires after `hooks.onError`. |

### `EventBusHooks`

```ts
type EventBusHooks = {
  onPublish?: (event: Event) => void;
  onSubscribe?: (eventType: string, subscriberId?: string) => void;
  onUnsubscribe?: (eventType: string, subscriberId?: string) => void;
  onError?: (error: EventBusError, context: { event: Event; subscriberId?: string }) => void;
};
```

**Timing:**
- `onPublish` fires once before handler dispatch, after event preparation and validation.
- `onSubscribe` fires once when a new (non-duplicate) subscription is registered.
- `onUnsubscribe` fires once when a subscription is successfully removed.
- `onError` fires per failing handler after the exception is normalized into `EventBusError`.
  `onErrorSink` fires immediately after `onError` for the same error context.

## How to integrate

### Steps

1. Copy the module folder into your repo.
2. In your Cloudflare Worker, declare an `Env` interface with any required service identifiers.
3. Build an `EventBusConfig` with your hooks and `onErrorSink` — all values read from your
   own `env`, never from the module.
4. Call `createEventBus(config)` to obtain an `EventBus`.
5. Subscribe handlers by calling `bus.subscribe(eventType, handler)` and retain the returned
   `UnsubscribeFn` if you need to unsubscribe later.
6. Publish events by calling `bus.publish(event)`. Inspect `PublishResult.failures` for handler
   errors. Catch `EventBusError` thrown by invalid inputs (`EVENT_INVALID`, `EVENT_TYPE_INVALID`,
   `SUBSCRIBER_INVALID`).

### Quick reference

```ts
import { createEventBus, EventBusError } from './index.js';

const bus = createEventBus({
  hooks: {
    onPublish: (event) => console.log(`→ ${event.type} id=${event.id}`),
    onError: (err, ctx) => console.error(`[${err.code}] subscriber=${ctx.subscriberId ?? '<fn>'}`),
  },
});

// Object handler form — explicit subscriberId for stable registry identity.
const unsub = bus.subscribe('order.created', {
  subscriberId: 'audit-logger',
  handle(event) {
    console.log(`[audit] id=${event.id}`);
  },
});

// Function handler form.
bus.subscribe('order.created', async (event) => {
  await sendNotification(event.payload);
});

// Publish — id and timestamp are auto-filled by the bus if omitted.
const result = await bus.publish({
  id: crypto.randomUUID(),
  type: 'order.created',
  timestamp: new Date().toISOString(),
  payload: { orderId: 'ord_123', totalCents: 4999 },
});
console.log(`delivered=${result.delivered} failed=${result.failed}`);

// Unsubscribe via returned handle or by subscriberId.
unsub();
bus.unsubscribe('order.created', 'audit-logger');

// Catch EventBusError for invalid inputs — handler failures do NOT throw.
try {
  await bus.publish({ id: '', type: 'order.created', timestamp: '', payload: null });
} catch (err) {
  if (err instanceof EventBusError) console.error(err.code); // 'EVENT_INVALID'
}
```

See `examples/integration.example.ts` for the full Cloudflare Worker wiring example.

### Integration checklist

- [ ] Copy the module folder into the target repo
- [ ] Declare typed `Event<YourPayload>` at the host level — the core never knows your domain structures
- [ ] Wire `hooks` to your logging or tracing framework — never log `event.payload` unsanitized
- [ ] Wire `onErrorSink` to Sentry / APM if handler failures need external monitoring
- [ ] Set `maxSubscribersPerType` to a value appropriate for your fan-out needs (default: 100)
- [ ] Use `subscriberId` on object handlers for stable identity across subscribe/unsubscribe cycles
- [ ] Inspect `PublishResult.failures` after every `publish()` call in critical code paths
- [ ] Never rely on the Event Bus for durable delivery, persistence, or exactly-once semantics
- [ ] Run `npm run typecheck` before deploy

## Versioning

Standard semver — bump the version in `VERSION` on every change. No CHANGELOG or migration
guide until the module has been embedded in ≥ 2 real projects and the contract has stabilized.

## Promote to shared package when

The module has been embedded in ≥ 2–3 projects without changes to the `core/` contract
(only config or hook changes on the Host side) — then extract to an npm package.
