import { RateLimitConfigError } from './error.js';
import type { CheckRateLimitInput, RateLimitConfig } from './types.js';

export type ResolvedRateLimitConfig = {
  throwOnLimitExceeded: boolean;
};

export type ResolvedCheckRateLimitInput = {
  key: string;
  limit: number;
  windowMs: number;
  cost: number;
  now: number;
};

export function resolveRateLimitConfig(config?: RateLimitConfig): ResolvedRateLimitConfig {
  return {
    throwOnLimitExceeded: config?.throwOnLimitExceeded ?? true,
  };
}

export function resolveCheckRateLimitInput(
  input: CheckRateLimitInput,
  config?: RateLimitConfig
): ResolvedCheckRateLimitInput {
  const limit = input.limit ?? config?.defaultLimit;
  const windowMs = input.windowMs ?? config?.defaultWindowMs;
  const cost = input.cost ?? 1;
  const now = input.now ?? Date.now();

  assertValidKey(input.key);
  assertValidLimit(limit);
  assertValidWindowMs(windowMs);
  assertValidCost(cost);
  assertValidNow(now);

  return {
    key: input.key,
    limit,
    windowMs,
    cost,
    now,
  };
}

function assertValidKey(key: string): void {
  if (typeof key !== 'string' || key.trim().length === 0) {
    throw new RateLimitConfigError('Rate limit key must be a non-empty string.');
  }
}

function assertValidLimit(limit: unknown): asserts limit is number {
  if (!Number.isInteger(limit) || (limit as number) <= 0) {
    throw new RateLimitConfigError('Rate limit limit must be an integer greater than 0.');
  }
}

function assertValidWindowMs(windowMs: unknown): asserts windowMs is number {
  if (typeof windowMs !== 'number' || windowMs <= 0) {
    throw new RateLimitConfigError('Rate limit windowMs must be a number greater than 0.');
  }
}

function assertValidCost(cost: unknown): asserts cost is number {
  if (!Number.isInteger(cost) || (cost as number) < 1) {
    throw new RateLimitConfigError('Rate limit cost must be an integer greater than or equal to 1.');
  }
}

function assertValidNow(now: unknown): asserts now is number {
  if (typeof now !== 'number' || !Number.isFinite(now) || now <= 0) {
    throw new RateLimitConfigError('Rate limit now must be a finite number greater than 0.');
  }
}
