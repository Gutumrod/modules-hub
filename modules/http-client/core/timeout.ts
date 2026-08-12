import { HttpError } from './error.js';

export type TimeoutControl = {
  signal: AbortSignal;
  cleanup: () => void;
  getAbortCode: () => 'HTTP_TIMEOUT' | 'HTTP_ABORTED' | undefined;
};

export function createTimeoutControl(options: {
  timeoutMs: number;
  externalSignal?: AbortSignal;
}): TimeoutControl {
  const controller = new AbortController();
  let abortCode: 'HTTP_TIMEOUT' | 'HTTP_ABORTED' | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let externalAbortListener: (() => void) | undefined;

  const abortAs = (code: 'HTTP_TIMEOUT' | 'HTTP_ABORTED'): void => {
    if (!abortCode) {
      abortCode = code;
    }
    if (!controller.signal.aborted) {
      controller.abort();
    }
  };

  if (options.externalSignal?.aborted) {
    abortAs('HTTP_ABORTED');
  } else if (options.externalSignal) {
    externalAbortListener = () => abortAs('HTTP_ABORTED');
    options.externalSignal.addEventListener('abort', externalAbortListener, { once: true });
  }

  if (options.timeoutMs > 0) {
    timer = setTimeout(() => abortAs('HTTP_TIMEOUT'), options.timeoutMs);
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      if (timer) {
        clearTimeout(timer);
      }
      if (options.externalSignal && externalAbortListener) {
        options.externalSignal.removeEventListener('abort', externalAbortListener);
      }
    },
    getAbortCode: () => abortCode,
  };
}

export function normalizeAbortError(error: unknown, options: { url: string; method: string; code?: string }): HttpError {
  const code = options.code === 'HTTP_ABORTED' ? 'HTTP_ABORTED' : 'HTTP_TIMEOUT';
  return new HttpError({
    message: code === 'HTTP_ABORTED' ? 'HTTP request aborted.' : 'HTTP request timed out.',
    code,
    url: options.url,
    method: options.method,
    cause: error,
  });
}
