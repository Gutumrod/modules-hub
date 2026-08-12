import { describe, it, expect } from 'vitest';
import { calculateNextDelay, DEFAULT_RETRY_POLICY } from '../../core/policy.js';

describe('Retry Policy', () => {
  it('should calculate exponential backoff correctly', () => {
    const policy = { ...DEFAULT_RETRY_POLICY, initialDelayMs: 1000, backoffMultiplier: 2 };
    
    expect(calculateNextDelay(1, policy)).toBe(0);
    expect(calculateNextDelay(2, policy)).toBe(1000);
    expect(calculateNextDelay(3, policy)).toBe(2000);
    expect(calculateNextDelay(4, policy)).toBe(4000);
  });

  it('should respect maxDelayMs', () => {
    const policy = { ...DEFAULT_RETRY_POLICY, initialDelayMs: 1000, backoffMultiplier: 2, maxDelayMs: 5000 };
    
    expect(calculateNextDelay(5, policy)).toBe(5000);
  });
});
