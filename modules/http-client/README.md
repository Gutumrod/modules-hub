# http-client — A Typed HTTP Client Core You Copy Into Your Own Project

A small, dependency-free HTTP client you copy into your own project and own outright. You build
one configuration object, hand the module a transport, and every call goes through a single
request pipeline: URL policy validation, header sanitisation, timeout control, transient retry
with exponential backoff, response parsing, provider request-id extraction, then a typed
response — or a structured `HttpError` you can branch on by code.

It is deliberately narrow. It performs transient retries of a single request: a short loop over a
few seconds for network flakiness or rate limits. It is not a job queue, not a background
scheduler, and it never reads your environment — you inject everything.

Version 0.1.0. Public entry point: `index.ts`.

The entry point is TypeScript source. Use it from a TypeScript-aware bundler or runner; plain Node
ESM cannot import this source entry point directly. To run the included example, install the
module's development tools and use `npm run example` from this module directory.

## install — Install (copy-and-own, 3 steps)

1. Copy the whole module directory into your project — copy the module directory `http-client/`
   into, for example, `src/modules/http-client/`. Copy it whole: `index.ts`, `core/`, `adapters/`,
   `examples/`, `package.json`, `tsconfig.json` and the tests belong together. There is no
   published package for this module, so there is nothing to install from a registry; the copy
   *is* the dependency.
2. Optional, and only if you want to run the module's own tests and example inside the copy:
   install its development tooling there with `npm ci`. Your application needs none of it.
3. Import the module through the entry point of your copy, never through another repository's
   path:

   ```ts
   import { createHttpClient, createFetchTransport, HttpError } from './modules/http-client/index.js';
   ```

Keep the copy under your own version control. It is yours to edit, extend and rename.

## quickstart — Quickstart (first successful call)

From a copied module directory to a first successful request. The module touches no network of
its own and reads no environment, so the shortest path to a real call is to create a transport
from the runtime `fetch` your platform already provides:

```ts
// Path points at your copy, not at a shared repository.
import { createHttpClient, createFetchTransport, HttpError } from './modules/http-client/index.js';

// 1. A transport built from your runtime's fetch. In production, pass it explicitly.
const transport = createFetchTransport({ fetch: globalThis.fetch });

// 2. One configuration object. Everything sensitive comes from your own env, not the module.
const client = createHttpClient({
  transport,
  defaultTimeoutMs: 8000,
  urlPolicy: {
    allowedProtocols: ['https:'],
    blockedHosts: ['localhost', '127.0.0.1', '169.254.169.254'],
  },
});

// 3. One call. Body parsing, retry, timeout and error mapping all run inside it.
try {
  const res = await client.get<{ id: string; name: string }>('https://api.example.test/items/1');
  console.log(res.status, res.ok, res.data?.name);
} catch (err) {
  // Every failure path throws HttpError — never an error object in the return value.
  if (err instanceof HttpError) console.error(err.code, err.status);
}
```

Run the bundled, self-contained example with this exact command, from the module directory:

    npm run example

## example — Runnable Example

One command, no arguments, no network, no credentials, no configuration:

    npm run example

