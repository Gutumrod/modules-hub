import { describe, expect, it } from 'vitest';
import { createMemoryStore } from '../index.js';

describe('memory store smoke', () => {
  it('handles concurrent consume calls atomically per key', async () => {
    const store = createMemoryStore();
    const attempts = await Promise.all(
      Array.from({ length: 5 }, () =>
        store.consume({
          key: 'ip:1.1.1.1',
          cost: 1,
          limit: 3,
          windowMs: 1000,
          now: 100,
        })
      )
    );

    expect(attempts.filter((attempt) => attempt.allowed)).toHaveLength(3);
    expect(attempts.filter((attempt) => !attempt.allowed)).toHaveLength(2);
    expect(Math.max(...attempts.map((attempt) => attempt.currentCount))).toBe(3);
  });
});
