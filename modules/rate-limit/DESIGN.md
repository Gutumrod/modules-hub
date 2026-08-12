# Rate Limit Module — DESIGN.md

**Version:** 0.1.0 (P0, experimental)  
**Status:** Design (Stage 1 — Architect). This file is the single source of truth for downstream agents (Stage 2 implementer, Stage 3 tester, Stage 4 reviewer).  
**Language / runtime:** TypeScript, ES2022, strict mode, `moduleResolution: Bundler`. Compatible with Cloudflare Workers / Edge and Node environments (no `node:*` imports; Web/ES standard APIs only).

---

## 1. Purpose

A reusable, adapter-based **Rate Limit module** for the Module Hub monorepo. It provides deterministic, key-based rate limit checking, window calculation, remaining quota calculation, retry timing, and standardized error integration.

The architecture follows a strict layered design:

```
Host / Application Layer
       ↓ (passes key, limit, windowMs)
Rate Limit Core (checkRateLimit / RateLimiter)
       ↓ (invokes consume(params))
RateLimitStore Interface (Adapter Contract)
       ↓
MemoryRateLimitStore Adapter (v0.1 In-Memory Adapter)
```

### Architectural Boundary

> **CRITICAL BOUNDARY:** The Rate Limit module is strictly responsible for **tracking attempt counters and evaluating rate limits** for a given host-supplied key within a time window. It MUST NOT attempt to resolve business identities (e.g. parsing HTTP headers, identifying client IP addresses, extracting JWT user IDs, or inspecting router paths), MUST NOT run active background cleanup loops or cron jobs (`setInterval`), and MUST NOT read process environment variables directly. Business identity resolution, distributed storage adapters, and environment setup belong exclusively to the Host application or external infrastructure adapters.

### Host responsibilities vs module responsibilities

| Host does | Module does |
|---|---|
| Resolves business identity keys (IP, User ID, Tenant ID, API Key, Route Path) | Accepts pre-composed string `key` — never infers identity |
| Reads `process.env` / env configuration | Accepts `RateLimitConfig` injected by Host — zero direct env access |
| Injects storage adapter implementation (`MemoryRateLimitStore` in v0.1) | Interacts with store strictly through `RateLimitStore` interface |
| Determines rate limit rules per route / user tier | Evaluates fixed-window rate limit state deterministically |
| Maps result to HTTP headers (`X-RateLimit-Limit`, `Retry-After`) | Computes and returns `{ allowed, remaining, resetAt, retryAfterMs }` |
| Handles request abortion / blocking in HTTP middleware | Throws or returns structured `RateLimitError` (`code: 'RATE_LIMITED'`) |

---

## 2. Public API (exact signatures)

All public types and functions are exported from the module's entry points (`index.ts`, `core/index.ts`, and `adapters/index.ts`).

```ts
// core/limiter.ts
export function createRateLimiter(config?: RateLimitConfig): RateLimiter;

export function checkRateLimit(
  input: CheckRateLimitInput,
  store?: RateLimitStore,
  config?: RateLimitConfig
): Promise<RateLimitResult>;

// RateLimiter Interface
export interface RateLimiter {
  check(input: CheckRateLimitInput): Promise<RateLimitResult>;
  checkOrThrow(input: CheckRateLimitInput): Promise<RateLimitResult>;
}

// adapters/memory-store.ts
export function createMemoryStore(options?: MemoryStoreOptions): RateLimitStore;
```

---

## 3. Exact Core Types

