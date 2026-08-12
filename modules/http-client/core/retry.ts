import { HttpError } from './error.js';
import type { RetryPolicy } from './types.js';

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  initialDelayMs: 200,
  backoffMultiplier: 2.0,
  maxDelayMs: 5000,
  retryableStatusCodes: [408, 429, 500, 502, 503, 504],
  respectRetryAfter: true,
  maxRetryAfterMs: 10000,
  allowUnsafeRetries: false,
};

export function mergeRetryPolicy(base?: Partial<RetryPolicy>, override?: Partial<RetryPolicy>): RetryPolicy {
  return {
    ...DEFAULT_RETRY_POLICY,
    ...base,
    ...override,
    retryableStatusCodes: override?.retryableStatusCodes ?? base?.retryableStatusCodes ?? DEFAULT_RETRY_POLICY.retryableStatusCodes,
  };
}

export function canRetryMethod(method: string, policy: RetryPolicy): boolean {
  const normalized = method.toUpperCase();
  return normalized === 'GET' || normalized === 'HEAD' || normalized === 'OPTIONS' || policy.allowUnsafeRetries === true;
}

export function isRetryableStatus(status: number, policy: RetryPolicy): boolean {
  return policy.retryableStatusCodes.includes(status);
}

export function retryDelayMs(attemptIndex: number, policy: RetryPolicy, retryAfterHeader?: string): number {
  const exponential = Math.min(
    policy.initialDelayMs * policy.backoffMultiplier ** Math.max(0, attemptIndex - 1),
    policy.maxDelayMs
  );
  const retryAfter = policy.respectRetryAfter === false ? undefined : parseRetryAfterMs(retryAfterHeader);
  return retryAfter === undefined ? exponential : Math.max(retryAfter, exponential);
}

export function parseRetryAfterMs(value?: string): number | undefined {
  if (!value) {
    return undefined;
  }

  const seconds = Number(value);
  if (Number.isInteger(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  const parsedDate = Date.parse(value);
  if (!Number.isNaN(parsedDate)) {
    return Math.max(0, parsedDate - Date.now());
  }

  return undefined;
}

export function assertRetryAfterWithinLimit(options: {
  status: number;
  retryAfterHeader?: string;
  policy: RetryPolicy;
  url: string;
  method: string;
}): void {
  const retryAfter = options.policy.respectRetryAfter === false ? undefined : parseRetryAfterMs(options.retryAfterHeader);
  const maxRetryAfterMs = options.policy.maxRetryAfterMs ?? DEFAULT_RETRY_POLICY.maxRetryAfterMs;
  if (retryAfter !== undefined && maxRetryAfterMs !== undefined && retryAfter > maxRetryAfterMs) {
    throw new HttpError({
      message: `Retry-After exceeds maxRetryAfterMs (${maxRetryAfterMs}ms).`,
      code: options.status === 429 ? 'HTTP_RATE_LIMITED' : 'HTTP_SERVER_ERROR',
      status: options.status,
      retryable: true,
      url: options.url,
      method: options.method,
    });
  }
}

export function sleep(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('The operation was aborted.', 'AbortError'));
      },
      { once: true }
    );
  });
}
