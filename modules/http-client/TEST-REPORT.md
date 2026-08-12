# TEST-REPORT — HTTP Client Module

## Test File

- **Path:** `tests/http.test.ts`
- **Framework:** Vitest 2.1.4
- **Total tests:** 157 (all passing, 0 skipped, 0 todo, 0 empty)

## Test Count by Describe Block

| Describe Block | Tests |
|---|---|
| HttpClient verb helpers | 9 |
| 2xx response parsing | 9 |
| timeout behavior | 3 |
| retry policy | 11 |
| error normalization and codes | 14 |
| fetch-transport adapter | 10 |
| security: header redaction | 18 |
| logging hooks | 7 |
| retryDelayMs | 8 |
| parseRetryAfterMs | 8 |
| canRetryMethod | 8 |
| isRetryableStatus | 4 |
| mergeRetryPolicy | 5 |
| assertRetryAfterWithinLimit | 5 |
| parseResponseData | 9 |
| errorBodyText | 3 |
| createTimeoutControl | 5 |
| normalizeAbortError | 3 |
| sleep (retry.ts) | 3 |
| pipeline edge cases | 15 |
| **Total** | **157** |

## `npm test` Result

```
Test Files  1 passed (1)
     Tests  157 passed (157)
```

Exit code: 0

## `npm run test:coverage` Result

```
% Coverage report from v8
-------------|---------|----------|---------|---------|-------------------
File         | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
-------------|---------|----------|---------|---------|-------------------
All files    |    99.6 |     98.4 |   97.67 |    99.6
client.ts   |     100 |      100 |     100 |     100
error.ts    |     100 |      100 |     100 |     100
index.ts    |       0 |        0 |       0 |       0 | (re-export, no logic)
parsing.ts  |     100 |      100 |     100 |     100
pipeline.ts |   99.42 |     98.3 |     100 |   99.42 | 115
retry.ts    |     100 |    97.29 |     100 |     100 | 68
security.ts |     100 |      100 |     100 |     100
timeout.ts  |     100 |      100 |     100 |     100
types.ts    |       0 |        0 |       0 |       0 | (type-only, no runtime)
```

### Coverage gate (vitest.config.ts thresholds)

| Metric | Gate | Actual | Pass |
|---|---|---|---|
| Lines | ≥ 90% | 99.6% | ✅ |
| Functions | ≥ 90% | 97.67% | ✅ |
| Branches | ≥ 85% | 98.4% | ✅ |
| Statements | ≥ 90% | 99.6% | ✅ |

### Uncovered lines

- **pipeline.ts:115** — `throw normalizeAbortError(...)` inside the `.catch()` handler on the retry sleep after a network error. This is defensive dead code: `timeout.cleanup()` is called before the sleep, which clears the timeout timer and removes the external abort listener, so `timeout.signal` cannot be aborted during this particular sleep call. The `.catch()` is a safety net that is effectively unreachable with the current control flow.
- **retry.ts:68** — The `maxRetryAfterMs !== undefined` branch in `assertRetryAfterWithinLimit`. Since `maxRetryAfterMs` has a default value in `DEFAULT_RETRY_POLICY` and the `??` operator always provides a fallback, this condition is always `true`, making the `undefined` branch unreachable.
- **index.ts / types.ts** — Re-export/type-only files with no runtime logic.

## Genuine Production Bugs Found

### Bug 1: `maxAttempts: 1` with retryable errors wraps as `HTTP_RETRY_EXHAUSTED` instead of the underlying error

**Location:** `core/pipeline.ts` lines 99–106

**Description:** When `maxAttempts` is set to `1` (or forced to `1` for non-idempotent methods without `allowUnsafeRetries`), and the request fails with a retryable error (e.g., HTTP 500, HTTP_NETWORK_ERROR, HTTP_TIMEOUT), the pipeline wraps the error as `HTTP_RETRY_EXHAUSTED` with the original error as `cause`, rather than throwing the original error directly.

The relevant logic:
```typescript
if (!normalized.retryable || attempt >= maxAttempts) {
  const finalError =
    attempt >= maxAttempts && normalized.retryable
      ? new HttpError({ code: 'HTTP_RETRY_EXHAUSTED', ... cause: normalized })
      : normalized;
  ...
}
```

When `maxAttempts=1` and `attempt=1`, `attempt >= maxAttempts` is `true` and `normalized.retryable` is `true`, so it always creates `HTTP_RETRY_EXHAUSTED` — even though no retry was actually attempted. A single failed attempt that was never retried is semantically "exhausted" by the code's definition, but this is surprising: a caller setting `maxAttempts: 1` expects to get the original error code (e.g., `HTTP_SERVER_ERROR`), not `HTTP_RETRY_EXHAUSTED`.

**Impact:** Callers who set `maxAttempts: 1` to disable retries will receive `HTTP_RETRY_EXHAUSTED` instead of the actual error code (e.g., `HTTP_SERVER_ERROR`, `HTTP_NETWORK_ERROR`, `HTTP_TIMEOUT`). They must inspect `error.cause` to determine what actually happened. This also affects all non-idempotent requests (POST/PUT/PATCH/DELETE) without `allowUnsafeRetries`, since `maxAttempts` is forced to `1` for those methods.

**Recommended fix:** The condition should distinguish between "no retries were attempted" and "retries were exhausted". For example, only wrap as `HTTP_RETRY_EXHAUSTED` when `maxAttempts > 1` and `attempt >= maxAttempts`, or check `attempt > 1` before wrapping.

### Bug 2: `assertRetryAfterWithinLimit` throw is caught and retried instead of failing immediately

**Location:** `core/pipeline.ts` lines 82–87 (inside the try block)

**Description:** When a retryable status (e.g., 429, 503) has a `Retry-After` header exceeding `maxRetryAfterMs`, `assertRetryAfterWithinLimit` throws `HTTP_RATE_LIMITED` (for 429) or `HTTP_SERVER_ERROR` (for 503). However, this throw happens inside the `try` block, so it's caught by the `catch` block. Since `HTTP_RATE_LIMITED` and `HTTP_SERVER_ERROR` are both retryable (`retryable: true` is set in `assertRetryAfterWithinLimit`), the catch block treats them as retryable errors and continues the retry loop.

**Impact:** A request that should fail immediately with `HTTP_RATE_LIMITED` (because the server says "retry in 99999 seconds") instead retries all `maxAttempts` times, then returns `HTTP_RETRY_EXHAUSTED` with the `HTTP_RATE_LIMITED` error as `cause`. The caller never sees `HTTP_RATE_LIMITED` directly — they see `HTTP_RETRY_EXHAUSTED`. This wastes retry attempts and delays the error, and the caller loses the specific error code.

**Recommended fix:** Move `assertRetryAfterWithinLimit` outside the try block, or mark its errors as non-retryable, or check for these specific error codes in the catch block and rethrow immediately.

### Observation (not a bug): `parseRetryAfterMs` accepts negative integers and floats as valid dates

**Location:** `core/retry.ts` line 38

**Description:** `parseRetryAfterMs('-5')` and `parseRetryAfterMs('1.5')` return `0` instead of `undefined`, because `Date.parse` successfully parses these as valid (past) dates, and `Math.max(0, negativeDiff)` returns `0`. This is a minor edge case — a `Retry-After: -5` header would result in a 0ms delay rather than being ignored. In practice, no well-behaved server sends negative Retry-After values, so this is low severity.