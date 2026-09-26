# HTTP Client Module

**Version:** 0.1.0 (P0, experimental)
**Status:** Reusable embedded module — core + adapters implemented and verified: 157/157 tests
passing (`tests/http.test.ts`), `tsc --noEmit` clean. See "Known limitations" below for two
unfixed edge-case bugs found during Stage 3 testing.

## Architecture

This module is a **reusable embedded module** — not a standalone service or framework.
A Host project that needs a robust, generic HTTP client embeds this module into its own
codebase and wires it up by injecting configuration and a runtime fetch implementation.

The module has one job: accept an `HttpClientConfig` that the Host constructs → validate
the URL against any configured policy → execute the request through the injected transport
→ apply timeout control, exponential backoff retry, and response parsing → return a typed
`HttpResponse<T>` or throw a structured `HttpError`.

```
Host / Module Adapter
       ↓
HTTP Client Core   (pipeline, retry, timeout, parsing, security)
       ↓
HttpTransport interface
       ↓
fetch / runtime transport   (FetchTransport adapter)
```

### Architectural boundary

> **CRITICAL BOUNDARY:** The HTTP Client module is strictly responsible for **transient
> retries of a single HTTP request** — short retry loops over a few seconds for temporary
> network flakiness or rate limits. It MUST NOT become a background job or task queue.
> Longer retry workflows, attempt tracking across process restarts, job lifecycle management,
> and background scheduling belong exclusively to the separate **Job/Retry module**.

The module **never** reads env (`process.env` / `env` / `globalThis`). The Host reads its
own env and injects the transport + config via `createHttpClient(config)`.

### Host vs. module responsibilities

| Host must do | Module does |
|---|---|
| Read env / secrets (API keys, base URLs, timeouts) | Never touches env — receives all configuration via `HttpClientConfig` |
| Inject the runtime `fetch` implementation via `createFetchTransport` | Interacts with transport strictly through the `HttpTransport` interface |
| Define business URL policies (allowed/blocked hosts, protocols) | Enforces URL policies before dispatching any request |
| Configure custom sensitive header names and logging sinks | Redacts sensitive headers and passes sanitized data to logging hooks |
| Opt-in to retrying non-idempotent requests (`POST`/`PUT`/`PATCH`/`DELETE`) | Enforces idempotency rules — safe retries for `GET`/`HEAD`/`OPTIONS` by default |

## Public API

All exports come from the module entry point `index.ts`. Do not import from sub-files directly.

```ts
import {
  createHttpClient,
  createFetchTransport,
  HttpError,
} from './index.js';
import type {
  HttpClient,
  HttpClientConfig,
  HttpRequest,
  HttpResponse,
  HttpTransport,
  HttpErrorCode,
  FetchTransportOptions,
  LoggingHooks,
  RetryPolicy,
  SanitizedRequestInfo,
  SanitizedResponseInfo,
  TransportRequest,
  TransportResponse,
  UrlPolicy,
} from './index.js';
```

### `createHttpClient(config?: HttpClientConfig): HttpClient`

Returns an `HttpClient` bound to the given config. Config is optional; if omitted, defaults
apply (fetch transport backed by `globalThis.fetch`, 10 s timeout, 3-attempt retry policy).

### `createFetchTransport(options?: FetchTransportOptions): HttpTransport`

Returns an `HttpTransport` backed by the Web Fetch API. The Host injects the runtime fetch
implementation via `options.fetch`; if omitted, defaults to `globalThis.fetch`.

Non-string, non-`ArrayBuffer`, non-`Blob` bodies are serialized to JSON automatically, and
`Content-Type: application/json` is set unless the caller already provided that header.

### `HttpClient` methods

Every convenience method delegates directly to `request()`. There are no secondary request
paths — all URL validation, security redaction, timeout control, retry loops, response
parsing, error normalization, and logging hooks run through the single pipeline.