It runs `examples/run.ts` through `vite-node`. The example drives the module's real fetch adapter
with an injected, scripted fetch implementation, so the production pipeline runs end to end
without a server. The last line it prints starts with `EXAMPLE_RESULT: OK` and reports only values
that run actually measured. Observed output of the last verified run:

    GET  /items/1 -> status=200 ok=true id=item_1 name=Widget requestId=req_example_1
    GET  /text    -> status=200 dataType=string data="hello from the transport"
    POST /items   -> status=201 contentType=application/json body={"name":"Widget"} redactedHeaders=2
    GET  /flaky   -> status=200 id=flaky_ok attempts=2
    POST /unsafe  -> code=HTTP_RETRY_EXHAUSTED cause=HTTP_SERVER_ERROR attempts=1
    GET  blocked  -> code=HTTP_INVALID_URL fetchesAttempted=0
    GET  bad-url  -> code=HTTP_INVALID_URL
    GET  /missing -> code=HTTP_CLIENT_ERROR attempts=1
    GET  /slow    -> code=HTTP_RETRY_EXHAUSTED cause=HTTP_TIMEOUT attempts=1
    GET  aborted  -> code=HTTP_ABORTED attempts=1
    throwing hooks isolated -> true
    EXAMPLE_RESULT: OK fetches=11 hookCalls=onRequest:8+onResponse:4+onError:4 redactedHeaderValues=2 itemStatus=200 itemId=item_1 requestId=req_example_1 textDataType=string postStatus=201 postBodySerialized=true flakyAttempts=2 flakyStatus=200 unsafePostAttempts=1 unsafeCode=HTTP_RETRY_EXHAUSTED unsafeCause=HTTP_SERVER_ERROR blockedCode=HTTP_INVALID_URL blockedFetchesAttempted=0 invalidUrlCode=HTTP_INVALID_URL clientErrorCode=HTTP_CLIENT_ERROR clientErrorAttempts=1 timeoutCode=HTTP_RETRY_EXHAUSTED timeoutCause=HTTP_TIMEOUT abortCode=HTTP_ABORTED abortAttempts=1 attemptsPerSlowRequest=true hostileHooksIsolated=true errorClassOk=true caughtErrorCodes=HTTP_RETRY_EXHAUSTED+HTTP_INVALID_URL+HTTP_CLIENT_ERROR+HTTP_ABORTED hookErrorCodes=HTTP_RETRY_EXHAUSTED+HTTP_CLIENT_ERROR+HTTP_ABORTED

Read the detail lines with the summary: a plain GET returns status 200 with `requestId` taken from
the response header; the same pipeline decodes text when you ask for it; a `POST` object body is
serialized to JSON with the content type set; a blocked host and an unparseable URL are both
refused before any fetch is attempted; a safe method (`GET`) is retried after a 503 while a
non-idempotent `POST` gets exactly one attempt; a timeout and a caller abort are both normalised
to `HttpError` codes; and hooks that throw do not change the outcome.

## limitations — Limitations (read this first)

- **`maxAttempts: 1` masks the underlying error code.** A request that fails once with a retryable
  error and is configured for a single attempt — which includes every non-idempotent request
  without `allowUnsafeRetries` — is reported as `HTTP_RETRY_EXHAUSTED` even though no retry was
  ever attempted. The real error is only reachable through `error.cause`. This is visible in
  `npm run example`, where the non-idempotent `POST` reports `HTTP_RETRY_EXHAUSTED` with
  `cause=HTTP_SERVER_ERROR`.
- **A `Retry-After` above `maxRetryAfterMs` is retried instead of failing fast.** The guard that
  should abort immediately when `Retry-After` exceeds its cap throws from inside the retry loop's
  own `try` block, so its error is treated as retryable and the loop keeps going. The caller ends
  up with `HTTP_RETRY_EXHAUSTED` rather than the immediate `HTTP_RATE_LIMITED` /
  `HTTP_SERVER_ERROR` intended. Both of these are documented in `MODULE.md` and `TEST-REPORT.md`
  and are unfixed at 0.1.0.
- **Transient retry only.** Retry state lives in memory for the duration of a single call: it is
  not persisted, not scheduled, and not tracked across process restarts. Background jobs and long
  retry workflows belong to a separate module, not to this one.
- **Host policy matching is exact.** `allowedHosts` and `blockedHosts` compare the parsed hostname
  for exact equality, so a list entry does not cover subdomains or wildcards. Register every host
  name you intend to allow or block.
- **Error response bodies are truncated.** For a non-2xx response the body is read and cut to 2048
  bytes before it is embedded in the error message, so a very large upstream error page reaches
  your logs only in part.
- **No environment access by design.** The module never reads `process.env`, `env` or
  `globalThis.process`. Nothing is configured unless you pass it in, so a missing setting surfaces
  as a failing request rather than a default.
- **You must supply the transport's fetch.** `createFetchTransport()` defaults to
  `globalThis.fetch`; on a runtime without a global `fetch` you have to inject your own.
- **No caching, no rate limiting, no circuit breaking.** Each call is dispatched as given. There is
  no response cache, no client-side throttling and no failure isolation layer in this module.

## api — Public API

