export type ErrorShape = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  requestId?: string;
  retryable: boolean;
};

export class RateLimitError extends Error implements ErrorShape {
  readonly code = 'RATE_LIMITED';
  readonly status = 429;
  readonly retryable = true;
  readonly key: string;
  readonly limit: number;
  readonly windowMs: number;
  readonly resetAt: number;
  readonly retryAfterMs: number;
  readonly details: Record<string, unknown>;

  constructor(options: {
    key: string;
    limit: number;
    windowMs: number;
    resetAt: number;
    retryAfterMs: number;
    message?: string;
  }) {
    super(
      options.message ??
        `Rate limit exceeded for key "${options.key}". Retry after ${options.retryAfterMs}ms.`
    );
    this.name = 'RateLimitError';
    this.key = options.key;
    this.limit = options.limit;
    this.windowMs = options.windowMs;
    this.resetAt = options.resetAt;
    this.retryAfterMs = options.retryAfterMs;
    this.details = {
      key: options.key,
      limit: options.limit,
      windowMs: options.windowMs,
      remaining: 0,
      resetAt: options.resetAt,
      retryAfterMs: options.retryAfterMs,
    };
  }
}

export class RateLimitConfigError extends Error {
  readonly code = 'RATE_LIMIT_INVALID_CONFIG';
  readonly retryable = false;

  constructor(message: string) {
    super(message);
    this.name = 'RateLimitConfigError';
  }
}
