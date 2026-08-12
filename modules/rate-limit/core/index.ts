export { createRateLimiter, checkRateLimit } from './limiter.js';
export { RateLimitError, RateLimitConfigError } from './error.js';
export { createMemoryStore } from '../adapters/memory-store.js';
export type { ErrorShape } from './error.js';
export type { RateLimiter } from './limiter.js';
export type {
  CheckRateLimitInput,
  MemoryStoreOptions,
  RateLimitConfig,
  RateLimitResult,
  RateLimitStore,
  StoreConsumeParams,
  StoreConsumeResult,
} from './types.js';
