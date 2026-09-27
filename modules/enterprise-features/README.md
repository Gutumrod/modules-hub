# Enterprise Features

In-process resiliency and tracing primitives you can copy into any host project: a circuit
breaker with typed errors, and a minimal tracer contract with two built-in implementations
(`NoopTracer`, `MemoryTracer`). The module has no framework, no network client and no telemetry
SDK — you inject the async work and choose the tracer.

## install — Install

This module is copy-and-own: the source is the deliverable. There is no published npm package
for it and no registry install step, and it adds zero runtime dependencies to your application.

1. Copy the entire `enterprise-features/` module directory into your project — for example to
   `src/modules/enterprise-features/`. Copy the whole module directory (`index.ts`, `core/`,
   `examples/`, `tests/`, `package.json`, `package-lock.json`, `tsconfig.json`), not individual
   files.
2. Inside the copied module directory run `npm ci` to install the dev toolchain used by the
   tests and the example (`vitest`, `vite-node`, `typescript`) from the shipped lockfile.
3. Import the module from your own copy's entry point (`./modules/enterprise-features/index.js`)
   and adapt only that copy. Never import across projects from the Module Hub directory.

Requires Node.js 18+ with npm for the toolchain, plus a bundler or TS-capable runner for your
application (see runtime).

## quickstart — Quickstart

After the three install steps, this is the shortest path from a copied module to a first
successful call — wrap one async operation in a breaker and record one span:

```ts
// your-app/src/resiliency.ts   (module copied to your-app/src/modules/enterprise-features/)
import { CircuitBreaker, MemoryTracer } from './modules/enterprise-features/index.js';

const breaker = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 5_000 });
const tracer = new MemoryTracer();

// Your own upstream call — the module never performs network I/O for you.
async function callUpstreamCatalog(): Promise<string[]> {
  return ['sku-1', 'sku-2'];
}

export async function syncCatalog(tenantId: string): Promise<string[]> {
  const span = tracer.startSpan('sync-catalog');
  span.setAttribute('tenantId', tenantId);
  try {
    return await breaker.execute(() => callUpstreamCatalog());
  } finally {
    span.end();
  }
}
```

`execute()` passes your value straight through while the circuit is `CLOSED`, throws
`CircuitBreakerError` with code `CIRCUIT_OPEN` while it is `OPEN`, and admits a single probe
while it is `HALF_OPEN`.

The exact command to run the shipped example, from inside the module directory:

```bash
npm run example
```

## example — Example

The module ships one runnable example, `examples/run.ts`, started with a single command:

```bash
npm run example
```

Expected output — npm first prints its own `npm notice run …` lines; the program itself prints
these seven lines and exits 0:

```text
memoryTracer recordedSpans=2 attributeKeys=tenantId,attempt,stage endedSpanMutationThrew=true
noopTracer recordedSpans=0 spanContractCallable=true
breaker consecutiveFailures=3 stateAfterFailures=OPEN openFailures=3
blockedCall code=CIRCUIT_OPEN operationInvoked=false
halfOpen state=HALF_OPEN probeResult=recovered concurrentProbeCode=HALF_OPEN_PROBE_IN_PROGRESS stateAfterProbeSuccess=CLOSED
invalidConfig code=INVALID_CONFIG
entryPoint runtimeExports=4 names=CircuitBreaker,CircuitBreakerError,MemoryTracer,NoopTracer
EXAMPLE_RESULT: OK runtimeExports=4 names=CircuitBreaker,CircuitBreakerError,MemoryTracer,NoopTracer recordedSpans=2 attributeKeys=tenantId,attempt,stage breakerStates=CLOSED>OPEN>HALF_OPEN>CLOSED blockedCode=CIRCUIT_OPEN concurrentProbeCode=HALF_OPEN_PROBE_IN_PROGRESS invalidConfigCode=INVALID_CONFIG
```

What it prints: the `MemoryTracer` recorded 2 completed spans carrying the attribute keys
`tenantId,attempt,stage`, mutating an ended span threw, `NoopTracer` satisfied the same span
contract while recording 0 spans; three consecutive failures moved the breaker
`CLOSED → OPEN` with 3 recorded failures; a call while open threw code `CIRCUIT_OPEN` and never
invoked the operation; after the reset window the state was `HALF_OPEN`, a second concurrent
probe threw code `HALF_OPEN_PROBE_IN_PROGRESS`, the admitted probe returned `recovered` and the
circuit closed again; and an invalid configuration threw code `INVALID_CONFIG`. The example is
self-contained — no network, no file system writes, no secrets, no environment reads.

## limitations — Limitations

- Breaker state lives in memory, per instance. Each `new CircuitBreaker(...)` keeps its own
  state in local fields (`core/circuit-breaker.ts:20-24`), so two instances, two processes, two
  machines or two serverless instances do not share failure counts. A restart resets the
  circuit, and every worker can be open or closed independently of the others.
- There is no OpenTelemetry adapter and no distributed tracing. `Tracer`/`Span`
  (`core/types.ts:26-33`) are a minimal in-process contract; the module does not propagate
  context across services and has no exporter lifecycle. `NoopTracer` and `MemoryTracer` are the
  only implementations shipped.
- `MemoryTracer` keeps every completed span in an unbounded array in memory
  (`core/tracer.ts:15,33`) and is meant for tests and local diagnostics, not for production
  request traffic — there is no eviction, no sampling and no size cap.
