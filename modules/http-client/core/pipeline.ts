import { HttpError } from './error.js';
import { errorBodyText, parseResponseData } from './parsing.js';
import {
  assertRetryAfterWithinLimit,
  canRetryMethod,
  isRetryableStatus,
  mergeRetryPolicy,
  retryDelayMs,
  sleep,
} from './retry.js';
import { cleanRecord, extractProviderRequestId, redactHeaders, validateUrlPolicy } from './security.js';
import { createTimeoutControl, normalizeAbortError } from './timeout.js';
import type { HttpClientConfig, HttpRequest, HttpResponse, SanitizedRequestInfo, TransportResponse } from './types.js';

const DEFAULT_TIMEOUT_MS = 10000;

export async function executeRequest<T = unknown>(
  request: HttpRequest,
  config: Required<Pick<HttpClientConfig, 'transport'>> & Omit<HttpClientConfig, 'transport'>
): Promise<HttpResponse<T>> {
  validateUrlPolicy(request.url, config.urlPolicy, request.method);

  const headers = cleanRecord(request.headers);
  const method = request.method.toUpperCase();
  const retryPolicy = mergeRetryPolicy(config.defaultRetry, request.retry);
  const timeoutMs = request.timeoutMs ?? config.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  const sanitizedRequest = createSanitizedRequestInfo(request, headers, config.sensitiveHeaders);

  callHook(() => config.hooks?.onRequest?.(sanitizedRequest));

  const startedAt = Date.now();
  let lastError: unknown;
  let lastStatus: number | undefined;
  const maxAttempts = canRetryMethod(method, retryPolicy) ? Math.max(1, retryPolicy.maxAttempts) : 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const timeout = createTimeoutControl({
      timeoutMs,
      externalSignal: request.signal,
    });

    try {
      const response = await config.transport.send({
        url: request.url,
        method,
        headers,
        body: request.body,
        signal: timeout.signal,
      });
      timeout.cleanup();
      lastStatus = response.status;

      if (response.status >= 200 && response.status < 300) {
        const data = await parseResponseData<T>(response, { url: request.url, method, responseType: request.responseType });
        const providerRequestId = extractProviderRequestId(response.headers);
        callHook(() =>
          config.hooks?.onResponse?.({
            status: response.status,
            headers: redactHeaders(response.headers, config.sensitiveHeaders),
            requestId: providerRequestId,
            durationMs: Date.now() - startedAt,
          })
        );
        return {
          status: response.status,
          ok: true,
          headers: cleanRecord(response.headers),
          data,
          requestId: providerRequestId,
        };
      }

      const statusError = await createStatusError(response, request.url, method, retryPolicy.retryableStatusCodes.includes(response.status));
      lastError = statusError;

      if (!shouldRetryStatus(response, retryPolicy, attempt, maxAttempts)) {
        throw statusError;
      }

      assertRetryAfterWithinLimit({
        status: response.status,
        retryAfterHeader: getHeader(response.headers, 'retry-after'),
        policy: retryPolicy,
        url: request.url,
        method,
      });
      await sleep(retryDelayMs(attempt, retryPolicy, getHeader(response.headers, 'retry-after')), timeout.signal);
    } catch (error) {
      timeout.cleanup();
      const normalized = normalizeError(error, request.url, method, timeout.getAbortCode());
      lastError = normalized;

      if (normalized.code === 'HTTP_ABORTED' || normalized.code === 'HTTP_INVALID_RESPONSE') {
        callHook(() => config.hooks?.onError?.(normalized, sanitizedRequest));
        throw normalized;
      }

      if (!normalized.retryable || attempt >= maxAttempts) {
        const finalError =
          attempt >= maxAttempts && normalized.retryable
            ? new HttpError({
                message: 'HTTP retry attempts exhausted.',
                code: 'HTTP_RETRY_EXHAUSTED',
                status: normalized.status ?? lastStatus,
                url: request.url,
                method,
                cause: normalized,
              })
            : normalized;
        callHook(() => config.hooks?.onError?.(finalError, sanitizedRequest));
        throw finalError;
      }

      await sleep(retryDelayMs(attempt, retryPolicy), timeout.signal).catch((sleepError: unknown) => {
        throw normalizeAbortError(sleepError, { url: request.url, method, code: timeout.getAbortCode() });
      });
    }
  }

  const exhausted = new HttpError({
    message: 'HTTP retry attempts exhausted.',
    code: 'HTTP_RETRY_EXHAUSTED',
    status: lastStatus,
    url: request.url,
    method,
    cause: lastError,
  });
  callHook(() => config.hooks?.onError?.(exhausted, sanitizedRequest));
  throw exhausted;
}

async function createStatusError(
  response: TransportResponse,
  url: string,
  method: string,
  retryable: boolean
): Promise<HttpError> {
  const providerRequestId = extractProviderRequestId(response.headers);
  const body = await errorBodyText(response);
  const message = body ? `HTTP request failed with status ${response.status}: ${body}` : `HTTP request failed with status ${response.status}.`;
  const code = response.status === 429 ? 'HTTP_RATE_LIMITED' : response.status >= 500 ? 'HTTP_SERVER_ERROR' : 'HTTP_CLIENT_ERROR';

  return new HttpError({
    message,
    code,
    status: response.status,
    retryable,
    providerRequestId,
    url,
    method,
  });
}

function normalizeError(
  error: unknown,
  url: string,
  method: string,
  abortCode: 'HTTP_TIMEOUT' | 'HTTP_ABORTED' | undefined
): HttpError {
  if (error instanceof HttpError) {
    return error;
  }

  if (abortCode || isAbortLike(error)) {
    return normalizeAbortError(error, { url, method, code: abortCode });
  }

  return new HttpError({
    message: 'HTTP network transport failed.',
    code: 'HTTP_NETWORK_ERROR',
    url,
    method,
    cause: error,
  });
}

function shouldRetryStatus(response: TransportResponse, policy: ReturnType<typeof mergeRetryPolicy>, attempt: number, maxAttempts: number): boolean {
  return attempt < maxAttempts && isRetryableStatus(response.status, policy);
}

function createSanitizedRequestInfo(
  request: HttpRequest,
  headers: Record<string, string>,
  sensitiveHeaders?: string[]
): SanitizedRequestInfo {
  return {
    url: request.url,
    method: request.method.toUpperCase(),
    headers: redactHeaders(headers, sensitiveHeaders),
    metadata: cleanRecord(request.metadata),
  };
}

function getHeader(headers: Record<string, string>, name: string): string | undefined {
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === name.toLowerCase()) {
      return value;
    }
  }
  return undefined;
}

function isAbortLike(error: unknown): boolean {
  return error instanceof DOMException && (error.name === 'AbortError' || error.name === 'TimeoutError');
}

function callHook(callback: () => void): void {
  try {
    callback();
  } catch {
  }
}
