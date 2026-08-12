# Event Bus Module — DESIGN.md

**Version:** 0.1.0 (P0, experimental)  
**Status:** Design (Stage 1 — Architect). This file is the single source of truth for downstream agents (Stage 2 implementer, Stage 3 tester, Stage 4 reviewer).  
**Language / runtime:** TypeScript, ES2022, strict mode, `moduleResolution: Bundler`. Must run on Cloudflare Workers (no `node:*` imports; Web APIs only).  

---

## 1. Purpose

A reusable, embedded **In-Process Event Bus module** for the Module Hub monorepo. It provides a lightweight, deterministic publish/subscribe mechanism for decoupling components, domains, and embedded modules inside a single Host application process.

The architecture follows a strict in-process pub/sub design:

```
Producer (Publisher)
       ↓
   Event Bus (Registry & Pipeline)
       ↓
Subscribers (Sequential Handlers)
```

### Business Example

```
[ Business Action ] (e.g. Order Created)
       ↓
[ Domain Event ] ("order.created")
       ↓
[ Host Event Bus ]
       ↓
 ┌─────────────────┬──────────────────┬──────────────────┐
 ↓                 ↓                  ↓                  ↓
[ Audit Logger ]  [ Notification ]   [ Metrics ]   [ Side Effects ]
```

### Architectural Boundary

> **CRITICAL BOUNDARY:** The Event Bus module (v0.1) is strictly an **in-process publish/subscribe event bus**. It is **NOT** a distributed message queue, message broker, Kafka abstraction, Cloudflare Queue, RabbitMQ, durable event store, or transaction manager.
> 
> Distributed messaging, event persistence across process restarts, background queue retries, dead letter queues (DLQ), cron scheduling, event sourcing, cross-service transport, webhook delivery, and transaction management are **EXPLICITLY OUT OF SCOPE**.
> 
> The Host application MUST orchestrate transaction-critical sequences directly (e.g., database writes and atomic commits). The Event Bus MUST NOT hide or manage critical database transactions.

### Host responsibilities vs module responsibilities

| Host does | Module does |
|---|---|
| Reads `process.env` / `env` / `globalThis` | Never touches env — receives configuration via `EventBusConfig` |
| Orchestrates database transactions & rollbacks | Dispatches events strictly in-process to registered subscribers |
| Defines business domain event structures | Enforces core generic event schema; core never knows domain business logic |
| Registers handlers & subscribes to event types | Manages subscriber registry, handler identity, and duplicate prevention |
| Handles background job queuing & persistent retries | Delivers events at-most-once per `publish()` invocation without persistence |

---

## 2. Public API (exact signatures)

All public types, functions, and interfaces are exported from the module's entry point (`index.ts` and `core/index.ts`).

```ts
// core/bus.ts
export function createEventBus(config?: EventBusConfig): EventBus;

// EventBus Interface
export interface EventBus {
  publish<T = unknown>(event: Event<T>): Promise<PublishResult>;
  subscribe<T = unknown>(eventType: string, handler: EventHandler<T> | EventHandlerFn<T>): UnsubscribeFn;
  unsubscribe(eventType: string, subscriberIdOrHandler: string | EventHandler | EventHandlerFn): boolean;
}

// Unsubscribe Function Handle
export type UnsubscribeFn = () => boolean;

// EventHandler Interface & Function Signature
export interface EventHandler<T = unknown> {
  handle(event: Event<T>): Promise<void> | void;
  subscriberId?: string;
}

export type EventHandlerFn<T = unknown> = (event: Event<T>) => Promise<void> | void;
```

---

## 3. Exact Core Types

