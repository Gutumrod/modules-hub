export { checkRateLimit, createRateLimiter } from './core/limiter.js';
export { RateLimitConfigError, RateLimitError } from './core/error.js';
export { createMemoryStore } from './adapters/memory-store.js';
export type { ErrorShape } from './core/error.js';
export type { RateLimiter } from './core/limiter.js';
export type {
  CheckRateLimitInput,
  MemoryStoreOptions,
  RateLimitConfig,
  RateLimitResult,
  RateLimitStore,
  StoreConsumeParams,
  StoreConsumeResult,
} from './core/types.js';
