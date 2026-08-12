import { describe, it, expect } from 'vitest';
import { createMemoryStore } from '../../index.js';

// ---------------------------------------------------------------------------
// MemoryRateLimitStore — consume()
// ---------------------------------------------------------------------------

describe('MemoryRateLimitStore — consume()', () => {
  it('consume returns correct windowStart / resetAt / currentCount / allowed shape', async () => {
    const store = createMemoryStore();

    const result = await store.consume({
      key: 'k1',
      cost: 1,
      limit: 5,
      windowMs: 1000,
      now: 100,
    });

    expect(result.allowed).toBe(true);
    expect(result.currentCount).toBe(1);
    expect(result.windowStart).toBe(0); // Math.floor(100 / 1000) * 1000 = 0
    expect(result.resetAt).toBe(1000); // windowStart + windowMs
  });

  it('Concurrent consume behavior: 5 concurrent consumes, limit 3 -> exactly 3 allowed, 2 denied, max currentCount 3', async () => {
    const store = createMemoryStore();

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        store.consume({ key: 'concurrent', cost: 1, limit: 3, windowMs: 1000, now: 100 })
      )
    );

    const allowed = results.filter((r) => r.allowed);
    const denied = results.filter((r) => !r.allowed);

    expect(allowed).toHaveLength(3);
    expect(denied).toHaveLength(2);
    expect(Math.max(...results.map((r) => r.currentCount))).toBe(3);
    // Denied requests must not have incremented the counter beyond limit
    denied.forEach((r) => expect(r.currentCount).toBe(3));
  });

  it('Lazy expiry cleanup: stale buckets are overwritten lazily on first access after window expiration', async () => {
    const store = createMemoryStore();

    // Create bucket in window [0, 1000)
    const r1 = await store.consume({ key: 'lazy', cost: 1, limit: 2, windowMs: 1000, now: 100 });
    expect(r1.currentCount).toBe(1);
    expect(r1.windowStart).toBe(0);

    // Exhaust in same window
    const r2 = await store.consume({ key: 'lazy', cost: 1, limit: 2, windowMs: 1000, now: 200 });
    expect(r2.allowed).toBe(true);
    expect(r2.currentCount).toBe(2);

    // Third request in same window — blocked
    const r3 = await store.consume({ key: 'lazy', cost: 1, limit: 2, windowMs: 1000, now: 300 });
    expect(r3.allowed).toBe(false);
    expect(r3.currentCount).toBe(2); // not incremented beyond limit

    // Advance to next window — lazy expiry creates fresh bucket
    const r4 = await store.consume({ key: 'lazy', cost: 1, limit: 2, windowMs: 1000, now: 1000 });
    expect(r4.allowed).toBe(true);
    expect(r4.currentCount).toBe(1); // fresh bucket, count reset
    expect(r4.windowStart).toBe(1000);
    expect(r4.resetAt).toBe(2000);
  });
});

// ---------------------------------------------------------------------------
// MemoryRateLimitStore — reset()
// ---------------------------------------------------------------------------

describe('MemoryRateLimitStore — reset()', () => {
  it('reset(key) clears a single key; reset() clears all keys', async () => {
    const store = createMemoryStore();

    // Populate two keys
    await store.consume({ key: 'a', cost: 1, limit: 5, windowMs: 1000, now: 100 });
    await store.consume({ key: 'b', cost: 1, limit: 5, windowMs: 1000, now: 100 });

    // Reset only key 'a' — call as method to preserve `this` binding
    await store.reset?.('a');

    // Key 'a' should have a fresh bucket
    const rA = await store.consume({ key: 'a', cost: 1, limit: 5, windowMs: 1000, now: 100 });
    expect(rA.currentCount).toBe(1); // was reset, fresh count

    // Key 'b' should still have its old count
    const rB = await store.consume({ key: 'b', cost: 1, limit: 5, windowMs: 1000, now: 200 });
    expect(rB.currentCount).toBe(2); // was 1, now 2

    // Reset all
    await store.reset?.();

    const rA2 = await store.consume({ key: 'a', cost: 1, limit: 5, windowMs: 1000, now: 300 });
    const rB2 = await store.consume({ key: 'b', cost: 1, limit: 5, windowMs: 1000, now: 300 });
    expect(rA2.currentCount).toBe(1); // fully reset
    expect(rB2.currentCount).toBe(1); // fully reset
  });
});

// ---------------------------------------------------------------------------
// MemoryRateLimitStore — maxKeys passive eviction
// ---------------------------------------------------------------------------

describe('MemoryRateLimitStore — maxKeys passive eviction', () => {
  it('with a small maxKeys, expired buckets are evicted when size exceeds maxKeys', async () => {
    const store = createMemoryStore({ maxKeys: 2 });

    // Add 3 keys in window [0, 100) — all non-expired at now=50.
    // Eviction runs BEFORE adding a new bucket and only removes EXPIRED entries,
    // so non-expired buckets survive even when size > maxKeys.
    await store.consume({ key: 'k1', cost: 1, limit: 5, windowMs: 100, now: 50 });
    await store.consume({ key: 'k2', cost: 1, limit: 5, windowMs: 100, now: 50 });
    await store.consume({ key: 'k3', cost: 1, limit: 5, windowMs: 100, now: 50 });

    // Verify non-expired buckets were preserved (counts increment, not reset)
    const r1 = await store.consume({ key: 'k1', cost: 1, limit: 5, windowMs: 100, now: 50 });
    const r2 = await store.consume({ key: 'k2', cost: 1, limit: 5, windowMs: 100, now: 50 });
    expect(r1.currentCount).toBe(2); // was 1, now 2 — bucket preserved
    expect(r2.currentCount).toBe(2); // was 1, now 2 — bucket preserved

    // Advance past expiry (window [0,100) expires at 100).
    // Adding k4 at now=150 triggers eviction: size=3 > maxKeys=2,
    // all three expired buckets (k1, k2, k3 with expiresAt=100) are removed.
    await store.consume({ key: 'k4', cost: 1, limit: 5, windowMs: 100, now: 150 });

    // k1's expired bucket was evicted. Consuming k1 at now=150 creates a
    // fresh bucket in the new window [100, 200) with count starting from 0.
    const r1Fresh = await store.consume({ key: 'k1', cost: 1, limit: 5, windowMs: 100, now: 150 });
    expect(r1Fresh.currentCount).toBe(1); // fresh bucket, not 3
    expect(r1Fresh.windowStart).toBe(100); // new window
    expect(r1Fresh.resetAt).toBe(200);
  });
});