```ts
/** Standardized Generic Event Contract */
export type Event<T = unknown> = {
  /** Unique event identifier (UUID v4 or system generated) */
  id: string;
  /** Namespaced event type string (e.g., 'resource.created') */
  type: string;
  /** Event payload payload data */
  payload: T;
  /** ISO 8601 UTC timestamp string */
  timestamp: string;
  /** Optional event source identifier (e.g., 'order-service') */
  source?: string;
  /** Optional subject identifier (e.g., 'user_123') */
  subject?: string;
  /** Optional correlation ID for tracing distributed execution flows */
  correlationId?: string;
  /** Optional arbitrary metadata key-value map */
  metadata?: Record<string, unknown>;
};

/** Result of a publish invocation returned to caller */
export type PublishResult = {
  /** Total number of subscribers that processed the event successfully */
  delivered: number;
  /** Total number of subscribers that threw an error during handling */
  failed: number;
  /** Array of subscriber failure details, present if failed > 0 */
  failures?: Array<{
    subscriberId?: string;
    error: EventBusError;
  }>;
};

/** Standardized Event Bus Error Class */
export class EventBusError extends Error {
  readonly code: EventBusErrorCode;
  readonly eventId?: string;
  readonly eventType?: string;
  readonly subscriberId?: string;
  readonly cause?: unknown;

  constructor(options: {
    message: string;
    code: EventBusErrorCode;
    eventId?: string;
    eventType?: string;
    subscriberId?: string;
    cause?: unknown;
  }) {
    super(options.message);
    this.name = 'EventBusError';
    this.code = options.code;
    this.eventId = options.eventId;
    this.eventType = options.eventType;
    this.subscriberId = options.subscriberId;
    this.cause = options.cause;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Specific Error Codes emitted by the module */
export type EventBusErrorCode =
  | 'EVENT_INVALID'
  | 'EVENT_TYPE_INVALID'
  | 'SUBSCRIBER_INVALID'
  | 'HANDLER_FAILED'
  | 'PUBLISH_FAILED';

/** Optional Telemetry Hooks */
export type EventBusHooks = {
  onPublish?: (event: Event) => void;
  onSubscribe?: (eventType: string, subscriberId?: string) => void;
  onUnsubscribe?: (eventType: string, subscriberId?: string) => void;
  onError?: (error: EventBusError, context: { event: Event; subscriberId?: string }) => void;
};

/** Event Bus Factory Configuration */
export type EventBusConfig = {
  /** Optional custom ID generator function (Defaults to Web API crypto.randomUUID) */
  idGenerator?: () => string;
  /** Optional custom timestamp generator (Defaults to ISO 8601 UTC string) */
  timestampProvider?: () => string;
  /** Maximum allowed subscribers per event type to prevent memory leaks (Default: 100) */
  maxSubscribersPerType?: number;
  /** Optional telemetry & logging hooks */
  hooks?: EventBusHooks;
  /** Optional external failure sink for unhandled exception monitoring */
  onErrorSink?: (error: EventBusError, context: { event: Event; subscriberId?: string }) => void;
};
```

---

## 4. Event Contract & Namespacing

The event contract is strictly generic (`Event<T>`). The core module **MUST NOT** possess any knowledge about specific business domains or domain event structures.

- **Namespaced Strings:** Event types MUST be dot-separated namespaced strings.
  - Examples: `resource.created`, `resource.updated`, `payment.succeeded`, `subscription.expired`.
- **No Enforcement:** The core **MUST NOT** restrict or enforce business event names. Any non-empty string matching the validation pattern `/^[a-zA-Z0-9_\-.]+$/` without wildcards is valid.
- **Header Metadata:** Fields such as `id`, `type`, `payload`, and `timestamp` are required. Optional fields (`source`, `subject`, `correlationId`, `metadata`) are preserved verbatim across dispatching.

---

## 5. Delivery Semantics

- **In-Process Delivery:** Delivery occurs synchronously/asynchronously strictly within the memory space of the executing process.
- **At-Most-Once:** Event delivery is **at-most-once** per `publish()` invocation. If an application process crashes or restarts during `publish()`, in-flight events are lost.
- **No Persistence:** There is zero disk, database, or durable queue backing.
- **No Restart Recovery:** Unprocessed events cannot be recovered after process restarts.
- **No Exactly-Once Claims:** Under no circumstances does the Event Bus claim or attempt to provide exactly-once delivery guarantees.

---

## 6. Subscriber Execution Model

Subscriber execution is strictly **deterministic**:

