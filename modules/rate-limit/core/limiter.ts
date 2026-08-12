import { createMemoryStore } from '../adapters/memory-store.js';
import { resolveCheckRateLimitInput, resolveRateLimitConfig } from './config.js';
import { RateLimitError } from './error.js';
import type { CheckRateLimitInput, RateLimitConfig, RateLimitResult, RateLimitStore } from './types.js';

export interface RateLimiter {
  check(input: CheckRateLimitInput): Promise<RateLimitResult>;
  checkOrThrow(input: CheckRateLimitInput): Promise<RateLimitResult>;
}

export function createRateLimiter(config?: RateLimitConfig): RateLimiter {
  const store = config?.store ?? createMemoryStore();
  const resolvedConfig = resolveRateLimitConfig(config);

  return {
    check(input: CheckRateLimitInput): Promise<RateLimitResult> {
      return checkRateLimit(input, store, config);
    },

    async checkOrThrow(input: CheckRateLimitInput): Promise<RateLimitResult> {
      const normalizedInput = resolveCheckRateLimitInput(input, config);
      const result = await checkRateLimit(input, store, config);

      if (!result.allowed && resolvedConfig.throwOnLimitExceeded) {
        throw new RateLimitError({
          key: normalizedInput.key,
          limit: normalizedInput.limit,
          windowMs: normalizedInput.windowMs,
          resetAt: result.resetAt,
          retryAfterMs: result.retryAfterMs,
        });
      }

      return result;
    },
  };
}

export async function checkRateLimit(
  input: CheckRateLimitInput,
  store?: RateLimitStore,
  config?: RateLimitConfig
): Promise<RateLimitResult> {
  const normalizedInput = resolveCheckRateLimitInput(input, config);
  const activeStore = store ?? config?.store ?? createMemoryStore();

  const consumeResult = await activeStore.consume(normalizedInput);
  const remaining = Math.max(0, normalizedInput.limit - consumeResult.currentCount);
  const retryAfterMs = consumeResult.allowed ? 0 : Math.max(0, consumeResult.resetAt - normalizedInput.now);

  return {
    allowed: consumeResult.allowed,
    remaining,
    resetAt: consumeResult.resetAt,
    retryAfterMs,
  };
}