```ts
interface HttpClient {
  request<T = unknown>(request: HttpRequest): Promise<HttpResponse<T>>;
  get<T = unknown>(url: string, options?: Omit<HttpRequest, 'url' | 'method'>): Promise<HttpResponse<T>>;
  post<T = unknown>(url: string, body?: unknown, options?: Omit<HttpRequest, 'url' | 'method' | 'body'>): Promise<HttpResponse<T>>;
  put<T = unknown>(url: string, body?: unknown, options?: Omit<HttpRequest, 'url' | 'method' | 'body'>): Promise<HttpResponse<T>>;
  patch<T = unknown>(url: string, body?: unknown, options?: Omit<HttpRequest, 'url' | 'method' | 'body'>): Promise<HttpResponse<T>>;
  delete<T = unknown>(url: string, options?: Omit<HttpRequest, 'url' | 'method'>): Promise<HttpResponse<T>>;
}
```

**Pipeline guarantee:** `get`, `post`, `put`, `patch`, and `delete` each call
`client.request()` with the method and body set, forwarding all other options unchanged.
There is exactly one request execution path.

## Config contract

### `HttpClientConfig`

```ts
type HttpClientConfig = {
  transport?: HttpTransport;
  defaultTimeoutMs?: number;
  defaultRetry?: Partial<RetryPolicy>;
  urlPolicy?: UrlPolicy;
  sensitiveHeaders?: string[];
  hooks?: LoggingHooks;
};
```

| Field | Default | Description |
|---|---|---|
| `transport` | `createFetchTransport()` | Transport implementation. Inject `createFetchTransport({ fetch: globalThis.fetch })` from the Host in production. |
| `defaultTimeoutMs` | `10000` (10 s) | Default per-request timeout in ms. `0` disables timeout. Per-request `timeoutMs` overrides this value. |
| `defaultRetry` | `DEFAULT_RETRY_POLICY` | Client-wide retry policy base. Per-request `retry` fields override individual fields on top of this. |
| `urlPolicy` | `undefined` (no restrictions) | Protocol allowlist, host allowlist/blocklist. Violations throw `HTTP_INVALID_URL` synchronously before any network I/O. |
| `sensitiveHeaders` | `[]` | Additional header names to redact (case-insensitive) in logging hooks and errors, merged with the built-in list. |
| `hooks` | `undefined` | Optional logging/telemetry hooks. Hook exceptions are silently swallowed and never affect the request outcome. |

### `UrlPolicy`

```ts
type UrlPolicy = {
  allowedProtocols?: string[];   // e.g. ['https:']
  allowedHosts?: string[];       // exact hostname allowlist
  blockedHosts?: string[];       // exact hostname blocklist — use for SSRF protection
};
```

Host-enforced. Configure `blockedHosts` to prevent SSRF against internal addresses such as
`localhost`, `127.0.0.1`, and `169.254.169.254`.

## Request and response

### `HttpRequest`

```ts
type HttpRequest = {
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
```

`metadata` is forwarded to `onRequest` hooks for tracing correlation (e.g. trace IDs,
request names). It is never serialized or sent over the wire.

### `HttpResponse<T>`

```ts
type HttpResponse<T = unknown> = {
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  data?: T;
  requestId?: string;
};
```

`requestId` is the provider request ID extracted from well-known response headers
(see the Security section). `ok` is `true` for 2xx status codes.

## Retry policy

### `RetryPolicy`

```ts
type RetryPolicy = {
  maxAttempts: number;
  initialDelayMs: number;
  backoffMultiplier: number;
  maxDelayMs: number;
  retryableStatusCodes: number[];
  respectRetryAfter?: boolean;
  maxRetryAfterMs?: number;
  allowUnsafeRetries?: boolean;
};
```

### Conservative defaults

| Field | Default | Description |
|---|---|---|
| `maxAttempts` | `3` | Total attempts including the initial call (1 initial + 2 retries). |
| `initialDelayMs` | `200` | First retry delay in ms. |
| `backoffMultiplier` | `2.0` | Exponential factor: delay doubles each attempt (200 ms → 400 ms). |
| `maxDelayMs` | `5000` | Hard cap on computed backoff delay regardless of multiplier. |
| `retryableStatusCodes` | `[408, 429, 500, 502, 503, 504]` | HTTP status codes that trigger a retry attempt. |
| `respectRetryAfter` | `true` | Parse and observe `Retry-After` response headers. |
| `maxRetryAfterMs` | `10000` (10 s) | Upper bound on `Retry-After` sleep. Exceeding this cap throws immediately rather than sleeping. |
| `allowUnsafeRetries` | `false` | Must be explicitly `true` to retry `POST`, `PUT`, `PATCH`, or `DELETE`. |

