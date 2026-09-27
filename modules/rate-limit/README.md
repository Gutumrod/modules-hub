# Rate Limit

Deterministic fixed-window rate limiting you can copy into any host project. You inject the
storage adapter and the configuration; the module only tracks counters for a key you compose
and tells you whether a request is allowed.

## install — Install

This module is copy-and-own: the source is the deliverable. There is no published npm package
for it and no registry install step — the module also ships zero runtime dependencies, so
nothing is added to your application's dependency tree.

1. Copy the entire `rate-limit/` module directory into your project — for example to
   `src/modules/rate-limit/`. Copy the whole directory (`index.ts`, `core/`, `adapters/`,
   `examples/`, `tests/`, `package.json`, `package-lock.json`, `tsconfig.json`), not individual
   files.
2. Inside the copied directory run `npm ci` to install the dev toolchain used by the tests and
   the example (vitest, typescript, vite-node) from the shipped `package-lock.json`.
3. Import the module from your own copy's entry point (`./modules/rate-limit/index.js`) and
   adapt only that copy. Never import across projects from the Module Hub directory.

Requires Node.js 18+ with npm for the toolchain, and a bundler or ts-based runner for your app
(see runtime).

## quickstart — Quickstart

After the three install steps, this is the whole path to a first successful call — a copied
module, an injected store, one check:

```ts
// your-app/src/limit.ts  (module copied to your-app/src/modules/rate-limit/)
import { createRateLimiter, createMemoryStore } from './modules/rate-limit/index.js';

const limiter = createRateLimiter({
  store: createMemoryStore(),
  defaultLimit: 5, // 5 requests
  defaultWindowMs: 60_000, // per 60 seconds (fixed window)
});

async function main() {
  // the key is composed by YOU (IP, user id, tenant id, API key, route ...)
  const result = await limiter.check({ key: 'ip:203.0.113.195' });
  console.log(result.allowed, result.remaining, result.resetAt);
}
```

`limit` and `windowMs` are taken from the config when the individual check omits them. Use
`checkOrThrow` instead of `check` when you want a thrown `RateLimitError` on exceedance.

The exact command to run the shipped example, from inside the module directory:

```bash
npm run example
```

## example — Example

The module ships one runnable example, `examples/run.ts`, started with a single command:

```bash
npm run example
```

It uses a fixed clock, so the output is deterministic. Expected output (npm prints its own
`npm notice run ...` line first; the program itself prints these five lines):

```text
fixed-window checks=4 limit=3 allowed=3 blocked=1
first resetAt=2000 last remaining=0
checkOrThrow threw code=RATE_LIMITED status=429
checkRateLimit allowed=true then allowed=false retryAfterMs=999
EXAMPLE_RESULT: OK allowed=3 blocked=1 lastRemaining=0 thrownCode=RATE_LIMITED thrownStatus=429 statelessRetryAfterMs=999
```

What it prints: with `limit=3` and `windowMs=1000`, four checks in the same window produced
`allowed=3`, `blocked=1`, `remaining=0`, the window reset timestamp `resetAt=2000`,
`checkOrThrow` threw code `RATE_LIMITED` with status `429`, and the stateless entry point
returned `allowed=false` with `retryAfterMs=999` instead of throwing.

## limitations — Limitations

- The shipped in-memory store is single-process only. `createMemoryStore()` keeps counters in
  one local `Map`, so it is fine for local development, unit tests and single-instance apps,
  but it is NOT suitable for distributed production: state is not shared across processes,
  clusters, serverless instances, edge isolates or PM2 workers. For production you implement
  the `RateLimitStore` interface against a shared store (for example Redis-compatible,
  Postgres or a cloud-native store) and inject it through `config.store`.
- Version 0.1 implements the fixed-window algorithm only. Sliding window, token bucket and
  leaky bucket policies are out of scope; the counter hard-resets at each window boundary.
- There is no active background cleanup. Buckets expire lazily on the next `consume` for that
  key, and expired buckets are swept only when the map grows beyond `maxKeys` (default
  10,000) — so the store can hold up to about `maxKeys` entries in memory.
- The module deliberately does not resolve identities and does not read configuration from the
  environment. It never parses headers, IPs, JWTs or routes, and never calls `process.env`;
  the host must compose the `key` and inject all settings.
- The entry point is TypeScript with `.js` relative specifiers. Tests and the example run it
  through vitest/vite-node; the module is not runnable by plain Node ESM without a bundler or
  transpile step (see runtime).

## api — API

Everything is exported from the module entry point `index.ts`; do not import sub-files directly.

- `createRateLimiter(config?)` — returns a `RateLimiter` bound to your config (a default memory
  store is created when no store is injected).
- `checkRateLimit(input, store?, config?)` — stateless one-shot check; never throws on
  limit exceedance, returns `allowed: false` instead.
