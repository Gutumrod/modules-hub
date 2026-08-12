import type { HttpError } from './error.js';

/** Single HTTP Request configuration passed to request() */
export type HttpRequest = {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS' | string;
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  retry?: Partial<RetryPolicy>;
  signal?: AbortSignal;
  metadata?: Record<string, unknown>;
  responseType?: 'json' | 'text' | 'raw'; // Default: 'json'
};

/** Normalized HTTP Response contract returned to Host */
export type HttpResponse<T = unknown> = {
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  data?: T;
  requestId?: string;
};

/** Transport Abstraction Interface */
export interface HttpTransport {
  send(request: TransportRequest): Promise<TransportResponse>;
}

export type TransportRequest = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: unknown;
  signal?: AbortSignal;
};

export type TransportResponse = {
  status: number;
  headers: Record<string, string>;
  body: ReadableStream | ArrayBuffer | string | null;
  rawResponse?: unknown;
};

/** Fetch Transport Adapter options */
export type FetchTransportOptions = {
  /** Runtime fetch function injected by Host (defaults to globalThis.fetch) */
  fetch?: typeof globalThis.fetch;
};

/** Transient Retry Policy definition */
export type RetryPolicy = {
  /** Total maximum attempts including initial call (Default: 3) */
  maxAttempts: number;
  /** Initial backoff delay in ms (Default: 200) */
  initialDelayMs: number;
  /** Backoff exponential multiplier (Default: 2.0) */
  backoffMultiplier: number;
  /** Maximum backoff delay cap in ms (Default: 5000) */
  maxDelayMs: number;
  /** HTTP status codes eligible for retry (Default: [408, 429, 500, 502, 503, 504]) */
  retryableStatusCodes: number[];
  /** Whether to parse & observe Retry-After headers (Default: true) */
  respectRetryAfter?: boolean;
  /** Upper limit cap on Retry-After sleep duration in ms (Default: 10000) */
  maxRetryAfterMs?: number;
  /** Explicit opt-in required to retry non-idempotent methods (Default: false) */
  allowUnsafeRetries?: boolean;
};

/** URL Access & Security Policy */
export type UrlPolicy = {
  /** Allowed protocols (e.g. ['https:', 'http:']) */
  allowedProtocols?: string[];
  /** Allowed hostnames/domains */
  allowedHosts?: string[];
  /** Blocked hostnames/domains (e.g. ['localhost', '127.0.0.1', '169.254.169.254']) */
  blockedHosts?: string[];
};

/** Logging & Telemetry Hooks */
export type SanitizedRequestInfo = {
  url: string;
  method: string;
  headers: Record<string, string>;
  requestId?: string;
  metadata?: Record<string, unknown>;
};

export type SanitizedResponseInfo = {
  status: number;
  headers: Record<string, string>;
  requestId?: string;
  durationMs: number;
};

export type LoggingHooks = {
  onRequest?: (info: SanitizedRequestInfo) => void;
  onResponse?: (info: SanitizedResponseInfo) => void;
  onError?: (error: HttpError, info: SanitizedRequestInfo) => void;
};

/** HTTP Client Factory Configuration */
export type HttpClientConfig = {
  /** Transport implementation (Defaults to createFetchTransport()) */
  transport?: HttpTransport;
  /** Default client timeout in ms (Default: 10000ms / 10s) */
  defaultTimeoutMs?: number;
  /** Default client-wide retry policy override */
  defaultRetry?: Partial<RetryPolicy>;
  /** Optional URL policy validator */
  urlPolicy?: UrlPolicy;
  /** Additional header names to redact during logging & error creation */
  sensitiveHeaders?: string[];
  /** Optional logging hooks */
  hooks?: LoggingHooks;
};

export interface HttpClient {
  request<T = unknown>(request: HttpRequest): Promise<HttpResponse<T>>;
  get<T = unknown>(url: string, options?: Omit<HttpRequest, 'url' | 'method'>): Promise<HttpResponse<T>>;
  post<T = unknown>(
    url: string,
    body?: unknown,
    options?: Omit<HttpRequest, 'url' | 'method' | 'body'>
  ): Promise<HttpResponse<T>>;
  put<T = unknown>(
    url: string,
    body?: unknown,
    options?: Omit<HttpRequest, 'url' | 'method' | 'body'>
  ): Promise<HttpResponse<T>>;
  patch<T = unknown>(
    url: string,
    body?: unknown,
    options?: Omit<HttpRequest, 'url' | 'method' | 'body'>
  ): Promise<HttpResponse<T>>;
  delete<T = unknown>(url: string, options?: Omit<HttpRequest, 'url' | 'method'>): Promise<HttpResponse<T>>;
}
