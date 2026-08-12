import { describe, expect, it } from 'vitest';
import { createRateLimiter } from '../index.js';

describe('rate limiter smoke', () => {
  it('allows the first request and decrements remaining quota', async () => {
    const limiter = createRateLimiter();

    const first = await limiter.check({ key: 'ip:1.1.1.1', limit: 2, windowMs: 1000, now: 100 });
    const second = await limiter.check({ key: 'ip:1.1.1.1', limit: 2, windowMs: 1000, now: 200 });

    expect(first).toEqual({
      allowed: true,
      remaining: 1,
      resetAt: 1000,
      retryAfterMs: 0,
    });
    expect(second.allowed).toBe(true);
    expect(second.remaining).toBe(0);
  });

  it('blocks when the limit is reached', async () => {
    const limiter = createRateLimiter();

    await limiter.check({ key: 'ip:2.2.2.2', limit: 1, windowMs: 1000, now: 100 });
    const blocked = await limiter.check({ key: 'ip:2.2.2.2', limit: 1, windowMs: 1000, now: 250 });

    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.resetAt).toBe(1000);
    expect(blocked.retryAfterMs).toBe(750);
  });

  it('resets the counter when the window changes', async () => {
    const limiter = createRateLimiter();

    await limiter.check({ key: 'ip:3.3.3.3', limit: 1, windowMs: 1000, now: 900 });
    const reset = await limiter.check({ key: 'ip:3.3.3.3', limit: 1, windowMs: 1000, now: 1000 });

    expect(reset).toEqual({
      allowed: true,
      remaining: 0,
      resetAt: 2000,
      retryAfterMs: 0,
    });
  });

  it('tracks independent keys separately', async () => {
    const limiter = createRateLimiter();

    await limiter.check({ key: 'ip:4.4.4.4', limit: 1, windowMs: 1000, now: 100 });
    const otherKey = await limiter.check({ key: 'ip:5.5.5.5', limit: 1, windowMs: 1000, now: 200 });

    expect(otherKey.allowed).toBe(true);
    expect(otherKey.remaining).toBe(0);
  });
});