Per-request `retry` fields are merged on top of `defaultRetry`, which is merged on top of
`DEFAULT_RETRY_POLICY`. Only the fields you specify are overridden; the rest keep their defaults.

### Idempotency rules

- **Safe methods** (`GET`, `HEAD`, `OPTIONS`): retried automatically according to the active policy.
- **Unsafe methods** (`POST`, `PUT`, `PATCH`, `DELETE`): NEVER retried unless
  `allowUnsafeRetries: true` is set on the per-request `retry` option or in `defaultRetry`.
  Omitting this flag on an unsafe method forces exactly one attempt regardless of `maxAttempts`.

### Retry-After handling

When the server returns a `Retry-After` header (integer seconds or HTTP-date string):

- The effective delay for that attempt becomes `Math.max(retryAfterMs, computedExponentialBackoffMs)`.
- If the parsed `Retry-After` delay exceeds `maxRetryAfterMs` (default 10 s), the module
  throws `HTTP_RATE_LIMITED` (for status 429) or `HTTP_SERVER_ERROR` (for status 503)
  immediately, preventing an external server from stalling the host application for an
  unbounded duration.

## Timeout and cancellation

Per-request `timeoutMs` takes precedence over `HttpClientConfig.defaultTimeoutMs` (10 s).
Setting `timeoutMs: 0` explicitly disables the timeout for that request.

A caller-supplied `AbortSignal` may be passed via `HttpRequest.signal`. If it fires before
the response completes, the request is cancelled immediately.

| Condition | Error code |
|---|---|
| Internal timer fires (deadline exceeded) | `HTTP_TIMEOUT` |
| Caller's `AbortSignal` fired before completion | `HTTP_ABORTED` |

Both conditions are normalized into `HttpError` before reaching the caller. Raw
`DOMException` instances and runtime-specific abort errors never escape the pipeline.

## Response parsing

`responseType` (default `'json'`) controls how the response body is decoded into `data`.

| `responseType` | Success behavior | Edge cases |
|---|---|---|
| `'json'` | `JSON.parse(body)` into `data: T` | Status 204 or empty body → `data: undefined`. Invalid JSON on a 2xx response → throws `HTTP_INVALID_RESPONSE`. |
| `'text'` | UTF-8 decoded string into `data: string` | Empty body → `data: ""`. |
| `'raw'` | Raw `ReadableStream \| ArrayBuffer \| string \| null` passed through from transport | No decoding performed. |

**Non-2xx error pages:** If a server returns an HTML error page (e.g. status 500 with
`<!DOCTYPE html>…`) when `responseType` is `'json'`, the module throws `HTTP_SERVER_ERROR`
(or `HTTP_CLIENT_ERROR` for 4xx), not `HTTP_INVALID_RESPONSE`. `HTTP_INVALID_RESPONSE` is
reserved exclusively for malformed payloads on 2xx responses.

**Error body capture:** For non-2xx responses the response body is read and truncated to
2048 bytes, then embedded in the `HttpError` message for diagnostics.

## Structured errors

All failures throw an instance of `HttpError`. The module never returns error objects for
request failures — every failure path throws.

```ts
class HttpError extends Error {
  readonly code: HttpErrorCode;
  readonly status?: number;
  readonly retryable: boolean;
  readonly requestId?: string;
  readonly providerRequestId?: string;
  readonly url: string;
  readonly method: string;
  readonly cause?: unknown;
}
```

### Error codes

| Code | Trigger | Default `retryable` |
|---|---|---|
| `HTTP_TIMEOUT` | Request deadline exceeded before a response was received | `true` |
| `HTTP_NETWORK_ERROR` | Low-level transport failure (DNS, socket reset, fetch rejection) | `true` |
| `HTTP_INVALID_RESPONSE` | Invalid JSON body on a 2xx response | `false` |
| `HTTP_CLIENT_ERROR` | Status 4xx (excluding 408 and 429) | `false` |
| `HTTP_SERVER_ERROR` | Status 5xx, or 503 with a `Retry-After` exceeding `maxRetryAfterMs` | `true` |
| `HTTP_RATE_LIMITED` | Status 429, or 429 with a `Retry-After` exceeding `maxRetryAfterMs` | `true` |
| `HTTP_ABORTED` | Caller's `AbortSignal` fired before the request completed | `false` |
| `HTTP_RETRY_EXHAUSTED` | All retry attempts were used without obtaining a successful response | `false` |
| `HTTP_INVALID_URL` | Unparseable URL, or URL policy violation (protocol / host) | `false` |