```ts
/** Input parameters for checking rate limit on a single key */
export type CheckRateLimitInput = {
  /** Host-created rate limit key (e.g. "ip:192.168.1.1", "user:usr_123:api_v1") */
  key: string;
  /** Maximum allowed requests/tokens within the window (must be positive integer > 0) */
  limit: number;
  /** Window duration in milliseconds (must be positive integer > 0) */
  windowMs: number;
  /** Optional cost per check/consumption (Default: 1, must be integer >= 1) */
  cost?: number;
  /** Optional clock override timestamp in ms for testing/deterministic timing (Default: Date.now()) */
  now?: number;
};

/** Normalized rate limit evaluation result returned to Host */
export type RateLimitResult = {
  /** Whether the request is permitted under the limit */
  allowed: boolean;
  /** Remaining capacity in the current window (>= 0) */
  remaining: number;
  /** Unix timestamp in milliseconds when the current window resets */
  resetAt: number;
  /** Time in milliseconds until the host can retry if blocked (0 if allowed) */
  retryAfterMs: number;
};

/** Host-injected Factory Configuration */
export type RateLimitConfig = {
  /** Storage adapter implementation (Default: Memory store instance) */
  store?: RateLimitStore;
  /** Default rate limit ceiling if omitted in individual checks */
  defaultLimit?: number;
  /** Default window duration in milliseconds if omitted in individual checks */
  defaultWindowMs?: number;
  /** Whether checkOrThrow throws RateLimitError on limit exceed (Default: true) */
  throwOnLimitExceeded?: boolean;
};

/** Parameters passed to RateLimitStore.consume() */
export type StoreConsumeParams = {
  /** Host-created rate limit key */
  key: string;
  /** Cost/tokens to consume */
  cost: number;
  /** Maximum allowed capacity */
  limit: number;
  /** Window duration in milliseconds */
  windowMs: number;
  /** Current Unix timestamp in milliseconds */
  now: number;
};

/** Result returned by RateLimitStore.consume() */
export type StoreConsumeResult = {
  /** Current accumulated count in the window after consumption */
  currentCount: number;
  /** Window start timestamp in milliseconds */
  windowStart: number;
  /** Window end / reset timestamp in milliseconds */
  resetAt: number;
  /** Whether consumption was successful within limit bounds */
  allowed: boolean;
};

/** Storage Adapter Contract Interface */
export interface RateLimitStore {
  /** Consume tokens/attempts for a key within a fixed window */
  consume(params: StoreConsumeParams): Promise<StoreConsumeResult>;
  /** Optional method to reset/clear a specific key or all keys */
  reset?(key?: string): Promise<void>;
}

/** Options for Memory Store creation */
export type MemoryStoreOptions = {
  /** Optional maximum number of keys stored before passive eviction (Default: 10000) */
  maxKeys?: number;
};
```

---

## 4. `RateLimitStore` Interface Design

The `RateLimitStore` interface defines the abstraction boundary between the Rate Limit Core and storage engines.

```ts
export interface RateLimitStore {
  consume(params: StoreConsumeParams): Promise<StoreConsumeResult>;
  reset?(key?: string): Promise<void>;
}
```

### 4.1 `consume` Contract Rules

1. **Parameters:** Receives a single immutable `StoreConsumeParams` object containing `key`, `cost`, `limit`, `windowMs`, and `now`.
2. **Atomicity Requirement:** The `consume` operation MUST execute atomically per key. Incrementing the counter, calculating window reset, and checking limit boundaries must happen as a single atomic operation without race conditions between concurrent invocations.
3. **Counter Behavior:**
   - If current accumulated count + `cost` <= `limit`, the counter is incremented by `cost`, and `allowed: true` is returned.
   - If current accumulated count + `cost` > `limit`, the counter MUST NOT be incremented beyond `limit` (or remains unchanged), and `allowed: false` is returned.
4. **Window Boundary:** The store calculates window start as `Math.floor(now / windowMs) * windowMs` and reset timestamp as `windowStart + windowMs`.

---

## 5. Memory Adapter Design (`MemoryRateLimitStore`)

The `MemoryRateLimitStore` is an in-memory `Map`-based implementation of `RateLimitStore`.

### 5.1 Internal Bucket Structure

```ts
type WindowBucket = {
  windowStart: number;
  count: number;
  expiresAt: number;
};
```

The adapter maintains an internal `Map<string, WindowBucket>`.

### 5.2 Storage & Lazy Expiry Strategy

1. **Window Lookup & Expiry:** When `consume(params)` is called:
   - Calculate current window start: `currentWindowStart = Math.floor(now / windowMs) * windowMs`.
   - Retrieve existing bucket for `key`.
   - If no bucket exists OR `now >= bucket.expiresAt` OR `bucket.windowStart !== currentWindowStart`:
     - The previous window has expired. Initialize a new bucket:
       ```ts
       bucket = {
         windowStart: currentWindowStart,
         count: 0,
         expiresAt: currentWindowStart + windowMs
       };
       ```
