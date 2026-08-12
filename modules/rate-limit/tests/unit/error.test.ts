import { describe, it, expect } from 'vitest';
import { createRateLimiter, RateLimitError, RateLimitConfigError } from '../../index.js';
import type { ErrorShape } from '../../index.js';

// ---------------------------------------------------------------------------
// RateLimitError — structured error
// ---------------------------------------------------------------------------

describe('RateLimitError — structured error', () => {
  it('Structured RateLimitError throwing: calling checkOrThrow when blocked throws RateLimitError conforming to ErrorShape', async () => {
    const limiter = createRateLimiter();
    const key = 'ip:error-shape';

    await limiter.checkOrThrow({ key, limit: 1, windowMs: 1000, now: 100 });

    let caught: RateLimitError | null = null;
    try {
      await limiter.checkOrThrow({ key, limit: 1, windowMs: 1000, now: 200 });
    } catch (e) {
      caught = e as RateLimitError;
    }

    expect(caught).not.toBeNull();
    expect(caught).toBeInstanceOf(RateLimitError);

    // Verify ErrorShape conformance: { code, message, details?, retryable }
    const error = caught as RateLimitError;
    const shape: ErrorShape = {
      code: error.code,
      message: error.message,
      details: error.details,
      retryable: error.retryable,
    };
    expect(typeof shape.code).toBe('string');
    expect(typeof shape.message).toBe('string');
    expect(typeof shape.retryable).toBe('boolean');
    expect(shape.details).toBeDefined();
    expect(typeof shape.details).toBe('object');
  });

  it('Error properties verification: RateLimitError has correct code, status, retryable, retryAfterMs, resetAt, key, limit, windowMs, and details with remaining: 0', async () => {
    const limiter = createRateLimiter();
    const key = 'ip:props';
    const limit = 1;
    const windowMs = 1000;
    const now = 200;

    await limiter.checkOrThrow({ key, limit, windowMs, now: 100 });

    let caught: RateLimitError | null = null;
    try {
      await limiter.checkOrThrow({ key, limit, windowMs, now });
    } catch (e) {
      caught = e as RateLimitError;
    }

    expect(caught).not.toBeNull();
    const error = caught as RateLimitError;

    expect(error.code).toBe('RATE_LIMITED');
    expect(error.status).toBe(429);
    expect(error.retryable).toBe(true);
    expect(error.key).toBe(key);
    expect(error.limit).toBe(limit);
    expect(error.windowMs).toBe(windowMs);
    expect(error.resetAt).toBe(1000); // windowStart(0) + windowMs(1000)
    expect(error.retryAfterMs).toBe(800); // resetAt(1000) - now(200) = 800

    // Details object must contain remaining: 0 plus all context fields
    expect(error.details).toEqual({
      key,
      limit,
      windowMs,
      remaining: 0,
      resetAt: 1000,
      retryAfterMs: 800,
    });
  });

  it('RateLimitError message format: `Rate limit exceeded for key "<key>". Retry after <retryAfterMs>ms.`', async () => {
    const limiter = createRateLimiter();
    const key = 'ip:msg-fmt';

    await limiter.checkOrThrow({ key, limit: 1, windowMs: 1000, now: 100 });

    let caught: RateLimitError | null = null;
    try {
      await limiter.checkOrThrow({ key, limit: 1, windowMs: 1000, now: 500 });
    } catch (e) {
      caught = e as RateLimitError;
    }

    expect(caught).not.toBeNull();
    const error = caught as RateLimitError;
    // retryAfterMs = 1000 - 500 = 500
    expect(error.message).toBe(`Rate limit exceeded for key "${key}". Retry after 500ms.`);
  });
});

// ---------------------------------------------------------------------------
// RateLimitConfigError
// ---------------------------------------------------------------------------

describe('RateLimitConfigError', () => {
  it('RateLimitConfigError has code RATE_LIMIT_INVALID_CONFIG and retryable false', async () => {
    await expect(
      createRateLimiter().check({ key: '', limit: 1, windowMs: 1000, now: 100 })
    ).rejects.toThrow(RateLimitConfigError);

    let caught: RateLimitConfigError | null = null;
    try {
      await createRateLimiter().check({ key: '', limit: 1, windowMs: 1000, now: 100 });
    } catch (e) {
      caught = e as RateLimitConfigError;
    }

    expect(caught).not.toBeNull();
    const error = caught as RateLimitConfigError;
    expect(error).toBeInstanceOf(RateLimitConfigError);
    expect(error.code).toBe('RATE_LIMIT_INVALID_CONFIG');
    expect(error.retryable).toBe(false);
  });
});