Every export below comes from the module entry point `index.ts`. Do not import from sub-files.

Runtime exports:

- `createHttpClient` — `createHttpClient(config?: HttpClientConfig): HttpClient`; returns a client
  bound to your configuration, defaulting to a fetch transport, a 10 s timeout and the default
  retry policy when fields are omitted.
- `createFetchTransport` — `createFetchTransport(options?: FetchTransportOptions): HttpTransport`;
  the Web Fetch adapter. Non-string, non-`ArrayBuffer`, non-`Blob` bodies are serialized to JSON and
  the JSON content type is set unless you already supplied one.
- `HttpError` — the structured error class every failure path throws, carrying `code`, `status`,
  `retryable`, `providerRequestId`, `url`, `method` and `cause`.
- `HttpClient` — the client interface: `request()`, plus the `get`, `post`, `put`, `patch` and
  `delete` convenience methods, each of which delegates to `request()`.
- `HttpClientConfig` — the injected configuration: `transport`, `defaultTimeoutMs`, `defaultRetry`,
  `urlPolicy`, `sensitiveHeaders`, `hooks`.
- `HttpRequest` — one request: `url`, `method`, and optional `headers`, `body`, `timeoutMs`,
  `retry`, `signal`, `metadata`, `responseType`.
- `HttpResponse` — one response: `status`, `ok`, `headers`, `data`, `requestId`.
- `HttpTransport` — the transport interface: `send(request: TransportRequest)`.
- `TransportRequest` — what the pipeline hands to the transport: `url`, `method`, `headers`,
  `body`, `signal`.
- `TransportResponse` — what a transport returns: `status`, `headers`, `body`, `rawResponse`.
- `FetchTransportOptions` — the fetch adapter's options: `fetch`.
- `RetryPolicy` — `maxAttempts`, `initialDelayMs`, `backoffMultiplier`, `maxDelayMs`,
  `retryableStatusCodes`, `respectRetryAfter`, `maxRetryAfterMs`, `allowUnsafeRetries`.
- `UrlPolicy` — `allowedProtocols`, `allowedHosts`, `blockedHosts`; enforced before any dispatch.
- `LoggingHooks` — `onRequest`, `onResponse`, `onError`; every hook call is guarded so a throwing
  hook cannot change the request outcome.
- `SanitizedRequestInfo` — what `onRequest` / `onError` receive: already-sanitized `url`, `method`,
  `headers`, plus optional `requestId` and `metadata`.
- `SanitizedResponseInfo` — what `onResponse` receives: `status`, sanitized `headers`, optional
  `requestId`, and `durationMs`.
- `HttpErrorCode` — the closed union of error codes you can branch on: `HTTP_TIMEOUT`,
  `HTTP_NETWORK_ERROR`, `HTTP_INVALID_RESPONSE`, `HTTP_CLIENT_ERROR`, `HTTP_SERVER_ERROR`,
  `HTTP_RATE_LIMITED`, `HTTP_ABORTED`, `HTTP_RETRY_EXHAUSTED`, `HTTP_INVALID_URL`.

## tests — Tests

Run the suite from the module directory:

    npm test

Observed in this packaging round (2026-09-27), `npm test` exited 0 and reported:

- 170 tests passed, 0 failed, across 2 test files.
- 157 tests in `tests/http.test.ts` are the pre-existing suite. That file is unchanged — no test
  removed, skipped or weakened.
- 13 new tests in `tests/docs-contract.test.ts` guard the customer documentation contract, and
  that file is the only test file added in this round.
- `npm test` maps to `vitest run`.
- `tests/docs-contract.test.ts` reads `README.md`, `README.th.md`, `MODULE.md`, `package.json`,
  `index.ts`, `core/error.ts` and `examples/run.ts` from disk. Deleting a required README section,
  breaking the copy-and-own install rule, documenting an export the entry point does not have,
  quoting a test count `MODULE.md` does not state, or dropping the example marker all fail it.
- `npm run typecheck` maps to `tsc --noEmit`, includes `**/*.ts` (examples and tests included) and
  exits 0.

## strengths — Strengths