1. **Subscription Order (FIFO):** Subscribers registered for a specific `eventType` are executed in the exact order of their registration.
2. **Sequential Execution:** Handlers are awaited sequentially one by one (`await handler(event)`).
3. **No Parallel Execution in v0.1:** Parallel / concurrent handler execution (`Promise.all`) is **NOT** supported in v0.1 and is reserved as a future explicit configuration mode.

```
publish("order.created")
   ├─► Await Subscriber 1
   ├─► Await Subscriber 2
   └─► Await Subscriber 3
```

---

## 7. Handler Failure Isolation

One failing subscriber MUST NOT disrupt the execution of other registered subscribers.

1. **Isolation Guarantee:** Every subscriber call is wrapped in an individual `try / catch` boundary.
2. **Continued Dispatch:** If Subscriber 1 throws an unhandled exception, the core catches the exception, normalizes it into an `EventBusError` with code `HANDLER_FAILED`, records it in `PublishResult.failures`, increments `failed`, and **continues to execute Subscriber 2 and Subscriber 3**.
3. **Structured Publish Result:** `publish()` returns a `PublishResult` object summarizing execution:

```ts
const result = await bus.publish(event);
// result shape:
// {
//   delivered: 2,
//   failed: 1,
//   failures: [
//     {
//       subscriberId: 'audit-handler',
//       error: EventBusError { code: 'HANDLER_FAILED', message: 'DB Connection down', ... }
//     }
//   ]
// }
```

---

## 8. Duplicate Subscription & Registry Management

To prevent duplicate handler execution and memory leaks:

1. **Subscriber Identity:**
   - Handlers may supply an explicit `subscriberId` property on object handlers (`handler.subscriberId`) or function references.
   - If no `subscriberId` is provided, a stable function reference check is performed.
2. **Duplicate Registration Prevention:**
   - Registering the exact same handler reference or `subscriberId` multiple times for the same `eventType` is **idempotent**. The registry ignores duplicate registrations and returns the existing `UnsubscribeFn`.
3. **Deterministic Unsubscribe:**
   - Unsubscribing can be performed either by invoking the returned `UnsubscribeFn()` or by calling `bus.unsubscribe(eventType, subscriberIdOrHandler)`.
   - `unsubscribe()` returns `true` if a subscription was removed, or `false` if no matching handler was found.

---

## 9. Wildcards & Event Routing

- **Exact Matching Only:** v0.1 supports exact string matching on `eventType` only.
- **No Wildcards:** Pattern matching syntax such as `'*'`, `'payment.*'`, `'resource.*.created'`, or regex patterns are **EXPLICITLY FORBIDDEN** in v0.1.
- An event with type `'payment.succeeded'` will ONLY trigger handlers subscribed strictly to `'payment.succeeded'`.

---

## 10. Error Model & Codes

All errors thrown or collected by the module are instances of `EventBusError`.

| Error Code | Trigger Condition / Semantics | Handling & Recovery |
|---|---|---|
| `EVENT_INVALID` | Event object is `null`, `undefined`, or missing required fields (`id`, `type`, `payload`, `timestamp`). | Thrown synchronously during `publish()` |
| `EVENT_TYPE_INVALID` | `eventType` is empty, not a string, contains spaces, or contains wildcard characters (`*`). | Thrown synchronously during `subscribe()` or `publish()` |
| `SUBSCRIBER_INVALID` | Handler passed to `subscribe()` is not a function and lacks a `.handle()` method. | Thrown synchronously during `subscribe()` |
| `HANDLER_FAILED` | A subscriber handler threw an exception during execution. | Normalized and collected in `PublishResult.failures[]` |
| `PUBLISH_FAILED` | Internal error within the event bus pipeline during dispatching. | Thrown during `publish()` |

---

## 11. Security Requirements

1. **No Sensitive Payload Auto-Logging:**
   - The Event Bus core MUST NEVER auto-log event payloads (`event.payload`), secrets, passwords, auth tokens, or PII to console or external sinks.
   - Telemetry hooks receive event structures but MUST NOT log un-sanitized payload contents.
2. **Not an Audit Log:**
   - The Event Bus is an transient in-process dispatcher, NOT a secure audit log or immutable event ledger.