2. **Consumption Logic:**
   - If `bucket.count + cost <= limit`:
     - `bucket.count += cost`
     - Return `{ currentCount: bucket.count, windowStart: bucket.windowStart, resetAt: bucket.expiresAt, allowed: true }`
   - Else:
     - Do NOT increment `bucket.count`.
     - Return `{ currentCount: bucket.count, windowStart: bucket.windowStart, resetAt: bucket.expiresAt, allowed: false }`
3. **Passive Eviction:**
   - When the `Map` size exceeds `maxKeys` (default: 10,000), the adapter performs a fast linear sweep to remove expired buckets (`now >= bucket.expiresAt`).
   - Active background timer loops (`setInterval`) are **STRICTLY PROHIBITED**.

### 5.3 Single-Process Limitation Notice

> **WARNING:** `MemoryRateLimitStore` is strictly designed for local development, unit testing, and single-instance applications. It stores state entirely in process memory (`Map`). It DOES NOT sync state across multi-process clusters, PM2 instances, serverless functions, or edge workers. **It is NOT suitable for distributed production environments.**

---

## 6. Fixed Window Algorithm Design

Version 0.1 of the module implements a precise **Fixed Window Algorithm**.

```
Time Window Timeline (windowMs = 60,000ms / 1 min):
[00:00.000 ---------------- Window 1 ---------------- 00:59.999] [01:00.000 ---------------- Window 2 ---------------- 01:59.999]
     ↑                                                      ↑          ↑
 windowStart                                             resetAt   New windowStart
```

### 6.1 Mathematical Definitions

For any request occurring at Unix timestamp `now` (milliseconds):

1. **Window Start:**
   $$\text{windowStart} = \lfloor \frac{\text{now}}{\text{windowMs}} \rfloor \times \text{windowMs}$$

2. **Reset Timestamp:**
   $$\text{resetAt} = \text{windowStart} + \text{windowMs}$$

3. **Remaining Quota:**
   $$\text{remaining} = \max(0, \text{limit} - \text{currentCount})$$

4. **Retry After Delay:**
   $$\text{retryAfterMs} = \begin{cases} 0 & \text{if allowed = true} \\ \max(0, \text{resetAt} - \text{now}) & \text{if allowed = false} \end{cases}$$

---

## 7. Structured Errors & Error Module Integration

When a rate limit check is executed via `checkOrThrow()` or when `throwOnLimitExceeded: true` is configured, reaching the limit throws a structured `RateLimitError`.

### 7.1 `RateLimitError` Class

```ts
export class RateLimitError extends Error {
  readonly code: 'RATE_LIMITED';
  readonly status: 429;
  readonly retryable: true;
  readonly key: string;
  readonly limit: number;
  readonly windowMs: number;
  readonly resetAt: number;
  readonly retryAfterMs: number;
  readonly details: Record<string, unknown>;

  constructor(options: {
    key: string;
    limit: number;
    windowMs: number;
    resetAt: number;
    retryAfterMs: number;
    message?: string;
  });
}
```

### 7.2 Error Module Contract Compliance (`ErrorShape`)

`RateLimitError` conforms to the Module Hub standard `ErrorShape`:

```ts
export type ErrorShape = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  requestId?: string;
  retryable: boolean;
};
```

- **`code`:** `'RATE_LIMITED'` (literal standard string code).
- **`message`:** `"Rate limit exceeded for key \"<key>\". Retry after <retryAfterMs>ms."`
- **`retryable`:** `true` (requests blocked by rate limit ARE retryable once `retryAfterMs` has elapsed).
- **`details`:**
  ```ts
  {
    key: string,
    limit: number,
    windowMs: number,
    remaining: 0,
    resetAt: number,
    retryAfterMs: number
  }
  ```

### 7.3 Invalid Configuration Error (`RateLimitConfigError`)

If invalid inputs (e.g. `limit <= 0`, `windowMs <= 0`, empty `key`) are passed:

```ts
export class RateLimitConfigError extends Error {
  readonly code: 'RATE_LIMIT_INVALID_CONFIG';
  readonly retryable: false;
}
```

