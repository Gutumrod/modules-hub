/**
 * Rate Limit Module — single-command runnable example.
 *
 *   npm run example
 *
 * Self-contained by design: no network, no file system writes, no secrets, no
 * environment reads. Every timestamp is passed explicitly through the `now`
 * input, so the observed output is deterministic.
 *
 * It exercises the module's real public API through the module entry point:
 *   - createMemoryStore()             v0.1 in-memory store adapter
 *   - createRateLimiter(config)       wired limiter (check / checkOrThrow)
 *   - checkRateLimit(input, store)    stateless entry point (never throws on limit)
 *   - RateLimitError                  thrown by checkOrThrow, code RATE_LIMITED
 */

import {
  checkRateLimit,
  createMemoryStore,
  createRateLimiter,
  RateLimitError,
} from '../index.js';

// Host-owned values. The module never reads them from the environment.
const KEY = 'ip:203.0.113.195:api_v1';
const LIMIT = 3;
const WINDOW_MS = 1000;
const FIRST_NOW = 1000; // fixed clock: window is [1000, 2000)

async function main(): Promise<void> {
  const store = createMemoryStore();
  const limiter = createRateLimiter({
    store,
    defaultLimit: LIMIT,
    defaultWindowMs: WINDOW_MS,
  });

  let allowed = 0;
  let blocked = 0;
  let lastRemaining = -1;
  let firstResetAt = 0;

  // LIMIT + 1 checks inside one fixed window: the last one must be blocked.
  for (let i = 0; i <= LIMIT; i++) {
    const result = await limiter.check({
      key: KEY,
      limit: LIMIT,
      windowMs: WINDOW_MS,
      now: FIRST_NOW + i,
    });

    if (result.allowed) allowed += 1;
    else blocked += 1;
    if (i === 0) firstResetAt = result.resetAt;
    lastRemaining = result.remaining;
  }

  // checkOrThrow converts a blocked check into a structured RateLimitError.
  let thrownCode = 'NONE';
  let thrownStatus = 0;
  try {
    await limiter.checkOrThrow({
      key: KEY,
      limit: LIMIT,
      windowMs: WINDOW_MS,
      now: FIRST_NOW + LIMIT + 1,
    });
  } catch (error) {
    if (error instanceof RateLimitError) {
      thrownCode = error.code;
      thrownStatus = error.status;
    } else {
      throw error;
    }
  }

  // The stateless entry point returns `allowed: false` instead of throwing.
  const stateless = await checkRateLimit(
    { key: 'user:usr_123', limit: 1, windowMs: WINDOW_MS, now: FIRST_NOW },
    store
  );
  const statelessBlocked = await checkRateLimit(
    { key: 'user:usr_123', limit: 1, windowMs: WINDOW_MS, now: FIRST_NOW + 1 },
    store
  );

  console.log(`fixed-window checks=${LIMIT + 1} limit=${LIMIT} allowed=${allowed} blocked=${blocked}`);
  console.log(`first resetAt=${firstResetAt} last remaining=${lastRemaining}`);
  console.log(`checkOrThrow threw code=${thrownCode} status=${thrownStatus}`);
  console.log(
    `checkRateLimit allowed=${stateless.allowed} then allowed=${statelessBlocked.allowed} retryAfterMs=${statelessBlocked.retryAfterMs}`
  );
  console.log(
    `EXAMPLE_RESULT: OK allowed=${allowed} blocked=${blocked} lastRemaining=${lastRemaining} thrownCode=${thrownCode} thrownStatus=${thrownStatus} statelessRetryAfterMs=${statelessBlocked.retryAfterMs}`
  );
}

await main();