- **No runtime dependencies.** `package.json` declares no `dependencies` field at all, and no file
  in the module imports a `node:*` builtin, so nothing beyond the module source itself is pulled
  into your application. Only development tooling (`typescript`, `vitest`, `vite-node`) is
  declared, and only for running the tests and the example.
- **Exactly one request path.** `core/client.ts` implements `get`, `post`, `put`, `patch` and
  `delete` as pure delegations to `request()`, so URL validation, redaction, timeout, retry,
  parsing and hooks cannot diverge between verbs. The pipeline guarantee is asserted in
  `tests/http.test.ts`.
- **A typed, closed error model.** `core/error.ts` holds one union of nine error codes with a
  per-code default for `retryable`, and every failure path throws `HttpError`. You branch on
  `error.code` instead of parsing messages.
- **Secrets are redacted before your logging sees them.** `core/security.ts` replaces
  `Authorization`, `Cookie`, `Set-Cookie`, `X-API-Key` and `Proxy-Authorization` with
  `[REDACTED]` in the sanitized request/response info handed to hooks, plus anything you register
  in `sensitiveHeaders`. Lookups are case-insensitive. The example counts the redacted values it
  observed in the summary line.
- **Hooks cannot break a request.** Every hook invocation in `core/pipeline.ts` is wrapped in
  `try` / `catch`, so a exploding telemetry sink leaves the outcome untouched; the example proves
  this with hooks that throw on success and on failure paths.
- **Prototype-pollution safe.** `core/security.ts` builds copied header maps, metadata objects and
  response headers with `Object.create(null)` and filters `__proto__`, `constructor` and
  `prototype` out of every copy.
- **Retries are conservative by default.** `core/retry.ts` ships `maxAttempts: 3`, exponential
  backoff `200 ms → 400 ms` capped at `5000 ms`, retryable statuses `408, 429, 500, 502, 503, 504`,
  and `allowUnsafeRetries: false` — so `POST`, `PUT`, `PATCH` and `DELETE` are never retried unless
  you explicitly opt in. Both behaviours are visible in the example run above.
- **Full source, not a black box.** You copy the whole module — pipeline, adapters, tests and a
  commented Cloudflare Worker integration example — and can read or change every line.

## runtime — Runtime Requirements

- **Runtime dependencies: none.** `package.json` has no `dependencies` field, so the shipped source
  needs no third-party runtime package at all.
- **Node builtins used: none.** The module imports no `node:*` module — no `fs`, no `http`, no
  `net`, no `crypto`. This is what lets the same source run on Cloudflare Workers.
- **Web platform APIs used:** `fetch`, `Headers`, `Request`, `Response`, `Blob`, `ArrayBuffer`,
  `TextDecoder`, `URL`, `AbortController`, `AbortSignal`, `DOMException`, `ReadableStream`,
  `setTimeout` and `clearTimeout`.
- **Where it runs:** TypeScript-aware bundlers/runners targeting runtimes that provide those Web
  APIs — Cloudflare Workers, modern browsers, Deno, Bun and Node.js 18 or newer. The source uses
  ESM syntax with `.js` specifiers for TypeScript files and type-checks under
  `moduleResolution: Bundler`; plain Node ESM cannot import the `.ts` entry point directly. Use
  your application's bundler/TypeScript runner or the included `npm run example` command.
- **Where it cannot run by itself:** a runtime without a global `fetch` needs you to inject your own
  `HttpTransport` through `createHttpClient({ transport })`, because the default transport uses
  `globalThis.fetch`. And because there are no Node builtins, this module gives you no file, socket
  or stream I/O — it speaks HTTP through the injected transport and nothing else.
- **Where it does not apply:** anything longer-lived than a single request. There is no job queue,
  no scheduling, no attempt persistence and no cross-process retry state; long retry workflows
  belong to a separate module. Likewise there is no response caching, no throttling and no circuit
  breaker.
- **Where the example runs:** `npm run example` uses `vite-node`, a development-only tool. It needs
  the module's development dependencies installed and is not part of your application bundle.

For the full contract — configuration defaults, retry and idempotency rules, `Retry-After`
handling, parsing rules, the error-code table and the security model — see `MODULE.md` and
`DESIGN.md` in the copied directory.
