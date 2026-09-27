# event-bus — In-Process Publish/Subscribe for TypeScript

A small, dependency-free event bus you copy into your own project and own outright. Handlers are
registered per event type; publishing validates and prepares the event, calls every registered
handler one after another, and returns a result object that says how many handlers succeeded and
which ones failed. It is an in-process dispatcher only — no broker, no network, no persistence.

Version 0.1.0. Public entry point: `index.ts`.

The entry point is TypeScript source. Use it from a TypeScript-aware bundler or runner; plain Node
ESM cannot import this source entry point directly. To run the included example, install the
module's development tools and use `npm run example` from this module directory.

## install — Install (copy-and-own, 3 steps)

1. Copy the entire `event-bus` module directory into your project, for example to
   `src/modules/event-bus/`. Copy the directory whole: source, `package.json`, `tsconfig.json`,
   tests and examples belong together. There is no published package for this module, so there is
   nothing to install from a registry — the copy *is* the dependency.
2. Optional, and only if you want to run the module's own tests and example in place: install its
   development tooling inside the copied directory with `npm ci`. Your application does not need
   any of it.
3. Import the module through its entry point of the copied directory, and never through another
   repository's path:

   ```ts
   import { createEventBus } from './modules/event-bus/index.js';
   ```

Keep the copy under your own version control. It is yours to edit, extend and rename.

## quickstart — Quickstart (first successful call)

From a copied module directory to a working publish, in one file:

```ts
// Path points at your copy, not at a shared repository.
import { createEventBus } from './modules/event-bus/index.js';

const bus = createEventBus();

// Register a handler for one exact event type, in the object-handler form.
bus.subscribe('order.created', {
  subscriberId: 'audit',
  handle: (event) => {
    console.log(`received ${event.type} ${event.id}`);
  },
});

// id and timestamp are required fields; the bus can auto-fill them when omitted.
const result = await bus.publish({
  id: 'evt_1',
  type: 'order.created',
  payload: { orderId: 'ord_1', totalCents: 4999 },
  timestamp: new Date().toISOString(),
});

console.log(result.delivered, result.failed); // 1 0
```

Run the bundled, self-contained example with this exact command, from the module directory:

    npm run example

## example — Runnable Example

One command, no arguments, no network and no configuration:

    npm run example

It runs `examples/run.ts` through `vite-node` and prints the following. The final line starts with
`EXAMPLE_RESULT: OK` and reports only numbers the example actually measured:

    published event types: order.created, order.updated, order.cancelled
    handlers registered: 4 (3 for order.created, 1 for order.updated)
    order.created  -> delivered=2 failed=1 failureCode=HANDLER_FAILED
    order.updated  -> delivered=1 failed=0 failures=absent
    order.cancelled-> delivered=0 failed=0 failures=absent
    duplicate subscribe returned same UnsubscribeFn: true
    unsubscribe via handle: true, second call: false
    unsubscribe via subscriberId: true, second call: false
    handler invocations recorded: publish:order.created, audit:order.created:ord_1001, notify:ord_1001, publish:order.updated, audit:order.updated:ord_1002, publish:order.cancelled
    EXAMPLE_RESULT: OK published=3 delivered=3 failed=1 handlerFailureCode=HANDLER_FAILED newSubscriptions=4 removals=2 publishHooks=3 unsubscribeHooks=1 onErrorCalls=1 onErrorSinkCalls=1 invalidInputCodes=EVENT_INVALID+EVENT_TYPE_INVALID

The example shows the four behaviours worth knowing before you wire the bus up: three subscribers
on one type run in registration order, a throwing subscriber is isolated and reported as
`HANDLER_FAILED` while the others still run, re-subscribing the same handler is a no-op, and
invalid input throws a typed `EventBusError`.

## limitations — Limitations (read this first)

- In-process only, at-most-once, not durable. Delivery happens inside the current process. There
  is no disk, database or queue backing, no retry, and no recovery after a crash or restart: an
  event that was in flight is gone. Do not use this module where delivery must survive a restart.
- Exact event type matching only. `'order.created'` matches `'order.created'` and nothing else.
  There is no `'*'` wildcard, no `'payment.*'` prefix matching and no regex routing in this version.
- Handlers run sequentially, one awaited at a time. There is no parallel `Promise.all` fan-out, so
  a slow handler delays the handlers registered after it on the same event type.
- A handler failure is reported, never retried. `publish()` resolves with the failure recorded in
  `result.failures` (code `HANDLER_FAILED`); it never throws because a handler threw, and it never
  re-attempts that handler. Your own code has to decide what to do about a failure.
- At most 100 subscribers per event type by default (`maxSubscribersPerType`). Registering beyond
  the limit throws `SUBSCRIBER_INVALID`.
- Not an audit log. The bus keeps no history, guarantees no ordering across different event types,
  and gives you no immutable record of what was published.
- No environment access. The module never reads `process.env` or any global config, so nothing is
  configured unless you pass it in through `createEventBus(config)`.

## api — Public API

Every export below comes from the module entry point `index.ts`. Do not import from sub-files.

Runtime exports:

- `createEventBus(config?: EventBusConfig): EventBus` — factory returning a bus bound to the given
  config; with no config it uses `crypto.randomUUID` for ids, `new Date().toISOString()` for
  timestamps and a 100-subscriber cap per event type.
