# HTTP Client Module — DESIGN.md

**Version:** 0.1.0 (P0, experimental)
**Status:** Design (Stage 1 — Architect). This file is the single source of truth for downstream agents (Stage 2 implementer, Stage 3 tester, Stage 4 reviewer).
**Language / runtime:** TypeScript, ES2022, strict mode, `moduleResolution: Bundler`. Must run on Cloudflare Workers (no `node:*` imports; Web APIs only).

---

## 1. Purpose

A reusable, adapter-based **HTTP Client module** for the Module Hub monorepo. It provides a robust, generic HTTP client featuring timeout management, exponential backoff retries, response parsing, secret header redaction, and standardized error normalization.

The architecture follows a strict layered design:

```
Host / Module Adapter
       ↓
HTTP Client Core
       ↓
HTTP Transport (Interface)
       ↓
fetch / runtime transport (FetchTransport adapter)
```

### Architectural Boundary

> **CRITICAL BOUNDARY:** The HTTP Client module is strictly responsible for **transient retries of a single HTTP request** (e.g. short retries over a few seconds for temporary network flakiness or rate limits). It MUST NOT become a background job or task queue system. Longer retry workflows, attempt tracking across process restarts, job lifecycle management, and background scheduling belong exclusively to the separate **Job/Retry module**.

### Host responsibilities vs module responsibilities

| Host does | Module does |
|---|---|
| Reads `process.env` / `env` / `globalThis` | Never touches env — receives configuration via `HttpClientConfig` |
| Injects the runtime `fetch` implementation | Interacts with transport strictly through the `HttpTransport` interface |
| Defines business URL policies (allowed/blocked hosts) | Enforces URL policies before sending requests |
| Configures custom sensitive headers & logging sinks | Redacts sensitive headers and passes sanitized data to logging hooks |
| Opts-in to retrying non-idempotent requests (POST/PATCH/DELETE) | Enforces idempotency rules — safe retries for GET/HEAD/OPTIONS by default |

---

## 2. Public API (exact signatures)

All public types and functions are exported from the module's entry point (`index.ts` and `core/index.ts`).

```ts
// core/client.ts
export function createHttpClient(config?: HttpClientConfig): HttpClient;

// HttpClient Interface
export interface HttpClient {
  request<T = unknown>(request: HttpRequest): Promise<HttpResponse<T>>;
  get<T = unknown>(url: string, options?: Omit<HttpRequest, 'url' | 'method'>): Promise<HttpResponse<T>>;
  post<T = unknown>(url: string, body?: unknown, options?: Omit<HttpRequest, 'url' | 'method' | 'body'>): Promise<HttpResponse<T>>;
  put<T = unknown>(url: string, body?: unknown, options?: Omit<HttpRequest, 'url' | 'method' | 'body'>): Promise<HttpResponse<T>>;
  patch<T = unknown>(url: string, body?: unknown, options?: Omit<HttpRequest, 'url' | 'method' | 'body'>): Promise<HttpResponse<T>>;
  delete<T = unknown>(url: string, options?: Omit<HttpRequest, 'url' | 'method'>): Promise<HttpResponse<T>>;
}

// adapters/fetch-transport.ts
export function createFetchTransport(options?: FetchTransportOptions): HttpTransport;
```

### 2.1 Pipeline Guarantee

Every convenience method (`get`, `post`, `put`, `patch`, `delete`) **MUST delegate directly** to `request()`. There are no secondary request paths; all URL validation, security redaction, timeout control, retry loops, response parsing, error normalization, and logging hooks run through the single `request()` pipeline.

---

## 3. Exact Core Types

```ts
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
```

---

## 4. Timeout & Cancellation Design

Every request processed by the client has an active timeout policy.

1. **Hierarchy:** Per-request `HttpRequest.timeoutMs` overrides `HttpClientConfig.defaultTimeoutMs` (default `10,000ms`). Setting `timeoutMs: 0` explicitly disables the timeout for that request.
2. **Cancellation Mechanics:**
   - The core instantiates an internal `AbortController`.
   - A timer (`setTimeout`) is scheduled for `timeoutMs`.
   - If the caller supplies an external `signal` (`HttpRequest.signal`), the core registers an `'abort'` event listener on the external signal to trigger the internal controller immediately.
