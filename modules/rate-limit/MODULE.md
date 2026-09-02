# Rate Limit Module

**Version:** 0.1.0 (P1)
**Status:** Reusable embedded module — core + memory adapter implemented, 36/36 tests passing, typecheck clean, docs complete.

## Architecture

This module is a **reusable embedded module** — not a standalone service or framework.
A Host project that needs deterministic, key-based rate limiting embeds this module into
its own codebase and wires it up by injecting a storage adapter and configuration.

The module has one job: accept a host-composed `key` plus a `limit` and `windowMs` →
validate the input → consume capacity through the injected `RateLimitStore` → compute
`remaining`, `resetAt`, and `retryAfterMs` → return a normalized `RateLimitResult` or
throw a structured `RateLimitError`.

```
Host / Application Layer
       ↓ (passes key, limit, windowMs)
Rate Limit Core   (checkRateLimit / RateLimiter, validation, fixed-window math)
       ↓ (invokes consume(params))
RateLimitStore interface   (Adapter Contract)
       ↓
MemoryRateLimitStore adapter   (v0.1 in-memory adapter)
```

### Architectural boundary

> **CRITICAL BOUNDARY:** The Rate Limit module is strictly responsible for **tracking
> attempt counters and evaluating rate limits** for a given host-supplied key within a
> time window. It MUST NOT resolve business identities (parsing HTTP headers, identifying
> client IPs, extracting JWT user IDs, or inspecting router paths), MUST NOT run active
> background cleanup loops or cron jobs (`setInterval`), and MUST NOT read process
> environment variables directly. Business identity resolution, distributed storage
> adapters, and environment setup belong exclusively to the Host application or external
> infrastructure adapters.

The module **never** reads env (`process.env` / `env` / `globalThis`). The Host reads its
own env and injects the store + config via `createRateLimiter(config)`.

### Host vs. module responsibilities

| Host must do | Module does |
|---|---|
| Resolve business identity keys (IP, User ID, Tenant ID, API Key, Route Path) | Accepts a pre-composed string `key` — never infers identity |
| Read env / secrets and inject them via `RateLimitConfig` | Never touches env — receives all configuration via `RateLimitConfig` |
| Inject the storage adapter (`createMemoryStore()` in v0.1) | Interacts with the store strictly through the `RateLimitStore` interface |
| Determine rate limit rules per route / user tier | Evaluates fixed-window rate limit state deterministically |
| Map the result to HTTP headers (`X-RateLimit-Limit`, `Retry-After`) | Computes and returns `{ allowed, remaining, resetAt, retryAfterMs }` |
| Handle request blocking in HTTP middleware | Throws or returns a structured `RateLimitError` (`code: 'RATE_LIMITED'`) |

## Public API

All exports come from the module entry point `index.ts`. Do not import from sub-files
directly.

```ts
import {
  checkRateLimit,
  createRateLimiter,
  createMemoryStore,
  RateLimitError,
  RateLimitConfigError,
} from './index.js';
import type {
  CheckRateLimitInput,
  MemoryStoreOptions,
  RateLimitConfig,
  RateLimitResult,
  RateLimitStore,
  RateLimiter,
  StoreConsumeParams,
  StoreConsumeResult,
  ErrorShape,
} from './index.js';
```

### `createRateLimiter(config?: RateLimitConfig): RateLimiter`

Returns a `RateLimiter` bound to the given config. Config is optional; if omitted, a
default in-memory store is created and `throwOnLimitExceeded` defaults to `true`.

### `checkRateLimit(input, store?, config?): Promise<RateLimitResult>`

A standalone, stateless entry point. It resolves and validates the input, consumes
capacity through the given store (or the store from `config`, or a fresh default memory
store), and returns a normalized `RateLimitResult`. It **never throws** on limit
exceedance — it returns `allowed: false` with a positive `retryAfterMs`. Use
`checkOrThrow` when you want a thrown `RateLimitError` instead.

### `createMemoryStore(options?: MemoryStoreOptions): RateLimitStore`