`HTTP_RETRY_EXHAUSTED` embeds the last encountered error as `cause`. When retries are
exhausted, the `onError` hook receives the `HTTP_RETRY_EXHAUSTED` error, not the underlying
cause. `HTTP_ABORTED` and `HTTP_INVALID_RESPONSE` are terminal — the pipeline never retries
on these codes.

## Security

1. **Header redaction.** The following headers are always replaced with `"[REDACTED]"` in
   logging hooks and error objects: `Authorization`, `Cookie`, `Set-Cookie`, `X-API-Key`,
   `Proxy-Authorization`. Additional names can be registered via `HttpClientConfig.sensitiveHeaders`.
   All header lookups during redaction are case-insensitive.

2. **No secret logging.** Logging hooks receive sanitized header dictionaries only. Request
   bodies, tokens, and credentials are never written to hooks or error messages by the module.

3. **No env access.** The module never reads `process.env`, `env`, or `globalThis.process`.
   All configuration is injected explicitly by the Host.

4. **Cloudflare Workers compatibility.** Zero `node:*` imports. Uses Web APIs exclusively:
   `fetch`, `Headers`, `Request`, `Response`, `AbortController`, `ReadableStream`,
   `ArrayBuffer`, `TextDecoder`, `DOMException`.

5. **Prototype pollution safety.** All copied objects, header maps, and metadata objects are
   created via `Object.create(null)`. Keys `__proto__`, `constructor`, and `prototype` are
   filtered out during any copy operation.

6. **Host URL policy enforcement.** Before dispatching any request, the URL is parsed via
   `new URL(url)`. `allowedProtocols`, `allowedHosts`, and `blockedHosts` are checked
   synchronously; a violation throws `HTTP_INVALID_URL` before any network activity occurs.

### Provider request ID extraction

On every response (successful or error), the module inspects headers case-insensitively for
well-known provider request ID headers and surfaces the first match as
`HttpResponse.requestId` / `HttpError.providerRequestId`:

`x-request-id`, `x-correlation-id`, `cf-ray`, `x-amzn-requestid`, `x-github-request-id`

## Logging hooks

Hooks are optional and fire synchronously within the request pipeline. They receive
pre-sanitized data and must not throw.

```ts
type LoggingHooks = {
  onRequest?: (info: SanitizedRequestInfo) => void;
  onResponse?: (info: SanitizedResponseInfo) => void;
  onError?: (error: HttpError, info: SanitizedRequestInfo) => void;
};

type SanitizedRequestInfo = {
  url: string;
  method: string;
  headers: Record<string, string>; // sensitive headers already redacted
  requestId?: string;
  metadata?: Record<string, unknown>;
};

type SanitizedResponseInfo = {
  status: number;
  headers: Record<string, string>; // sensitive headers already redacted
  requestId?: string;
  durationMs: number;
};
```

**Hook safety guarantee:** All hook calls are wrapped in `try { } catch { }`. An exception
thrown inside any hook is silently swallowed and never affects the request outcome or throw
behavior.

**Timing:**
- `onRequest` fires once before the first transport dispatch (before any retry loop begins).
- `onResponse` fires once on the first successful 2xx response.
- `onError` fires once when the pipeline emits a terminal error (after all retries are exhausted).

## How to integrate

### Steps

1. Copy the module folder into your repo.
2. In your Cloudflare Worker, declare an `Env` interface with any required secrets or base URLs.
3. Create the transport from your runtime fetch:
   ```ts
   const transport = createFetchTransport({ fetch: globalThis.fetch });
   ```
4. Build an `HttpClientConfig` with your URL policy, timeout, sensitive headers, and hooks —
   all values read from your own `env`, never from the module.
