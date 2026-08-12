import { describe, it, expect } from 'vitest';
import {
  createRateLimiter,
  createMemoryStore,
  checkRateLimit,
  RateLimitError,
} from '../../index.js';
import type { CheckRateLimitInput } from '../../index.js';

// ---------------------------------------------------------------------------
// Rate Limit — end-to-end integration
// ---------------------------------------------------------------------------

describe('Rate Limit — end-to-end integration', () => {
  it('Full flow: createMemoryStore + createRateLimiter with defaults, consume up to limit, verify across window, then window reset restores quota', async () => {
    const store = createMemoryStore();
    const limiter = createRateLimiter({
      store,
      defaultLimit: 3,
      defaultWindowMs: 1000,
    });

    // Request 1: allowed, remaining = 2
    const r1 = await limiter.check({ key: 'ip:integration', now: 100 } as CheckRateLimitInput);
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);
    expect(r1.resetAt).toBe(1000);
    expect(r1.retryAfterMs).toBe(0);

    // Request 2: allowed, remaining = 1
    const r2 = await limiter.check({ key: 'ip:integration', now: 200 } as CheckRateLimitInput);
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(1);

    // Request 3: allowed, remaining = 0
    const r3 = await limiter.check({ key: 'ip:integration', now: 300 } as CheckRateLimitInput);
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);

    // Request 4: blocked, remaining = 0, retryAfterMs > 0
    const r4 = await limiter.check({ key: 'ip:integration', now: 400 } as CheckRateLimitInput);
    expect(r4.allowed).toBe(false);
    expect(r4.remaining).toBe(0);
    expect(r4.retryAfterMs).toBe(600); // 1000 - 400

    // Window reset: advance to next window — full quota restored
    const r5 = await limiter.check({ key: 'ip:integration', now: 1000 } as CheckRateLimitInput);
    expect(r5.allowed).toBe(true);
    expect(r5.remaining).toBe(2); // defaultLimit(3) - cost(1) = 2
    expect(r5.resetAt).toBe(2000);
  });

  it('checkRateLimit standalone function with explicit store argument', async () => {
    const store = createMemoryStore();

    // First call with explicit store
    const r1 = await checkRateLimit(
      { key: 'standalone', limit: 2, windowMs: 1000, now: 100 },
      store
    );
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(1);

    // Second call with same store — counter persists
    const r2 = await checkRateLimit(
      { key: 'standalone', limit: 2, windowMs: 1000, now: 200 },
      store
    );
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(0);

    // Third call — blocked
    const r3 = await checkRateLimit(
      { key: 'standalone', limit: 2, windowMs: 1000, now: 300 },
      store
    );
    expect(r3.allowed).toBe(false);
    expect(r3.retryAfterMs).toBe(700); // 1000 - 300
  });

  it('Multiple keys interleaved in one window behave independently', async () => {
    const store = createMemoryStore();
    const limiter = createRateLimiter({ store, defaultLimit: 2, defaultWindowMs: 1000 });

    const keyA = 'ip:aaa';
    const keyB = 'ip:bbb';

    // Interleave requests between two keys at the same timestamps
    const rA1 = await limiter.check({ key: keyA, now: 100 } as CheckRateLimitInput);
    const rB1 = await limiter.check({ key: keyB, now: 100 } as CheckRateLimitInput);
    const rA2 = await limiter.check({ key: keyA, now: 200 } as CheckRateLimitInput);
    const rB2 = await limiter.check({ key: keyB, now: 200 } as CheckRateLimitInput);
    const rA3 = await limiter.check({ key: keyA, now: 300 } as CheckRateLimitInput);
    const rB3 = await limiter.check({ key: keyB, now: 300 } as CheckRateLimitInput);

    // Both keys should independently reach their limit
    expect(rA1.allowed).toBe(true);
    expect(rA2.allowed).toBe(true);
    expect(rA3.allowed).toBe(false);
    expect(rB1.allowed).toBe(true);
    expect(rB2.allowed).toBe(true);
    expect(rB3.allowed).toBe(false);

    // Both should have the same retryAfterMs at now=300
    expect(rA3.retryAfterMs).toBe(700); // 1000 - 300
    expect(rB3.retryAfterMs).toBe(700);
  });

  it('checkOrThrow + catch RateLimitError and map to status 429 / retryAfterMs (host-style integration)', async () => {
    const store = createMemoryStore();
    const limiter = createRateLimiter({ store, defaultLimit: 1, defaultWindowMs: 1000 });

    async function handleRequest(
      clientIp: string,
      now: number
    ): Promise<{
      status: number;
      body: { code: string; message: string; retryAfterMs: number };
      headers: { 'Retry-After': string; 'X-RateLimit-Reset': string };
    }> {
      const key = `ip:${clientIp}`;
      try {
        const result = await limiter.checkOrThrow({ key, now } as CheckRateLimitInput);
        return {
          status: 200,
          body: { code: 'OK', message: 'Success', retryAfterMs: 0 },
          headers: {
            'Retry-After': '0',
            'X-RateLimit-Reset': result.resetAt.toString(),
          },
        };
      } catch (e) {
        if (e instanceof RateLimitError) {
          return {
            status: e.status, // 429
            body: {
              code: e.code,
              message: e.message,
              retryAfterMs: e.retryAfterMs,
            },
            headers: {
              'Retry-After': Math.ceil(e.retryAfterMs / 1000).toString(),
              'X-RateLimit-Reset': e.resetAt.toString(),
            },
          };
        }
        throw e;
      }
    }

    // First request: OK
    const res1 = await handleRequest('203.0.113.1', 100);
    expect(res1.status).toBe(200);

    // Second request: rate limited
    const res2 = await handleRequest('203.0.113.1', 500);
    expect(res2.status).toBe(429);
    expect(res2.body.code).toBe('RATE_LIMITED');
    expect(res2.body.retryAfterMs).toBe(500); // 1000 - 500
    expect(res2.headers['Retry-After']).toBe('1'); // Math.ceil(500 / 1000) = 1
    expect(res2.headers['X-RateLimit-Reset']).toBe('1000');
  });
});