Returns the v0.1 in-memory `RateLimitStore` adapter. See the Memory adapter section for
its behavior and its **single-process limitation**.

### `RateLimiter` methods

```ts
interface RateLimiter {
  check(input: CheckRateLimitInput): Promise<RateLimitResult>;
  checkOrThrow(input: CheckRateLimitInput): Promise<RateLimitResult>;
}
```

- `check` — evaluates the limit and returns a `RateLimitResult`. Never throws on limit
  exceedance; returns `allowed: false` with a positive `retryAfterMs`.
- `checkOrThrow` — evaluates the limit and, when the request is blocked and
  `throwOnLimitExceeded` is `true` (the default), throws a `RateLimitError`
  (`code: 'RATE_LIMITED'`). When `throwOnLimitExceeded` is `false`, it behaves like
  `check` and returns the result instead of throwing.

## Config contract

### `RateLimitConfig`

```ts
type RateLimitConfig = {
  store?: RateLimitStore;
  defaultLimit?: number;
  defaultWindowMs?: number;
  throwOnLimitExceeded?: boolean;
};
```

| Field | Default | Description |
|---|---|---|
| `store` | `createMemoryStore()` | Storage adapter implementation. Inject `createMemoryStore()` from the Host in production. |
| `defaultLimit` | `undefined` | Default rate limit ceiling used when `limit` is omitted in an individual check. |
| `defaultWindowMs` | `undefined` | Default window duration in ms used when `windowMs` is omitted in an individual check. |
| `throwOnLimitExceeded` | `true` | Whether `checkOrThrow` throws `RateLimitError` on limit exceed. Set `false` to return the result instead. |

### `CheckRateLimitInput`

```ts
type CheckRateLimitInput = {
  key: string;
  limit: number;
  windowMs: number;
  cost?: number;
  now?: number;
};
```

| Field | Default | Description |
|---|---|---|
| `key` | — (required) | Host-created rate limit key, e.g. `"ip:192.168.1.1"`, `"user:usr_123:api_v1"`. Must be a non-empty string. |
| `limit` | `config.defaultLimit` | Maximum allowed requests/tokens within the window. Must be a positive integer > 0. |
| `windowMs` | `config.defaultWindowMs` | Window duration in milliseconds. Must be a positive number > 0. |
| `cost` | `1` | Cost/tokens consumed per check. Must be an integer >= 1. |
| `now` | `Date.now()` | Optional clock override timestamp in ms for testing / deterministic timing. Must be a finite number > 0. |

### `RateLimitResult`

```ts
type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfterMs: number;
};
```

| Field | Description |
|---|---|
| `allowed` | Whether the request is permitted under the limit. |
| `remaining` | Remaining capacity in the current window (`>= 0`). |
| `resetAt` | Unix timestamp in milliseconds when the current window resets. |
| `retryAfterMs` | Time in ms until the host can retry if blocked (`0` if allowed). |

## RateLimitStore interface

The `RateLimitStore` interface is the abstraction boundary between the Rate Limit Core and
storage engines. Any storage backend (memory, Redis-compatible, Postgres, Cloudflare-native)
implements this contract.

```ts
interface RateLimitStore {
  consume(params: StoreConsumeParams): Promise<StoreConsumeResult>;
  reset?(key?: string): Promise<void>;
}
```

### `consume` contract rules

1. **Parameters:** Receives a single immutable `StoreConsumeParams` object containing
   `key`, `cost`, `limit`, `windowMs`, and `now`.
2. **Atomicity requirement:** The `consume` operation MUST execute atomically per key.
   Incrementing the counter, calculating window reset, and checking limit boundaries must
   happen as a single atomic operation without race conditions between concurrent
   invocations.
3. **Counter behavior:**
   - If `currentCount + cost <= limit`, the counter is incremented by `cost` and
     `allowed: true` is returned.
   - If `currentCount + cost > limit`, the counter MUST NOT be incremented beyond `limit`
     and `allowed: false` is returned.