5. Call `createHttpClient(config)` to obtain an `HttpClient`.
6. Call `client.get(url)`, `client.post(url, body, options)`, etc. in your request handler.
   Catch `HttpError` and map `error.code` to the appropriate host-side response status.

### Quick reference

```ts
import { createHttpClient, createFetchTransport, HttpError } from './index.js';

const client = createHttpClient({
  transport: createFetchTransport({ fetch: globalThis.fetch }),
  defaultTimeoutMs: 8000,
  urlPolicy: {
    allowedProtocols: ['https:'],
    blockedHosts: ['localhost', '127.0.0.1', '169.254.169.254'],
  },
  sensitiveHeaders: ['X-Upstream-Token'],
  hooks: {
    onRequest: (info) => console.log(`→ ${info.method} ${info.url}`),
    onResponse: (info) => console.log(`← ${info.status} (${info.durationMs}ms)`),
    onError: (err, req) => console.error(`[${err.code}] ${req.method} ${req.url}`),
  },
});

// GET
const res = await client.get<{ id: string }>('https://api.example.com/items/1');
console.log(res.data?.id);

// POST with explicit retry opt-in for non-idempotent method
const created = await client.post<{ id: string }>(
  'https://api.example.com/items',
  { name: 'Widget' },
  { retry: { allowUnsafeRetries: true, maxAttempts: 2 } }
);

// Error handling
try {
  await client.get('https://api.example.com/data');
} catch (err) {
  if (err instanceof HttpError) {
    console.error(err.code, err.status, err.providerRequestId);
  }
}
```

See `examples/integration.example.ts` for the full Cloudflare Worker wiring example.

### Integration checklist

- [ ] Copy the module folder into the target repo
- [ ] Pass `createFetchTransport({ fetch: globalThis.fetch })` — do not rely on the default transport in production
- [ ] Configure `urlPolicy.blockedHosts` with SSRF-risky addresses (`localhost`, `127.0.0.1`, `169.254.169.254`)
- [ ] Set `defaultTimeoutMs` to a value appropriate for your SLA (default is 10 s)
- [ ] Register any custom auth or token header names in `sensitiveHeaders`
- [ ] Wire `hooks` to your logging or tracing framework
- [ ] Catch `HttpError` in every handler; map `error.code` to the appropriate host-side response status
- [ ] For `POST`/`PUT`/`PATCH`/`DELETE` retries, add `retry: { allowUnsafeRetries: true }` explicitly
- [ ] Run `npm run typecheck` before deploy

## Versioning

Standard semver — bump the version in `VERSION` on every change. No CHANGELOG or migration
guide until the module has been embedded in ≥ 2 real projects and the contract has stabilized.

## Promote to shared package when

The module has been embedded in ≥ 2–3 projects without changes to the `core/` contract
(only config or transport changes on the Host side) — then extract to an npm package.

## Known limitations

Two edge-case bugs were found during Stage 3 testing (`core/pipeline.ts`) and are still present
in the current code — see `TEST-REPORT.md` for full detail:

1. **`maxAttempts: 1` masks the real error code.** A request that fails once with a retryable
   error (e.g. `HTTP_SERVER_ERROR`, `HTTP_NETWORK_ERROR`) and has `maxAttempts: 1` — including
   every non-idempotent request without `allowUnsafeRetries` — is wrapped as
   `HTTP_RETRY_EXHAUSTED` even though no retry was ever attempted. Callers must inspect
   `error.cause` to see the underlying code (`core/pipeline.ts` lines 98–112).
2. **`Retry-After` over `maxRetryAfterMs` gets retried instead of failing fast.** The check that
   should abort immediately when `Retry-After` exceeds `maxRetryAfterMs` throws from inside the
   retry loop's `try` block, so its own `HTTP_RATE_LIMITED`/`HTTP_SERVER_ERROR` error is treated
   as retryable and the loop keeps retrying instead of failing immediately. The caller ends up
   with `HTTP_RETRY_EXHAUSTED` instead (`core/pipeline.ts` lines 80–87).

Neither bug crashes the client or drops a request; both only affect which `HttpErrorCode` the
caller sees. Not yet fixed as of v0.1.0.