---

## 8. Config Contract & Input Validation

### 8.1 Validation Rules (Fail Fast)

The core `checkRateLimit` pipeline performs strict validation before invoking the store:

| Input Parameter | Validation Requirement | Error Code on Failure |
|---|---|---|
| `key` | Must be a non-empty string (`typeof key === 'string' && key.trim().length > 0`) | `RATE_LIMIT_INVALID_CONFIG` |
| `limit` | Must be an integer greater than 0 (`Number.isInteger(limit) && limit > 0`) | `RATE_LIMIT_INVALID_CONFIG` |
| `windowMs` | Must be a number greater than 0 (`typeof windowMs === 'number' && windowMs > 0`) | `RATE_LIMIT_INVALID_CONFIG` |
| `cost` | Must be an integer greater than or equal to 1 (Default: 1) | `RATE_LIMIT_INVALID_CONFIG` |
| `now` | Must be a finite number > 0 if provided (Default: `Date.now()`) | `RATE_LIMIT_INVALID_CONFIG` |

### 8.2 Zero Direct Environment Access

The Rate Limit module MUST NOT read `process.env`, `env`, or `globalThis.process.env`. All default limits, windows, and store settings MUST be injected by the Host application via `RateLimitConfig`.

---

## 9. Test Requirements (for Stage 3 Tester)

The test suite must be implemented using `vitest` in `tests/`. Downstream agents MUST verify every enumerated test case:

| Test File | Test Case Name | Assertion / Expected Outcome |
|---|---|---|
| `limiter.test.ts` | `First request allowed` | Initial check returns `allowed: true`, `remaining: limit - cost`, `retryAfterMs: 0`. |
| `limiter.test.ts` | `Remaining count decrements` | Sequential checks decrement `remaining` value down to 0 accurately. |
| `limiter.test.ts` | `Limit reached blocks request` | Check exceeding `limit` returns `allowed: false`, `remaining: 0`, `retryAfterMs > 0`. |
| `limiter.test.ts` | `Window reset clears counter` | Advancing mock clock (`now >= resetAt`) resets window counter, permitting full quota. |
| `limiter.test.ts` | `Independent keys` | Usage on key `"ip:1.1.1.1"` does not affect quota or window of key `"ip:2.2.2.2"`. |
| `config.test.ts` | `Invalid limit validation` | Passing `limit: 0` or `limit: -5` throws `RateLimitConfigError` (`RATE_LIMIT_INVALID_CONFIG`). |
| `config.test.ts` | `Invalid windowMs validation` | Passing `windowMs: 0` or negative window throws `RateLimitConfigError`. |
| `config.test.ts` | `Empty key validation` | Passing `key: ""` throws `RateLimitConfigError`. |
| `memory-store.test.ts` | `Concurrent consume behavior` | Simultaneous `Promise.all` calls to `consume` update counter atomically without race conditions. |
| `memory-store.test.ts` | `Lazy expiry cleanup` | Stale buckets are overwritten lazily upon first access after window expiration. |
| `error.test.ts` | `Structured RateLimitError throwing` | Calling `checkOrThrow` when blocked throws `RateLimitError` conforming to `ErrorShape`. |
| `error.test.ts` | `Error properties verification` | `RateLimitError` contains `status: 429`, `retryable: true`, correct `retryAfterMs`, and `resetAt`. |

---

## 10. File Structure

The module directory layout strictly follows the Module Hub monorepo standard:

```
modules/rate-limit/
├── MODULE.md
├── VERSION
├── package.json
├── tsconfig.json
├── index.ts
├── core/
│   ├── index.ts
│   ├── limiter.ts
│   ├── types.ts
│   ├── error.ts
│   └── config.ts
├── adapters/
│   ├── index.ts
│   └── memory-store.ts
├── tests/
│   ├── unit/
│   │   ├── limiter.test.ts
│   │   ├── memory-store.test.ts
│   │   ├── config.test.ts
│   │   └── error.test.ts
│   └── integration/
│       └── rate-limit.test.ts
└── examples/
    └── integration.example.ts
```

---

## 11. `package.json` and `tsconfig.json` Reference Shape

