import type { RetryPolicy } from './types.js';

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  backoffMultiplier: 2,
  maxDelayMs: 30000,
  timeoutMs: 60000 // 1 minute
};

/**
 * Calculates the delay for the next attempt based on the retry policy.
 */
export function calculateNextDelay(attempt: number, policy: RetryPolicy): number {
  if (attempt <= 1) return 0;
  
  const delay = policy.initialDelayMs * Math.pow(policy.backoffMultiplier, attempt - 2);
  return Math.min(delay, policy.maxDelayMs);
}

/**
 * Utility to wait for a specified duration.
 */
export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