4. **Window boundary:** The store calculates window start as
   `Math.floor(now / windowMs) * windowMs` and reset timestamp as `windowStart + windowMs`.

### `StoreConsumeParams`

```ts
type StoreConsumeParams = {
  key: string;
  cost: number;
  limit: number;
  windowMs: number;
  now: number;
};
```

### `StoreConsumeResult`

```ts
type StoreConsumeResult = {
  currentCount: number;
  windowStart: number;
  resetAt: number;
  allowed: boolean;
};
```

### `reset`

`reset(key?)` is optional. When called with a key it clears that key's bucket; when called
with no argument it clears all buckets. Not all adapters are required to implement it.

## Memory adapter

`createMemoryStore(options?: MemoryStoreOptions): RateLimitStore` returns the v0.1
in-memory adapter, `MemoryRateLimitStore`. It keeps counters in a single local
`Map<string, WindowBucket>`.

```ts
type MemoryStoreOptions = {
  maxKeys?: number; // Default: 10000
};
```

### Behavior

- **Fixed-window buckets.** Each key maps to a `WindowBucket` of
  `{ windowStart, count, expiresAt }`.
- **Lazy expiry.** On each `consume`, if no bucket exists, or `now >= bucket.expiresAt`, or
  `bucket.windowStart !== currentWindowStart`, a fresh bucket is initialized for the current
  window. Stale buckets are overwritten lazily on first access after expiry — there is no
  active background cleanup.
- **Passive eviction.** When the `Map` size exceeds `maxKeys` (default 10,000), the adapter
  performs a fast linear sweep to remove expired buckets. No `setInterval` is used.
- **Atomic per key.** Within a single process, `consume` is synchronous in its counter
  update, so concurrent `Promise.all` calls on the same key update the counter without race
  conditions.

### Known limitation — NOT for distributed production

> **WARNING:** `MemoryRateLimitStore` is strictly designed for local development, unit
> testing, and single-instance applications. It stores state entirely in process memory
> (`Map`). It DOES NOT sync state across multi-process clusters, PM2 instances, serverless
> functions, or edge workers. **It is NOT suitable for distributed production
> environments.** For production, implement a `RateLimitStore` backed by a shared store
> (e.g. Redis-compatible service, Postgres, or a Cloudflare-native store) and inject it via
> `RateLimitConfig.store`.

## Fixed window policy

Version 0.1 implements a precise **Fixed Window Algorithm**. For any request at Unix
timestamp `now` (milliseconds):

```
windowStart = Math.floor(now / windowMs) * windowMs
resetAt     = windowStart + windowMs
remaining   = max(0, limit - currentCount)
retryAfterMs = 0                          if allowed = true
             = max(0, resetAt - now)      if allowed = false
```

```
Time Window Timeline (windowMs = 60,000ms / 1 min):
[00:00.000 ---------------- Window 1 ---------------- 00:59.999] [01:00.000 ---------------- Window 2 ---------------- 01:59.999]
     ↑                                                      ↑          ↑
 windowStart                                             resetAt   New windowStart
```

The counter resets at each window boundary. Sliding window and token bucket policies are
out of scope for v0.1.

## Error model

### `RateLimitError` — `RATE_LIMITED`

When a check is blocked via `checkOrThrow()` (or `throwOnLimitExceeded: true` is
configured), the module throws a structured `RateLimitError`:

```ts
class RateLimitError extends Error {
  readonly code: 'RATE_LIMITED';
  readonly status: 429;
  readonly retryable: true;
  readonly key: string;
  readonly limit: number;
  readonly windowMs: number;
  readonly resetAt: number;
  readonly retryAfterMs: number;
  readonly details: Record<string, unknown>;
}
```

- **`code`:** `'RATE_LIMITED'` — the standard Module Hub error code.
- **`message`:** `Rate limit exceeded for key "<key>". Retry after <retryAfterMs>ms.`
- **`retryable`:** `true` — requests blocked by rate limit ARE retryable once
  `retryAfterMs` has elapsed.
