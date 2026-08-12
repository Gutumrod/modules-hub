/** Input parameters for checking rate limit on a single key */
export type CheckRateLimitInput = {
  /** Host-created rate limit key (e.g. "ip:192.168.1.1", "user:usr_123:api_v1") */
  key: string;
  /** Maximum allowed requests/tokens within the window (must be positive integer > 0) */
  limit: number;
  /** Window duration in milliseconds (must be positive integer > 0) */
  windowMs: number;
  /** Optional cost per check/consumption (Default: 1, must be integer >= 1) */
  cost?: number;
  /** Optional clock override timestamp in ms for testing/deterministic timing (Default: Date.now()) */
  now?: number;
};

/** Normalized rate limit evaluation result returned to Host */
export type RateLimitResult = {
  /** Whether the request is permitted under the limit */
  allowed: boolean;
  /** Remaining capacity in the current window (>= 0) */
  remaining: number;
  /** Unix timestamp in milliseconds when the current window resets */
  resetAt: number;
  /** Time in milliseconds until the host can retry if blocked (0 if allowed) */
  retryAfterMs: number;
};

/** Host-injected Factory Configuration */
export type RateLimitConfig = {
  /** Storage adapter implementation (Default: Memory store instance) */
  store?: RateLimitStore;
  /** Default rate limit ceiling if omitted in individual checks */
  defaultLimit?: number;
  /** Default window duration in milliseconds if omitted in individual checks */
  defaultWindowMs?: number;
  /** Whether checkOrThrow throws RateLimitError on limit exceed (Default: true) */
  throwOnLimitExceeded?: boolean;
};

/** Parameters passed to RateLimitStore.consume() */
export type StoreConsumeParams = {
  /** Host-created rate limit key */
  key: string;
  /** Cost/tokens to consume */
  cost: number;
  /** Maximum allowed capacity */
  limit: number;
  /** Window duration in milliseconds */
  windowMs: number;
  /** Current Unix timestamp in milliseconds */
  now: number;
};

/** Result returned by RateLimitStore.consume() */
export type StoreConsumeResult = {
  /** Current accumulated count in the window after consumption */
  currentCount: number;
  /** Window start timestamp in milliseconds */
  windowStart: number;
  /** Window end / reset timestamp in milliseconds */
  resetAt: number;
  /** Whether consumption was successful within limit bounds */
  allowed: boolean;
};

/** Storage Adapter Contract Interface */
export interface RateLimitStore {
  /** Consume tokens/attempts for a key within a fixed window */
  consume(params: StoreConsumeParams): Promise<StoreConsumeResult>;
  /** Optional method to reset/clear a specific key or all keys */
  reset?(key?: string): Promise<void>;
}

/** Options for Memory Store creation */
export type MemoryStoreOptions = {
  /** Optional maximum number of keys stored before passive eviction (Default: 10000) */
  maxKeys?: number;
};