3. **Normalization:**
   - If the internal timer fires before the response completes, the request is aborted and the core throws an `HttpError` with `code: 'HTTP_TIMEOUT'`.
   - If the user's external signal aborts, the core throws an `HttpError` with `code: 'HTTP_ABORTED'`.
   - DOMExceptions or runtime-specific abort errors (such as Node `AbortError` or browser `TimeoutError`) are caught and normalized into `HttpError`. Runtime exceptions MUST NOT leak.

---

## 5. Retry & Idempotency Safety Design

The retry mechanism handles transient failures across network transport and server errors.

### 5.1 Conservative Defaults
- `maxAttempts`: 3 (1 initial attempt + 2 retries).
- `initialDelayMs`: 200ms.
- `backoffMultiplier`: 2.0 (attempt 2 delays 200ms, attempt 3 delays 400ms).
- `maxDelayMs`: 5000ms.
- `retryableStatusCodes`: `[408, 429, 500, 502, 503, 504]`.
- Network-level transport failures (DNS resolution failure, socket reset, fetch rejection) are treated as retryable candidates.

### 5.2 Idempotency Rules
HTTP methods carry distinct semantics regarding retry safety:
- **Safe / Idempotent Methods:** `GET`, `HEAD`, `OPTIONS`. The client MAY automatically retry these methods according to the `RetryPolicy`.
- **Unsafe / Non-Idempotent Methods:** `POST`, `PUT`, `PATCH`, `DELETE`.
  - **DEFAULT BEHAVIOR:** If an unsafe request fails (even with status 500 or 503), the client **MUST NOT retry silently**.
  - **OPT-IN:** Unsafe methods will ONLY be retried if `retry.allowUnsafeRetries: true` is explicitly configured on the request or client config.

### 5.3 Attempt Limit & Failure
If all retry attempts are exhausted without obtaining a successful response, the pipeline throws `HttpError` with `code: 'HTTP_RETRY_EXHAUSTED'`, embedding the last encountered error or response status as cause.

---

## 6. Retry-After Handling with Upper Bound

When receiving an HTTP `429` (Rate Limited) or `503` (Service Unavailable) response, servers often return a `Retry-After` header.

1. **Header Formats:**
   - **Seconds integer:** e.g., `Retry-After: 5` -> 5,000ms delay.
   - **HTTP Date string:** e.g., `Retry-After: Wed, 21 Oct 2026 07:28:00 GMT` -> calculated as `Date.parse(date) - Date.now()`.
2. **Upper Bound Safety (`maxRetryAfterMs`):**
   - Default limit: `10,000ms` (10 seconds).
   - If `Retry-After` demands a delay **greater than `maxRetryAfterMs`**, the client MUST NOT sleep for the requested duration.
   - Instead, the client immediately aborts the retry cycle and throws an `HttpError` with code `HTTP_RATE_LIMITED` (for 429) or `HTTP_SERVER_ERROR` (for 503), preventing external servers from hanging host applications unbounded.
3. **Delay Calculation:**
   - If `Retry-After` delay is valid and <= `maxRetryAfterMs`, retry delay becomes `Math.max(retryAfterMs, calculatedExponentialBackoffMs)`.

---

## 7. Response Parsing

Response parsing is dictated by `HttpRequest.responseType` (defaults to `'json'`).

| `responseType` | Success Behavior | Edge Case Handling |
|---|---|---|
| `'json'` | Parses body with `JSON.parse()` into `data: T` | Status 204 or 0-byte empty body yields `data: undefined`. Invalid JSON syntax on 2xx throws `HTTP_INVALID_RESPONSE`. |
| `'text'` | Decodes body as UTF-8 string into `data: string` | Empty body yields `data: ""`. |
| `'raw'` | Returns raw `ArrayBuffer` or `ReadableStream` | Passed through directly from transport. |

### Non-2xx HTML Error Pages
If a server returns an HTML error page (e.g. status 500 returning `<!DOCTYPE html>...`) when `responseType` is `'json'`:
- The client MUST NOT throw `HTTP_INVALID_RESPONSE`.
- It MUST throw `HTTP_SERVER_ERROR` (or `HTTP_CLIENT_ERROR`), attaching the status code and truncated raw body text to the error object. `HTTP_INVALID_RESPONSE` is reserved exclusively for malformed 2xx payloads.

---

## 8. Structured Errors

All failures originating from the client throw an instance of `HttpError`.