### `package.json`
```json
{
  "name": "@module-hub/rate-limit",
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
    "lib": ["ES2022"],
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

## 12. `integration.example.ts` Reference Shape

```ts
import {
  createRateLimiter,
  createMemoryStore,
  RateLimitError
} from '../index.js';

// Host instantiates store adapter and rate limiter
const store = createMemoryStore();
const limiter = createRateLimiter({
  store,
  defaultLimit: 5,
  defaultWindowMs: 60000 // 1 minute window
});

async function handleIncomingRequest(clientIp: string) {
  const rateLimitKey = `ip:${clientIp}:api_v1`;

  try {
    // 1. Check rate limit
    const result = await limiter.checkOrThrow({
      key: rateLimitKey,
      limit: 5,
      windowMs: 60000
    });

    console.log(`[ALLOWED] Remaining quota: ${result.remaining}/${5}. Resets at: ${new Date(result.resetAt).toISOString()}`);
    return { status: 200, body: 'Success' };
  } catch (error) {
    if (error instanceof RateLimitError) {
      console.error(`[BLOCKED] Key: ${error.key}. Retry after: ${error.retryAfterMs}ms`);
      return {
        status: error.status, // 429
        headers: {
          'Retry-After': Math.ceil(error.retryAfterMs / 1000).toString(),
          'X-RateLimit-Reset': error.resetAt.toString()
        },
        body: {
          code: error.code,
          message: error.message,
          retryAfterMs: error.retryAfterMs
        }
      };
    }
    throw error;
  }
}

// Example usage run
async function run() {
  const ip = '203.0.113.195';
  for (let i = 1; i <= 6; i++) {
    const res = await handleIncomingRequest(ip);
    console.log(`Request ${i} response status: ${res.status}`);
  }
}

run();
```

---

## 13. Explicit Non-Goals

The following features are **explicitly out of scope** for v0.1.0 of the Rate Limit module:

- **Sliding Window Log / Sliding Window Counter:** No sliding window interpolation algorithms in v0.1.
- **Token Bucket / Leaky Bucket:** No token bucket or burst refill capacity algorithms in v0.1.
- **Distributed Storage Adapters:** No Redis, Postgres, DynamoDB, Cloudflare KV, or Durable Objects adapters in v0.1.
- **Business Identity Resolution:** No IP parsing, header inspection, API key extraction, or user session decoding.
- **Active Background Cleanup Jobs:** No `setInterval` loops or background worker threads.
- **Direct Environment Variable Access:** No `process.env` reading.

---

## 14. Acceptance Criteria (for Stage 4 Reviewer)

A Stage 4 Reviewer MUST verify all of the following criteria before approving the module design & implementation:

1. [ ] **File Location:** Deliverable exists at `D:\AI-Workspace\projects\modules-hub\modules\rate-limit\DESIGN.md`.
2. [ ] **Runtime Independence:** Core code contains zero `node:*` imports and zero global `process.env` reads.
3. [ ] **Public API Contract:** `checkRateLimit({ key, limit, windowMs })` returns exact shape `{ allowed, remaining, resetAt, retryAfterMs }`.
4. [ ] **Adapter Abstraction:** `RateLimitStore` interface is strictly enforced, and `MemoryRateLimitStore` implements `consume(params)`.
5. [ ] **Fixed Window Calculation:** Mathematical window formula $\lfloor \text{now} / \text{windowMs} \rfloor \times \text{windowMs}$ is correctly applied.
6. [ ] **Single-Process Warning:** `MemoryRateLimitStore` documentation explicitly warns that it is NOT suitable for distributed production.
7. [ ] **Error Integration:** Blocked requests throw or yield structured `RateLimitError` (`code: 'RATE_LIMITED'`, `status: 429`, `retryable: true`, details attached).
8. [ ] **Input Validation:** Invalid `limit`, `windowMs`, or empty `key` fail fast with `RATE_LIMIT_INVALID_CONFIG`.
9. [ ] **Test Plan Completeness:** All 12 enumerated test cases are mapped and pass cleanly with `vitest`.
10. [ ] **Non-Goals Honored:** Zero sliding window, zero token bucket, zero Redis, zero identity logic, zero background interval loops.