- `monitorIntervalMs` is declared on `CircuitBreakerConfig` (`core/types.ts:6`) but the
  implementation never reads it: there is no background monitoring loop. State transitions are
  evaluated lazily, only when you call `execute()` or `getStatus()` — an open circuit does not
  flip to `HALF_OPEN` on a timer by itself.
- The entry point is TypeScript with `.js` relative specifiers. Tests and the example run it
  through vitest/vite-node; plain Node.js ESM cannot import `index.ts` directly (see runtime).

## api — API

Everything is exported from the module entry point `index.ts`; do not import sub-files directly.

- `CircuitBreaker` — the breaker itself; `new CircuitBreaker(config)`, then `execute(fn)` and
  `getStatus()`.
- `CircuitBreakerError` — the error class thrown by `execute()`, carrying `code` and `message`.
- `NoopTracer` — a `Tracer` that satisfies the span contract and stores nothing.
- `MemoryTracer` — a `Tracer` that keeps completed spans in memory; `startSpan()`,
  `getCompletedSpans()`, `clear()`.
- `CircuitState` (type) — `'CLOSED' | 'OPEN' | 'HALF_OPEN'`.
- `CircuitBreakerConfig` (type) — `{ failureThreshold, resetTimeoutMs, monitorIntervalMs? }`.
- `CircuitBreakerStatus` (type) — `{ state, failures, lastFailureTime?, nextAttemptTime? }`.
- `CircuitBreakerErrorCode` (type) — `'CIRCUIT_OPEN' | 'HALF_OPEN_PROBE_IN_PROGRESS' |
  'INVALID_CONFIG'`.
- `TracerConfig` (type) — `{ serviceName, environment?, version? }`.
- `SpanAttributeValue` (type) — `string | number | boolean`.
- `Span` (type) — `{ setAttribute(key, value), end() }`.
- `Tracer` (type) — `{ startSpan(name) }` — the extension point for your own adapter.
- `RecordedSpan` (type) — `{ name, startedAt, endedAt, durationMs, attributes }`, frozen by
  `MemoryTracer`.

## tests — Tests

Run the suite from the module directory with:

```bash
npm test
```

Observed in this release round: `npm test` reported `Test Files 3 passed (3)` and
`Tests 23 passed (23)` — 23 tests across three test files. That number is the pre-existing
module suite (16 tests: `circuit-breaker.test.ts` 12 tests, `tracer.test.ts` 4 tests) plus the
7 tests of the documentation contract in `tests/docs-contract.test.ts`. Type checking is a
separate gate:

```bash
npm run typecheck
```

## strengths — Strengths

- Typed errors instead of strings: `CircuitBreakerError` exposes a `code` field typed as
  `CircuitBreakerErrorCode`, so `CIRCUIT_OPEN`, `HALF_OPEN_PROBE_IN_PROGRESS` and
  `INVALID_CONFIG` are checked by the compiler — see `core/circuit-breaker.ts:3-8` and the
  assertions in `tests/unit/circuit-breaker.test.ts`.
- One probe at a time in `HALF_OPEN`: concurrent probes are rejected with
  `HALF_OPEN_PROBE_IN_PROGRESS`, and a successful probe closes the circuit — asserted by the
  "rejects concurrent half-open probes" test and by the shipped example's own output line.
- Config validation happens in the constructor, so a bad `failureThreshold` or `resetTimeoutMs`
  fails immediately with `INVALID_CONFIG` rather than at the first call —
  `core/circuit-breaker.ts:10-17`, covered by six parameterised invalid-config cases in
  `tests/unit/circuit-breaker.test.ts`.
- Fail-fast is real, not cosmetic: while open, `execute()` throws before calling your function,
  which the example observes as `operationInvoked=false` and the unit test asserts with a spy
  (`expect(blocked).not.toHaveBeenCalled()`).
- Zero runtime dependencies and zero `node:*` builtins in the source: `package.json` has no
  `dependencies`, and `index.ts` plus `core/` import only each other — measured at runtime, the
  entry point exposes exactly four values: `CircuitBreaker,CircuitBreakerError,MemoryTracer,NoopTracer`.

## runtime — Runtime

- Runtime dependencies: none. `package.json` declares only devDependencies (`typescript`,
  `vite-node`, `vitest`), which are needed to run the tests and the example, not to use the
  module.
- Node builtins used by the module: none. `index.ts` and `core/` contain no `node:*` import, no
  `process.env` read and no filesystem access; they use only classes, objects, `Date.now()` and
  `Promise`.
- Where it runs: anywhere that executes ES2022 TypeScript through a bundler or TS-capable runner
  configured for `moduleResolution: Bundler` — Node.js applications built with Vite/esbuild/tsc,
  and bundler-based edge or worker projects, because the core touches no Node-only API.
- Where it does not run: plain Node.js ESM cannot import the entry point directly, because
  `index.ts` is TypeScript and its relative specifiers point at `.ts` files through `.js` names.
  Running a file that imports it with `node --experimental-strip-types` fails with
  `ERR_MODULE_NOT_FOUND: Cannot find module …\index.js`; use `npm test`, `npm run example`
  (vitest/vite-node) or your own bundler instead.
- Type checking uses the shipped `tsconfig.json` (`tsc --noEmit`, `target ES2022`,
  `module ES2022`, `moduleResolution Bundler`, `strict`). Run `npm run typecheck` in the copied
  module directory before you deploy.