```ts
export class HttpError extends Error {
  readonly code: HttpErrorCode;
  readonly status?: number;
  readonly retryable: boolean;
  readonly requestId?: string;
  readonly providerRequestId?: string;
  readonly url: string;
  readonly method: string;
  readonly cause?: unknown;

  constructor(options: {
    message: string;
    code: HttpErrorCode;
    status?: number;
    retryable?: boolean;
    requestId?: string;
    providerRequestId?: string;
    url: string;
    method: string;
    cause?: unknown;
  });
}

export type HttpErrorCode =
  | 'HTTP_TIMEOUT'
  | 'HTTP_NETWORK_ERROR'
  | 'HTTP_INVALID_RESPONSE'
  | 'HTTP_CLIENT_ERROR'
  | 'HTTP_SERVER_ERROR'
  | 'HTTP_RATE_LIMITED'
  | 'HTTP_ABORTED'
  | 'HTTP_RETRY_EXHAUSTED'
  | 'HTTP_INVALID_URL';
```

### Error Codes & Semantics

| Code | Description / Trigger Condition | Default `retryable` |
|---|---|---|
| `HTTP_TIMEOUT` | Request timed out before completion | `true` |
| `HTTP_NETWORK_ERROR` | Low-level network or socket failure (DNS failure, connection refused) | `true` |
| `HTTP_INVALID_RESPONSE` | Invalid JSON syntax encountered on a 2xx response | `false` |
| `HTTP_CLIENT_ERROR` | Status 4xx (excluding 408 & 429) | `false` |
| `HTTP_SERVER_ERROR` | Status 5xx (500, 502, 503, 504) | `true` (if status in retryable list) |
| `HTTP_RATE_LIMITED` | Status 429 Too Many Requests | `true` |
| `HTTP_ABORTED` | Explicitly cancelled via user `AbortSignal` | `false` |
| `HTTP_RETRY_EXHAUSTED` | Max retry attempts reached without success | `false` |
| `HTTP_INVALID_URL` | Request URL failed URL validation or Host URL policy | `false` |

### Provider Request ID Extraction
The core inspects response headers case-insensitively to extract `providerRequestId` from common headers:
`x-request-id`, `x-correlation-id`, `cf-ray`, `x-amzn-requestid`, `x-github-request-id`.

---

## 9. Security Requirements

1. **Header Redaction:**
   - Standard redacted headers: `Authorization`, `Cookie`, `Set-Cookie`, `X-API-Key`, `Proxy-Authorization`.
   - Host can register additional header names via `HttpClientConfig.sensitiveHeaders`.
   - Header lookup during redaction is **case-insensitive**.
   - Redacted header values are strictly replaced with `"[REDACTED]"`.
2. **No Secret Logging:**
   - Logging hooks (`onRequest`, `onResponse`, `onError`) receive sanitized header dictionaries.
   - Request bodies, raw cookies, authorization tokens, and sensitive URL query parameters (e.g. `?token=`, `?key=`, `?secret=`) MUST NEVER be written to stdout or un-sanitized logs by default.
3. **No Direct Environment Access:**
   - The module MUST NOT read `process.env`, `env`, or `globalThis.process.env`. All configuration is passed explicitly by the Host.
4. **Cloudflare Workers Compatibility:**
   - Zero Node built-in imports (`node:http`, `node:https`, `node:buffer`, `node:stream`).
   - Uses Web APIs exclusively (`fetch`, `Headers`, `Request`, `Response`, `AbortController`, `ReadableStream`, `ArrayBuffer`).
5. **Prototype Pollution Safety:**
   - All copied objects, header maps, and sanitized metadata objects must be instantiated via clean copies (`Object.assign(Object.create(null), ...)` or shallow clean object literals) to prevent prototype pollution.
6. **Host URL Policy Enforcement:**
   - Before dispatching any request, the URL is parsed via `new URL(url)`.
   - Checks `urlPolicy.allowedProtocols` (e.g., rejecting `file:`, `ftp:`), `urlPolicy.allowedHosts`, and `urlPolicy.blockedHosts` (e.g., SSRF protection blocking `169.254.169.254` or `localhost` if configured). Violation throws `HTTP_INVALID_URL`.

---

## 10. Logging Hooks

The module provides optional telemetry hooks without coupling to a specific logging framework:

- `onRequest(info: SanitizedRequestInfo)`: Invoked before transport dispatch.
- `onResponse(info: SanitizedResponseInfo)`: Invoked after receiving a response.
- `onError(error: HttpError, info: SanitizedRequestInfo)`: Invoked on request failure.

