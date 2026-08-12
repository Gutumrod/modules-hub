import { describe, it, expect } from 'vitest';
import { createRateLimiter, RateLimitError } from '../../index.js';
import type {
  CheckRateLimitInput,
  RateLimitStore,
  StoreConsumeParams,
  StoreConsumeResult,
} from '../../index.js';

// ---------------------------------------------------------------------------
// RateLimiter — check()
// ---------------------------------------------------------------------------

describe('RateLimiter — check()', () => {
  it('First request allowed: returns allowed:true, remaining = limit - cost, retryAfterMs: 0', async () => {
    const limiter = createRateLimiter();
    const result = await limiter.check({
      key: 'ip:1.1.1.1',
      limit: 5,
      windowMs: 1000,
      cost: 1,
      now: 100,
    });

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4); // limit - cost = 5 - 1
    expect(result.retryAfterMs).toBe(0);
    expect(result.resetAt).toBe(1000); // windowStart(0) + windowMs(1000)
  });

  it('Remaining count decrements: sequential checks decrement remaining down to 0', async () => {
    const limiter = createRateLimiter();
    const key = 'ip:decrement';

    const r1 = await limiter.check({ key, limit: 3, windowMs: 1000, now: 100 });
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);

    const r2 = await limiter.check({ key, limit: 3, windowMs: 1000, now: 200 });
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(1);

    const r3 = await limiter.check({ key, limit: 3, windowMs: 1000, now: 300 });
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);
  });

  it('Limit reached blocks request: returns allowed:false, remaining: 0, retryAfterMs > 0', async () => {
    const limiter = createRateLimiter();
    const key = 'ip:blocked';

    await limiter.check({ key, limit: 1, windowMs: 1000, now: 100 });
    const blocked = await limiter.check({ key, limit: 1, windowMs: 1000, now: 500 });

    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterMs).toBe(500); // resetAt(1000) - now(500)
    expect(blocked.resetAt).toBe(1000);
  });

  it('Window reset clears counter: advancing now past resetAt resets the window, permitting full quota', async () => {
    const limiter = createRateLimiter();
    const key = 'ip:reset';

    // Exhaust limit in window [0, 1000)
    await limiter.check({ key, limit: 2, windowMs: 1000, now: 100 });
    await limiter.check({ key, limit: 2, windowMs: 1000, now: 200 });
    const blocked = await limiter.check({ key, limit: 2, windowMs: 1000, now: 300 });
    expect(blocked.allowed).toBe(false);

    // Advance to next window [1000, 2000)
    const afterReset = await limiter.check({ key, limit: 2, windowMs: 1000, now: 1000 });
    expect(afterReset.allowed).toBe(true);
    expect(afterReset.remaining).toBe(1); // limit - cost = 2 - 1
    expect(afterReset.resetAt).toBe(2000);
    expect(afterReset.retryAfterMs).toBe(0);
  });

  it('Independent keys: usage on key "ip:1.1.1.1" does not affect quota or window of key "ip:2.2.2.2"', async () => {
    const limiter = createRateLimiter();

    // Exhaust key A
    await limiter.check({ key: 'ip:1.1.1.1', limit: 1, windowMs: 1000, now: 100 });
    const blockedA = await limiter.check({ key: 'ip:1.1.1.1', limit: 1, windowMs: 1000, now: 200 });
    expect(blockedA.allowed).toBe(false);

    // Key B should be unaffected — full quota available
    const resultB = await limiter.check({ key: 'ip:2.2.2.2', limit: 1, windowMs: 1000, now: 200 });
    expect(resultB.allowed).toBe(true);
    expect(resultB.remaining).toBe(0);
    expect(resultB.resetAt).toBe(1000);
  });

  it('cost > 1 consumption behavior: cost 2 consumes 2 from remaining', async () => {
    const limiter = createRateLimiter();
    const key = 'ip:cost2';

    const r1 = await limiter.check({ key, limit: 5, windowMs: 1000, cost: 2, now: 100 });
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(3); // 5 - 2 = 3

    const r2 = await limiter.check({ key, limit: 5, windowMs: 1000, cost: 2, now: 200 });
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(1); // 5 - 4 = 1

    // cost 2 would make count 6 > limit 5, so blocked
    const r3 = await limiter.check({ key, limit: 5, windowMs: 1000, cost: 2, now: 300 });
    expect(r3.allowed).toBe(false);
    expect(r3.remaining).toBe(1); // max(0, 5 - 4) = 1
    expect(r3.retryAfterMs).toBe(700); // 1000 - 300
  });

  it('check() returns allowed:false without throwing when blocked', async () => {
    const limiter = createRateLimiter();
    const key = 'ip:nothrow';

    await limiter.check({ key, limit: 1, windowMs: 1000, now: 100 });

    // Should NOT throw — just return allowed:false
    const result = await limiter.check({ key, limit: 1, windowMs: 1000, now: 200 });
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// RateLimiter — checkOrThrow()
// ---------------------------------------------------------------------------

describe('RateLimiter — checkOrThrow()', () => {
  it('checkOrThrow() throws RateLimitError when blocked (default throwOnLimitExceeded true)', async () => {
    const limiter = createRateLimiter();
    const key = 'ip:throw';

    await limiter.checkOrThrow({ key, limit: 1, windowMs: 1000, now: 100 });

    await expect(
      limiter.checkOrThrow({ key, limit: 1, windowMs: 1000, now: 200 })
    ).rejects.toBeInstanceOf(RateLimitError);
  });

  it('checkOrThrow() with throwOnLimitExceeded:false returns the result instead of throwing', async () => {
    const limiter = createRateLimiter({ throwOnLimitExceeded: false });
    const key = 'ip:nothrow-config';

    await limiter.checkOrThrow({ key, limit: 1, windowMs: 1000, now: 100 });

    // Should NOT throw — returns result with allowed:false
    const result = await limiter.checkOrThrow({ key, limit: 1, windowMs: 1000, now: 200 });
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// RateLimiter — config defaults and custom store
// ---------------------------------------------------------------------------

describe('RateLimiter — config defaults and custom store', () => {
  it('defaultLimit / defaultWindowMs from config used when omitted in individual check', async () => {
    const limiter = createRateLimiter({ defaultLimit: 3, defaultWindowMs: 1000 });

    // Omit limit and windowMs — should use config defaults
    const result = await limiter.check({ key: 'ip:defaults', now: 100 } as CheckRateLimitInput);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2); // defaultLimit(3) - cost(1) = 2
    expect(result.resetAt).toBe(1000); // windowStart(0) + defaultWindowMs(1000)
  });

  it('custom store injected via config is used', async () => {
    const calls: StoreConsumeParams[] = [];
    const stubStore: RateLimitStore = {
      async consume(params: StoreConsumeParams): Promise<StoreConsumeResult> {
        calls.push(params);
        return {
          currentCount: params.cost,
          windowStart: Math.floor(params.now / params.windowMs) * params.windowMs,
          resetAt: Math.floor(params.now / params.windowMs) * params.windowMs + params.windowMs,
          allowed: true,
        };
      },
    };

    const limiter = createRateLimiter({ store: stubStore });
    const result = await limiter.check({ key: 'ip:stub', limit: 5, windowMs: 1000, now: 100 });

    expect(calls).toHaveLength(1);
    expect(calls[0].key).toBe('ip:stub');
    expect(calls[0].limit).toBe(5);
    expect(calls[0].windowMs).toBe(1000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4); // limit(5) - currentCount(1)
  });
});