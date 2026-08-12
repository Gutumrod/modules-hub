import { describe, it, expect } from 'vitest';
import { checkRateLimit, RateLimitConfigError } from '../../index.js';

// ---------------------------------------------------------------------------
// Input validation — invalid inputs throw RateLimitConfigError
// ---------------------------------------------------------------------------

describe('Input validation — invalid inputs throw RateLimitConfigError', () => {
  it('Invalid limit validation: limit 0 or negative throws RateLimitConfigError (code RATE_LIMIT_INVALID_CONFIG)', async () => {
    await expect(
      checkRateLimit({ key: 'k', limit: 0, windowMs: 1000, now: 100 })
    ).rejects.toBeInstanceOf(RateLimitConfigError);

    await expect(
      checkRateLimit({ key: 'k', limit: -5, windowMs: 1000, now: 100 })
    ).rejects.toBeInstanceOf(RateLimitConfigError);

    // Verify error code
    await expect(
      checkRateLimit({ key: 'k', limit: 0, windowMs: 1000, now: 100 })
    ).rejects.toHaveProperty('code', 'RATE_LIMIT_INVALID_CONFIG');
  });

  it('Invalid windowMs validation: windowMs 0 or negative throws RateLimitConfigError', async () => {
    await expect(
      checkRateLimit({ key: 'k', limit: 1, windowMs: 0, now: 100 })
    ).rejects.toBeInstanceOf(RateLimitConfigError);

    await expect(
      checkRateLimit({ key: 'k', limit: 1, windowMs: -100, now: 100 })
    ).rejects.toBeInstanceOf(RateLimitConfigError);
  });

  it('Empty key validation: key "" or whitespace-only throws RateLimitConfigError', async () => {
    await expect(
      checkRateLimit({ key: '', limit: 1, windowMs: 1000, now: 100 })
    ).rejects.toBeInstanceOf(RateLimitConfigError);

    await expect(
      checkRateLimit({ key: '   ', limit: 1, windowMs: 1000, now: 100 })
    ).rejects.toBeInstanceOf(RateLimitConfigError);
  });

  it('Invalid cost: cost 0 or negative throws RateLimitConfigError', async () => {
    await expect(
      checkRateLimit({ key: 'k', limit: 1, windowMs: 1000, cost: 0, now: 100 })
    ).rejects.toBeInstanceOf(RateLimitConfigError);

    await expect(
      checkRateLimit({ key: 'k', limit: 1, windowMs: 1000, cost: -1, now: 100 })
    ).rejects.toBeInstanceOf(RateLimitConfigError);
  });

  it('Invalid now: now 0 or negative or NaN throws RateLimitConfigError', async () => {
    await expect(
      checkRateLimit({ key: 'k', limit: 1, windowMs: 1000, now: 0 })
    ).rejects.toBeInstanceOf(RateLimitConfigError);

    await expect(
      checkRateLimit({ key: 'k', limit: 1, windowMs: 1000, now: -100 })
    ).rejects.toBeInstanceOf(RateLimitConfigError);

    await expect(
      checkRateLimit({ key: 'k', limit: 1, windowMs: 1000, now: NaN })
    ).rejects.toBeInstanceOf(RateLimitConfigError);
  });
});

// ---------------------------------------------------------------------------
// Input validation — valid inputs resolve without throwing
// ---------------------------------------------------------------------------

describe('Input validation — valid inputs resolve without throwing', () => {
  it('Valid inputs resolve without throwing; defaults (cost 1, now Date.now()) applied', async () => {
    // Omit cost and now — should default to cost=1 and now=Date.now()
    const result = await checkRateLimit({ key: 'k', limit: 3, windowMs: 60000 });

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2); // limit(3) - cost(1) = 2
    expect(result.retryAfterMs).toBe(0); // allowed, so 0

    // resetAt should be a reasonable future timestamp based on Date.now()
    expect(result.resetAt).toBeGreaterThan(0);
    expect(result.resetAt).toBeGreaterThan(Date.now() - 1000); // roughly now + window
  });
});