3. **No Environment Access:**
   - The module MUST NOT read `process.env`, `env`, or `globalThis.process`. All configuration is injected via `EventBusConfig`.
4. **Cloudflare Workers Compatibility:**
   - Zero `node:*` imports. Uses Web APIs exclusively (`crypto.randomUUID`, `Date.now`, `Object.assign`, `Object.freeze`).
5. **Prototype Pollution Protection:**
   - When shallow-copying events or metadata maps, the core filters out unsafe keys (`__proto__`, `constructor`, `prototype`) and creates clean dictionary containers (`Object.create(null)` or sanitized object copies).

---

## 12. Config Contract

### `EventBusConfig`

```ts
export type EventBusConfig = {
  idGenerator?: () => string;
  timestampProvider?: () => string;
  maxSubscribersPerType?: number;
  hooks?: EventBusHooks;
  onErrorSink?: (error: EventBusError, context: { event: Event; subscriberId?: string }) => void;
};
```

| Field | Default | Description |
|---|---|---|
| `idGenerator` | `() => crypto.randomUUID()` | Custom event ID generator for events published without an explicit ID. |
| `timestampProvider` | `() => new Date().toISOString()` | Custom UTC timestamp provider for events published without a timestamp. |
| `maxSubscribersPerType` | `100` | Safety limit capping subscribers per event type to avoid memory leaks. |
| `hooks` | `undefined` | Optional logging and telemetry hooks. |
| `onErrorSink` | `undefined` | Optional unhandled handler failure callback hook for reporting to APM / Sentry. |

---

## 13. File Structure

The module layout strictly follows the Module Hub monorepo standard:

```
modules/event-bus/
├── MODULE.md
├── VERSION
├── package.json
├── tsconfig.json
├── index.ts
├── core/
│   ├── index.ts
│   ├── bus.ts
│   ├── types.ts
│   ├── error.ts
│   ├── registry.ts
│   ├── validation.ts
│   └── security.ts
├── tests/
│   └── unit/
│       ├── bus.test.ts
│       ├── subscribe.test.ts
│       ├── publish.test.ts
│       ├── unsubscribe.test.ts
│       ├── failure.test.ts
│       ├── validation.test.ts
│       └── security.test.ts
└── examples/
    └── integration.example.ts
```

---

## 14. Test Plan (for Stage 3 Tester)

The test suite must be implemented using `vitest` in `tests/unit/`. Downstream agents MUST verify every enumerated test case:

| Test File | Test Case Name | Assertion / Expected Outcome |
|---|---|---|
| `subscribe.test.ts` | `Subscribe handler` | Registering handler returns valid `UnsubscribeFn`, handler count increments. |
| `subscribe.test.ts` | `Duplicate subscriber handling` | Registering exact same handler twice does not create duplicate entries or double-execution. |
| `subscribe.test.ts` | `Invalid subscriber check` | Passing non-function or non-handler object throws `SUBSCRIBER_INVALID`. |
| `subscribe.test.ts` | `Max subscribers per type` | Registering beyond `maxSubscribersPerType` throws `SUBSCRIBER_INVALID`. |
| `publish.test.ts` | `Publish one event` | Event dispatched to registered subscriber, handler invoked with event data. |
| `publish.test.ts` | `Multiple subscribers` | All registered subscribers for `eventType` receive event in FIFO order. |
| `publish.test.ts` | `Event with no subscriber` | Publishing event with no listeners resolves `PublishResult { delivered: 0, failed: 0 }`. |
| `publish.test.ts` | `Async subscriber` | Async handler promise resolves completely before `publish()` resolves. |
| `publish.test.ts` | `Publish result shape` | Resolves object with exact `{ delivered, failed, failures }` structure. |
| `publish.test.ts` | `Deterministic order` | Handlers execute sequentially in exact subscription registration order. |
| `publish.test.ts` | `Correlation ID preservation` | `correlationId` passed in published event is preserved intact when received by handler. |
| `unsubscribe.test.ts` | `Unsubscribe via handle` | Calling returned `UnsubscribeFn()` removes handler; subsequent publish skips it. |
| `unsubscribe.test.ts` | `Unsubscribe via method` | `bus.unsubscribe(type, handler)` removes registered subscriber and returns `true`. |
| `unsubscribe.test.ts` | `Unsubscribe non-existent` | Unsubscribing unknown handler or subscriberId returns `false` without throwing. |
| `failure.test.ts` | `Handler failure isolation` | Handler 1 throwing exception does NOT stop Handler 2 from executing. |
| `failure.test.ts` | `Failure collection` | Failed handler exception is normalized into `EventBusError` (`HANDLER_FAILED`) inside `failures[]`. |
| `failure.test.ts` | `Error sink notification` | Injected `onErrorSink` hook receives normalized `EventBusError` and event context. |
| `validation.test.ts` | `Event validation` | Event missing `type`, `id`, `payload`, or `timestamp` throws `EVENT_INVALID`. |
| `validation.test.ts` | `Event type validation` | Invalid `eventType` (empty string, wildcards `*`) throws `EVENT_TYPE_INVALID`. |
| `security.test.ts` | `No payload logging` | Core logging hooks do not serialize or leak sensitive payload fields. |
| `security.test.ts` | `Prototype pollution safety` | Event processing filters out `__proto__`, `constructor`, and `prototype` property keys. |

