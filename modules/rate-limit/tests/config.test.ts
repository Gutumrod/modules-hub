import { describe, expect, it } from 'vitest';
import { createRateLimiter, RateLimitConfigError } from '../index.js';

describe('rate limit config smoke', () => {
  it('throws RateLimitConfigError for invalid config', async () => {
    const limiter = createRateLimiter();

    await expect(limiter.check({ key: 'ip:1.1.1.1', limit: 0, windowMs: 1000, now: 100 })).rejects.toBeInstanceOf(
      RateLimitConfigError
    );
    await expect(limiter.check({ key: 'ip:1.1.1.1', limit: 1, windowMs: 0, now: 100 })).rejects.toBeInstanceOf(
      RateLimitConfigError
    );
    await expect(limiter.check({ key: '', limit: 1, windowMs: 1000, now: 100 })).rejects.toBeInstanceOf(
      RateLimitConfigError
    );
  });
});