- `EventBusError` — error class for every error the module throws or collects, carrying `code`,
  and optionally `eventId`, `eventType`, `subscriberId` and `cause`.

Type exports:

- `Event<T>` — the event contract: required `id`, `type`, `payload`, `timestamp`, plus optional
  `source`, `subject`, `correlationId` and `metadata`.
- `EventBus` — the bus interface: `publish(event)`, `subscribe(eventType, handler)` and
  `unsubscribe(eventType, subscriberIdOrHandler)`.
- `EventBusConfig` — `idGenerator`, `timestampProvider`, `maxSubscribersPerType`, `hooks` and
  `onErrorSink`.
- `EventBusErrorCode` — union of `'EVENT_INVALID'`, `'EVENT_TYPE_INVALID'`, `'SUBSCRIBER_INVALID'`,
  `'HANDLER_FAILED'`, `'PUBLISH_FAILED'`.
- `EventBusHooks` — optional `onPublish`, `onSubscribe`, `onUnsubscribe` and `onError` telemetry
  callbacks; a throwing hook is swallowed and never changes the publish outcome.
- `EventHandler<T>` — object handler form: `handle(event)` plus an optional `subscriberId` used
  for stable registry identity.
- `EventHandlerFn<T>` — function handler form, `(event) => Promise<void> | void`.
- `PublishResult` — `{ delivered, failed, failures? }`; `failures` is present only when
  `failed > 0`.
- `PublishFailure` — one entry of `failures`: optional `subscriberId` plus the `EventBusError`.
- `UnsubscribeFn` — `() => boolean`, returned by `subscribe()`; `true` when it removed a handler,
  `false` when the handler was already gone.

## tests — Tests

Run the suite from the module directory:

    npm test

Observed in this packaging round (2026-09-27), `npm test` exited 0 and reported:

- 9 test files, 100 tests, 0 failed — 91 pre-existing unit and smoke tests in 8 files, plus 9
  documentation-contract tests in `tests/docs-contract.test.ts`.
- `npm test` maps to `vitest run`.
- `tests/docs-contract.test.ts` reads `README.md`, `README.th.md`, `MODULE.md`, `package.json` and
  `examples/run.ts` from disk, so deleting a required README section, breaking the install rule or
  dropping the example marker fails the suite.
- `npm run typecheck` maps to `tsc --noEmit` and exits 0 for the whole module, examples included.

## strengths — Strengths

- Zero runtime dependencies. `package.json` declares no `dependencies` at all, and the module
  imports no `node:*` builtin, so nothing is pulled into your bundle beyond the module source
  itself. Only development tooling (`typescript`, `vitest`, `@vitest/coverage-v8`, `vite-node`) is
  declared, and only for running tests and the example.
- Failures are isolated and reported structurally, not thrown. `core/bus.ts` wraps each handler
  call in its own `try`/`catch` and collects an `EventBusError` with code `HANDLER_FAILED` per
  failure, which is covered by `tests/unit/failure.test.ts` and `tests/smoke.test.ts`.
- A typed, closed error model. All five codes (`EVENT_INVALID`, `EVENT_TYPE_INVALID`,
  `SUBSCRIBER_INVALID`, `HANDLER_FAILED`, `PUBLISH_FAILED`) live in one union in `core/error.ts`,
  so you can switch on `error.code` instead of parsing messages.
- Hardened against prototype pollution. `core/security.ts` rejects `__proto__`, `constructor` and
  `prototype` keys when copying the event and its metadata, and builds containers with
  `Object.create(null)`; asserted in `tests/unit/security.test.ts`.
- Deterministic dispatch you can reason about. Handlers for one event type run in the exact order
  they were registered, one after another, and duplicates are ignored — asserted in
  `tests/unit/publish.test.ts` and `tests/smoke.test.ts`.
- Full source, not a black box. You copy the whole module, including its tests and a commented
  Cloudflare Worker integration example, and can read or change every line.

## runtime — Runtime Requirements

- Runtime dependencies: none. `package.json` has no `dependencies` field, so the shipped source
  needs no third-party runtime package.
- Node builtins used: none. The module imports no `node:*` module; `grep -r "node:" --include=*.ts .`
  over the module returns no match.
- Platform APIs used: Web standards only — `crypto.randomUUID` for ids, `Date` for timestamps,
  `Object`/`Map`/`Promise` for the registry and dispatch.
- Where it runs: TypeScript-aware bundlers/runners targeting runtimes with those Web APIs —
  Cloudflare Workers, modern browsers, Deno, Bun, and Node.js 18 or newer. The source uses ESM
  syntax and type-checks under `moduleResolution: Bundler`, but plain Node ESM cannot import the
  `.ts` entry point directly; use your application's bundler/TypeScript runner or the included
  `npm run example` command.
- Where it needs help: a runtime without `crypto.randomUUID` (or one where you must not touch the
  global crypto) needs an injected `idGenerator` and `timestampProvider` in `EventBusConfig`.
- Where it does not apply: anything cross-process. There is no network transport, no queue, no
  persisted event log and no scheduling, so it cannot deliver between services or across restarts.