---

## 15. `package.json` and `tsconfig.json` Reference Shapes

### `package.json`
```json
{
  "name": "@module-hub/event-bus",
  "version": "0.1.0",
  "type": "module",
  "main": "./index.ts",
  "exports": {
    ".": "./index.ts"
  },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.6.3",
    "vitest": "^2.1.4"
  }
}
```

### `tsconfig.json`
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "skipLibCheck": true,
    "noImplicitOverride": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  },
  "include": ["**/*.ts"]
}
```

---

## 16. Explicit Non-Goals

The following features are **explicitly out of scope** for v0.1.0 of the Event Bus module:

- **Distributed Messaging:** No RabbitMQ, Kafka, Cloudflare Queue, Redis PubSub, or SQS integrations.
- **Persistent Event Storage / Event Sourcing:** No disk storage, replay logs, or durable event store.
- **Queue Retries & Dead Letter Queue (DLQ):** Handled exclusively by the separate `Job/Retry` module.
- **Cron & Scheduled Dispatching:** No background timer or cron scheduler.
- **Cross-Service Transport:** Strictly in-process; no HTTP/gRPC event broadcasting across network nodes.
- **Webhook Delivery Engine:** No outbound HTTP webhook dispatching.
- **Transaction Manager:** Does not manage database transactions, 2PC, or Sagas.
- **Wildcard / Pattern Routing:** No `'*'`, `'payment.*'`, or regex routing.
- **Parallel / Concurrent Execution:** Parallel execution (`Promise.all`) is reserved for future explicit opt-in modes.

---

## 17. Acceptance Criteria (for Stage 4 Reviewer)

A Stage 4 Reviewer MUST verify all of the following criteria before approving the module design:

1. [ ] **File Location:** Deliverable exists at `D:\AI-Workspace\projects\modules-hub\modules\event-bus\DESIGN.md`.
2. [ ] **Scope Lock:** Strict in-process scope lock with zero claims of durable queues, distributed messaging, or exactly-once delivery.
3. [ ] **Runtime Independence:** Core code contains zero `node:*` imports and relies exclusively on Web APIs.
4. [ ] **Public API Contract:** `publish`, `subscribe`, `unsubscribe`, and `EventHandler` signatures match specified contracts.
5. [ ] **Core Types:** Exact definitions for `Event<T>`, `PublishResult`, `EventBusConfig`, `EventBusError`, and `EventBusErrorCode`.
6. [ ] **Generic Events:** Core contains no business domain logic; event types are generic namespaced strings.
7. [ ] **Deterministic Execution:** Sequential subscription-order execution is explicitly specified.
8. [ ] **Failure Isolation:** Handler failures are isolated, remaining handlers execute, and errors are collected in `PublishResult`.
9. [ ] **Security Standards:** Prototype pollution safety, zero env access, and no secret payload logging.
10. [ ] **Test Plan Completeness:** All 21 required test cases are enumerated in a clear table for Stage 3 tester verification.