- `createMemoryStore(options?)` — returns the v0.1 single-process in-memory `RateLimitStore`.
- `RateLimitError` — error class thrown by `checkOrThrow` when a check is blocked, with code
  `RATE_LIMITED` and status `429`.
- `RateLimitConfigError` — error class for invalid input, with code `RATE_LIMIT_INVALID_CONFIG`
  and `retryable: false`.
- `RateLimiter` (type) — `{ check(input), checkOrThrow(input) }`; `checkOrThrow` throws when the
  request is blocked and `throwOnLimitExceeded` is `true` (the default).
- `CheckRateLimitInput` (type) — `{ key, limit, windowMs, cost?, now? }`; `key` is required,
  `limit`/`windowMs` fall back to config defaults, `cost` defaults to `1`, `now` defaults to
  `Date.now()`.
- `RateLimitResult` (type) — `{ allowed, remaining, resetAt, retryAfterMs }`.
- `RateLimitConfig` (type) — `{ store?, defaultLimit?, defaultWindowMs?, throwOnLimitExceeded? }`.
- `RateLimitStore` (type) — the storage adapter contract: `consume(params)` plus optional
  `reset(key?)`.
- `StoreConsumeParams` (type) — `{ key, cost, limit, windowMs, now }` passed to the store.
- `StoreConsumeResult` (type) — `{ currentCount, windowStart, resetAt, allowed }` returned by
  the store.
- `MemoryStoreOptions` (type) — `{ maxKeys? }` for `createMemoryStore`, default `10000`.
- `ErrorShape` (type) — the shared error shape `{ code, message, details?, requestId?, retryable }`
  that `RateLimitError` conforms to.

## tests — Tests

Run the suite from the module directory with:

```bash
npm test
```

Observed in this release round: `npm test` reported `Test Files 9 passed (9)` and
`Tests 43 passed (43)` — 43 tests in nine test files. That number is the pre-existing module
suite (36 tests) plus the 7 tests of the documentation contract in
`tests/docs-contract.test.ts`. Type checking is a separate gate:

```bash
npm run typecheck
```

## strengths — Strengths

- Real structured errors, not strings: `RateLimitError` carries `code: 'RATE_LIMITED'`,
  `status: 429`, `retryable: true`, `key`, `limit`, `windowMs`, `resetAt`, `retryAfterMs` and a
  `details` object, and conforms to the shared `ErrorShape` — see `core/error.ts` and the
  assertions in `tests/unit/error.test.ts`.
- Deterministic and testable by construction: every check accepts an optional `now` clock
  override, so window math is verifiable without waiting — the shipped example runs on a fixed
  clock, and `tests/integration/rate-limit.test.ts` asserts exact `resetAt` and `retryAfterMs`
  values at fixed timestamps.
- One tiny adapter contract: a storage backend only needs `consume(params)` (plus optional
  `reset`), which is what makes the memory store, and any future Redis/Postgres store,
  drop-in — see `core/types.ts` and `adapters/memory-store.ts`.
- The memory adapter is tested where it is easy to get wrong: `tests/memory-store.test.ts` and
  `tests/unit/memory-store.test.ts` cover `Promise.all` concurrency on one key (exactly 3 of 5
  concurrent consumes allowed with `limit=3`) and the `maxKeys` passive-eviction path.
- Zero runtime dependencies and zero `node:*` builtins in the source (`package.json` has no
  `dependencies`; `core/`, `adapters/` and `index.ts` import only each other), so the module
  does not constrain your runtime.

## runtime — Runtime

- Runtime dependencies: none. `package.json` declares only devDependencies (`vitest`,
  `@vitest/coverage-v8`, `typescript`, `vite-node`), which are needed to run the tests and the
  example, not to use the module.
- Node builtins used by the module: none. The source (`index.ts`, `core/`, `adapters/`) contains
  no `node:*` import, no `process.env` read and no filesystem access; it uses only `Map`,
  `Math`, `Date.now()`, `Promise` and plain objects.
- Where it runs: anywhere that executes ES2022 TypeScript through a bundler or ts-capable
  runner with `moduleResolution: Bundler` — Node.js applications built with Vite/esbuild/tsc,
  and bundler-based edge/worker projects (the core is environment-agnostic and does not require
  a Node-only API).
- Where it does not run: plain Node.js ESM cannot import the entry point directly, because
  `index.ts` uses TypeScript plus `.js` specifiers for `.ts` files. Running the example file with
  `node --experimental-strip-types` fails with `ERR_MODULE_NOT_FOUND: Cannot find module
  .../index.js`; use `npm test`, `npm run example` (vitest/vite-node) or your own bundler
  instead.
- Type checking is done with the shipped `tsconfig.json` (`tsc --noEmit`, `target ES2022`,
  `module ES2022`, `moduleResolution Bundler`, strict). Run `npm run typecheck` in the copied
  module directory before you deploy.