- **`details`:** `{ key, limit, windowMs, remaining: 0, resetAt, retryAfterMs }`.
- **`status`:** `429` — the HTTP status the Host should return.

`RateLimitError` conforms to the Module Hub standard `ErrorShape`
(`{ code, message, details?, requestId?, retryable }`), so it integrates with the Error
Module.

### `RateLimitConfigError` — `RATE_LIMIT_INVALID_CONFIG`

Invalid inputs (empty `key`, `limit <= 0`, `windowMs <= 0`, `cost < 1`, invalid `now`)
throw a `RateLimitConfigError`:

```ts
class RateLimitConfigError extends Error {
  readonly code: 'RATE_LIMIT_INVALID_CONFIG';
  readonly retryable: false;
}
```

Validation is fail-fast and happens before any store call.

## How to integrate

### Steps

1. Copy the module folder into your repo.
2. In your Cloudflare Worker, declare an `Env` interface with any required secrets or
   configuration.
3. Create the memory store (v0.1) — or inject a production `RateLimitStore`:
   ```ts
   const store = createMemoryStore();
   ```
4. Build a `RateLimitConfig` with your store, default limit, and default window — all
   values read from your own `env`, never from the module.
5. Call `createRateLimiter(config)` to obtain a `RateLimiter`.
6. In your request handler, compose a business identity `key` (e.g. `ip:${clientIp}`,
   `user:${userId}`, `tenant:${tenantId}`, `apikey:${apiKey}`) and call
   `limiter.checkOrThrow({ key, limit, windowMs })`. Catch `RateLimitError` and map
   `error.status` / `error.retryAfterMs` to the appropriate host-side response.

### Quick reference

```ts
import { createRateLimiter, createMemoryStore, RateLimitError } from './index.js';

const limiter = createRateLimiter({
  store: createMemoryStore(),
  defaultLimit: 5,
  defaultWindowMs: 60_000, // 1 minute window
});

async function handleIncomingRequest(clientIp: string) {
  const key = `ip:${clientIp}:api_v1`;
  try {
    const result = await limiter.checkOrThrow({ key, limit: 5, windowMs: 60_000 });
    console.log(`[ALLOWED] remaining=${result.remaining} resetAt=${result.resetAt}`);
    return { status: 200, body: 'Success' };
  } catch (err) {
    if (err instanceof RateLimitError) {
      return {
        status: err.status, // 429
        headers: {
          'Retry-After': Math.ceil(err.retryAfterMs / 1000).toString(),
          'X-RateLimit-Reset': err.resetAt.toString(),
        },
        body: { code: err.code, message: err.message, retryAfterMs: err.retryAfterMs },
      };
    }
    throw err;
  }
}
```

See `examples/integration.example.ts` for the full runnable example.

### Integration checklist

- [ ] Copy the module folder into the target repo
- [ ] Compose a business identity `key` in the Host (IP, user id, tenant id, API key, phone, endpoint) — the module never infers identity
- [ ] Inject `createMemoryStore()` for v0.1 — do not rely on the default store in production
- [ ] For distributed production, implement and inject a shared `RateLimitStore` (Redis-compatible, Postgres, or Cloudflare-native) — the memory adapter is single-process only
- [ ] Set `defaultLimit` and `defaultWindowMs` to values appropriate for your SLA
- [ ] Catch `RateLimitError` in every handler; map `error.status` (429) and `error.retryAfterMs` to the host-side response
- [ ] Set `throwOnLimitExceeded: false` if you prefer to inspect `RateLimitResult.allowed` instead of catching
- [ ] Run `npm run typecheck` before deploy

## Versioning

Standard semver — bump the version in `VERSION` on every change. No CHANGELOG or migration
guide until the module has been embedded in ≥ 2 real projects and the contract has
stabilized.

## Promote to shared package when

The module has been embedded in ≥ 2–3 projects without changes to the `core/` contract
(only config or store changes on the Host side) — then extract to an npm package.
