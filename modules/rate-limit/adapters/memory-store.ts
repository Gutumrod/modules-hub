import type { MemoryStoreOptions, RateLimitStore, StoreConsumeParams, StoreConsumeResult } from '../core/types.js';

type WindowBucket = {
  windowStart: number;
  count: number;
  expiresAt: number;
};

/**
 * Creates a single-process memory rate limit store.
 *
 * WARNING: MemoryRateLimitStore is NOT suitable for distributed production.
 * It keeps counters in one local Map only and does not sync across processes,
 * serverless instances, edge isolates, or clustered workers.
 */
export function createMemoryStore(options?: MemoryStoreOptions): RateLimitStore {
  return new MemoryRateLimitStore(options);
}

class MemoryRateLimitStore implements RateLimitStore {
  private readonly buckets = new Map<string, WindowBucket>();
  private readonly maxKeys: number;

  constructor(options?: MemoryStoreOptions) {
    this.maxKeys = options?.maxKeys ?? 10000;
  }

  async consume(params: StoreConsumeParams): Promise<StoreConsumeResult> {
    this.evictExpiredIfNeeded(params.now);

    const currentWindowStart = Math.floor(params.now / params.windowMs) * params.windowMs;
    let bucket = this.buckets.get(params.key);

    if (!bucket || params.now >= bucket.expiresAt || bucket.windowStart !== currentWindowStart) {
      bucket = {
        windowStart: currentWindowStart,
        count: 0,
        expiresAt: currentWindowStart + params.windowMs,
      };
      this.buckets.set(params.key, bucket);
    }

    if (bucket.count + params.cost <= params.limit) {
      bucket.count += params.cost;

      return {
        currentCount: bucket.count,
        windowStart: bucket.windowStart,
        resetAt: bucket.expiresAt,
        allowed: true,
      };
    }

    return {
      currentCount: bucket.count,
      windowStart: bucket.windowStart,
      resetAt: bucket.expiresAt,
      allowed: false,
    };
  }

  async reset(key?: string): Promise<void> {
    if (key === undefined) {
      this.buckets.clear();
      return;
    }

    this.buckets.delete(key);
  }

  private evictExpiredIfNeeded(now: number): void {
    if (this.buckets.size <= this.maxKeys) {
      return;
    }

    for (const [key, bucket] of this.buckets) {
      if (now >= bucket.expiresAt) {
        this.buckets.delete(key);
      }
    }
  }
}