### Hook Safety Guarantee
All calls to user-supplied logging hooks are wrapped in `try { ... } catch {}`. An exception inside a logging hook MUST NEVER crash or interrupt the HTTP request execution flow.

---

## 11. File Structure

The module directory layout strictly follows the Module Hub monorepo standard:

```
modules/http-client/
├── MODULE.md
├── VERSION
├── package.json
├── tsconfig.json
├── index.ts
├── core/
│   ├── index.ts
│   ├── client.ts
│   ├── types.ts
│   ├── error.ts
│   ├── pipeline.ts
│   ├── retry.ts
│   ├── timeout.ts
│   ├── parsing.ts
│   └── security.ts
├── adapters/
│   ├── index.ts
│   └── fetch-transport.ts
├── tests/
│   └── http.test.ts
├── vitest.config.ts
└── examples/
    └── integration.example.ts
```

> **Note (as implemented):** this section originally specified a split `tests/unit/*.test.ts` +
> `tests/adapters/*.test.ts` layout for Stage 3. The Stage 3 tester instead delivered all 157
> tests in a single `tests/http.test.ts` file (20 `describe` blocks covering every unit listed
> below plus pipeline edge cases). Verified against the actual file tree — no `tests/unit/` or
> `tests/adapters/` directory exists in the module.

---

## 12. Test Requirements (for Stage 3 Tester)

The test suite must be implemented using `vitest` in `tests/`. Downstream agents MUST verify every enumerated test case:

| Test File | Test Case Name | Assertion / Expected Outcome |
|---|---|---|
| `client.test.ts` | `GET success` | Resolves `HttpResponse` with status 200, ok true, parsed JSON data. |
| `client.test.ts` | `POST success` | Sends JSON body, resolves status 201 with response data. |
| `parsing.test.ts` | `JSON response` | Correctly parses JSON object and array payloads. |
| `parsing.test.ts` | `Text response` | Returns raw string when `responseType: 'text'`. |
| `parsing.test.ts` | `Empty response` | Status 204 or 0-byte body returns `data: undefined`. |
| `parsing.test.ts` | `Invalid JSON` | Status 200 with invalid JSON body throws `HTTP_INVALID_RESPONSE`. |
| `timeout.test.ts` | `Timeout trigger` | Request exceeding `timeoutMs` aborts and throws `HTTP_TIMEOUT`. |
| `timeout.test.ts` | `Manual abort` | Triggering user `AbortSignal` aborts and throws `HTTP_ABORTED`. |
| `client.test.ts` | `Network failure` | Transport rejection maps to `HTTP_NETWORK_ERROR`. |
| `retry.test.ts` | `500 Retry then success` | First attempt 500, second attempt 200 -> Resolves successfully. |
| `retry.test.ts` | `Retry exhausted` | Retries 3 times on 500 -> Throws `HTTP_RETRY_EXHAUSTED`. |
| `retry.test.ts` | `429 Handling` | Status 429 triggers retry according to policy. |
| `retry.test.ts` | `Retry-After respect` | Delays retry based on `Retry-After` header value within upper bound. |
| `retry.test.ts` | `Retry-After upper bound` | `Retry-After` exceeding `maxRetryAfterMs` aborts retry immediately. |
| `retry.test.ts` | `Non-idempotent unsafe default` | POST returning 500 is NOT retried by default. |
| `retry.test.ts` | `Custom retry opt-in` | POST with `allowUnsafeRetries: true` IS retried on 500. |
| `security.test.ts` | `Secret header redaction` | `Authorization` and `X-API-Key` headers are replaced with `"[REDACTED]"` in errors & hooks. |
| `security.test.ts` | `URL Policy enforcement` | Disallowed protocol or blocked host throws `HTTP_INVALID_URL`. |
| `fetch-transport.test.ts` | `Transport error normalization` | Injected fetch throw is caught and normalized into transport error. |

---

## 13. `integration.example.ts` Reference Shape

```ts
import { createHttpClient, createFetchTransport, HttpError } from '../index.js';

// Host injects runtime fetch and configuration
const transport = createFetchTransport({ fetch: globalThis.fetch });

const client = createHttpClient({
  transport,
  defaultTimeoutMs: 5000,
  urlPolicy: {
    allowedProtocols: ['https:'],
    blockedHosts: ['localhost', '127.0.0.1'],
  },
  sensitiveHeaders: ['X-Custom-Auth-Token'],
  hooks: {
    onRequest: (info) => console.log(`[HTTP Outgoing] ${info.method} ${info.url}`),
    onResponse: (info) => console.log(`[HTTP Response] ${info.status} (${info.durationMs}ms)`),
    onError: (err) => console.error(`[HTTP Error] ${err.code}: ${err.message}`),
  },
});

async function run() {
  try {
    // 1. GET Request
    const getRes = await client.get<{ id: string }>('https://api.example.com/items/1');
    console.log('Fetched Item:', getRes.data?.id);

    // 2. POST Request with custom retry opt-in
    const postRes = await client.post<{ success: boolean }>(
      'https://api.example.com/items',
      { name: 'New Item' },
      {
        retry: {
          allowUnsafeRetries: true,
          maxAttempts: 2,
        },
      }
    );
    console.log('Created:', postRes.data?.success);
  } catch (error) {
    if (error instanceof HttpError) {
      console.error('HTTP Client Error Code:', error.code, 'Status:', error.status);
    }
  }
}

run();
```

---

## 14. `package.json` and `tsconfig.json`

### `package.json`
```json
{
  "name": "@module-hub/http-client",
  "version": "0.1.0",
  "type": "module",
  "main": "./index.ts",
  "exports": {
    ".": "./index.ts"
  },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.6.3",
    "vitest": "^2.1.4"
  }
}
```

### `tsconfig.json`
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "skipLibCheck": true,
    "noImplicitOverride": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  },
  "include": ["**/*.ts"]
}
```

---

## 15. Explicit Non-Goals

The following features are **explicitly out of scope** for v0.1.0 of the HTTP Client module:

- **Browser caching / HTTP cache / CDN storage:** No `Cache-Control` header caching engine.
- **API Authentication Framework:** No built-in OAuth2 flow, JWT refreshing, or AWS SigV4 signing.
- **Circuit Breaker:** Circuit breaking state machines are deferred to future versions.
- **Service Discovery & Dynamic Load Balancing:** No DNS round-robin or Consul integration.
- **GraphQL Client:** No GraphQL query builders or AST parsing.
- **WebSocket / Server-Sent Events (SSE):** Strictly request/response HTTP.
- **Background Job Queue / Attempt Persistence:** Handled exclusively by the `Job/Retry` module.
- **Distributed Rate Limit Storage:** Handled exclusively by the `Rate Limit` module.

---

## 16. Acceptance Criteria (for Stage 4 Reviewer)

A Stage 4 Reviewer MUST verify all of the following criteria before approving the module:

1. [ ] **File Location:** Deliverable exists at `D:\AI-Workspace\projects\modules-hub\modules\http-client\DESIGN.md`.
2. [ ] **Runtime Independence:** Core code has zero global `fetch` calls and zero `node:*` imports.
3. [ ] **Transport Abstraction:** `HttpTransport` interface is strictly enforced, and `createFetchTransport` receives `fetch` from the Host.
4. [ ] **Single Pipeline:** All convenience methods (`get`, `post`, `put`, `patch`, `delete`) execute through `request()`.
5. [ ] **Timeout & Cancellation:** Supports per-request & default client timeouts, manual `AbortSignal`, and maps aborts to normalized `HTTP_TIMEOUT` / `HTTP_ABORTED`.
6. [ ] **Idempotency Safety:** Safe methods (`GET`, `HEAD`, `OPTIONS`) retry automatically; unsafe methods (`POST`, `PUT`, `PATCH`, `DELETE`) require `allowUnsafeRetries: true`.
7. [ ] **Retry-After Upper Bound:** `Retry-After` header is respected up to `maxRetryAfterMs` (10s limit).
8. [ ] **Error Normalization:** All 9 required error codes (`HTTP_TIMEOUT`, `HTTP_NETWORK_ERROR`, `HTTP_INVALID_RESPONSE`, `HTTP_CLIENT_ERROR`, `HTTP_SERVER_ERROR`, `HTTP_RATE_LIMITED`, `HTTP_ABORTED`, `HTTP_RETRY_EXHAUSTED`, `HTTP_INVALID_URL`) are implemented.
9. [ ] **Security & Redaction:** Sensitive headers (`Authorization`, `Cookie`, `Set-Cookie`, `X-API-Key`, `Proxy-Authorization`, plus custom) are redacted to `"[REDACTED]"` in errors and logging hooks.
10. [ ] **Test Suite Passing:** All 17 enumerated test cases pass cleanly with `vitest`.
