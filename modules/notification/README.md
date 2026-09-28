# Notification

A small, dependency-free TypeScript module that takes one validated `NotificationEvent` and
delivers it to a single destination that you inject: the shipped transport is a generic webhook
provider with optional HMAC-SHA256 signing, per-attempt timeout and bounded retry. The host
project owns every decision the module refuses to make itself — which destination, which
credentials, and where an event is raised.

## install — Install

This module is copy-and-own: the source is the deliverable. There is no published npm package
for it, so there is no registry install step — and the module ships zero runtime dependencies,
so nothing is added to your application's dependency tree.

1. Copy the entire `notification/` module directory into your project — for example to
   `src/modules/notification/`. Copy the whole directory (`core/`, `providers/`, `examples/`,
   `tests/`, `package.json`, `package-lock.json`, `tsconfig.json`, `VERSION`,
   `.dev.vars.example`), not individual files.
2. Inside the copied directory run `npm ci` to install the dev toolchain used by the tests and
   the example (`vitest`, `typescript`, `vite-node`) from the shipped `package-lock.json`.
3. Import the module from your own copy's entry points (`./modules/notification/core/client.js`
   and a provider such as `./modules/notification/providers/webhook.js`) and adapt only that
   copy. Never import across projects from the directory the module was copied from.

Requires Node.js 18+ with npm for the toolchain, and a bundler or TypeScript-capable runner for
your application (see runtime).

## quickstart — Quickstart

After the three install steps, this is the whole path from a copied module to a first
successful call — one provider, one notifier, one event:

```ts
// your-app/src/notify.ts  (module copied to your-app/src/modules/notification/)
import { createNotifier } from './modules/notification/core/client.js';
import { WebhookProvider } from './modules/notification/providers/webhook.js';

// The host reads its own secrets and passes them in; the module never reads the environment.
const provider = new WebhookProvider({
  url: process.env.NOTIFICATION_WEBHOOK_URL as string,
  secret: process.env.NOTIFICATION_WEBHOOK_SECRET, // optional: enables X-Signature
  timeoutMs: 5000, // optional, default 5000
  maxAttempts: 3, // optional, default 3
});

const notifier = createNotifier({ provider });

const result = await notifier.notify({
  type: 'booking.created',
  payload: { bookingId: 'bk_123' },
  idempotencyKey: 'booking-created-bk_123',
});

console.log(result.ok, result.statusCode, result.attempts);
```

`notify()` validates the event first and returns `{ ok: false, error: { code: 'INVALID_EVENT' } }`
with `attempts: 0` when the event is malformed; otherwise it delegates to the injected provider.
A malformed event never reaches the network.

The exact command to run the shipped example, from inside the module directory:

```bash
npm run example
```

## example — Example

The module ships one runnable example, `examples/run.ts`, started with a single command:

```bash
npm run example
```

It is self-contained: no network, no file system writes, no secrets and no environment reads.
`globalThis.fetch` is replaced by a local stub for the duration of each scenario (the same
technique the shipped test suite uses) and restored afterwards, so no request leaves the
process. All inputs are fixed literals, so the output is identical on every run.

npm prints its own `npm notice run ...` lines first; the program itself prints these eight lines:

```text
validation invalidCode=INVALID_EVENT invalidAttempts=0 ok=true
injection isClient=true sendCalls=1
success ok=true statusCode=200 attempts=1
transport contentType=application/json idempotencyKey=booking-created-bk_123 authHeader=Bearer example-token
signature matched=true bodyMatched=true
retry429 ok=true attempts=2 fetchCalls=2
rejected ok=false statusCode=400 code=REMOTE_4XX fetchCalls=1
EXAMPLE_RESULT: OK validations=2 invalidCode=INVALID_EVENT delegatedSendCalls=1 signatureMatched=true retryAttempts=2 remote4xxCode=REMOTE_4XX
```

The last line starts with `EXAMPLE_RESULT: OK`. What it observed: two validation calls were made
(the malformed one rejected with `INVALID_EVENT` and `attempts: 0`, the valid one delegated), the
injected provider received exactly one `send`, the signed request's `X-Signature` equalled a
locally recomputed HMAC-SHA256 hex digest of the exact JSON body, a `429` response was retried and
succeeded on attempt 2, and a `400` response stopped after one fetch with `REMOTE_4XX`.

## limitations — Limitations

- One transport, one destination: `providers/webhook.ts` is the only implemented provider. It
  POSTs the event as JSON to a single URL you configure. There is no routing, fan-out or
  per-recipient dispatch — if an event has to reach LINE, Telegram or email, the destination
  endpoint on the other side of the webhook has to do that. `providers/line.stub.ts`,
  `providers/telegram.stub.ts` and `providers/email.stub.ts` are placeholders whose constructors
  throw `LineProvider not implemented yet` / `TelegramProvider not implemented yet` /
  `EmailProvider not implemented yet`; they are not usable providers in this version.
- Retries are blind and the backoff is not server-directed: any retryable failure
  (`RATE_LIMITED`, `REMOTE_5XX`, `NETWORK_ERROR`, `TIMEOUT`) is retried up to `maxAttempts` times
  (default 3) with a fixed exponential sleep of `500 * 2 ** (attempt - 1)` ms — 500 ms before
  attempt 2 and 1000 ms before attempt 3 — regardless of any `Retry-After` header, and each
  retry re-sends the identical body. `Retry-After` is ignored.
- A retry sleeps inside the caller's `await`: with the default `maxAttempts: 3` a failing send
  can block the calling code for about 1.5 seconds of backoff on top of the per-attempt
  `timeoutMs` (default 5000 ms each).
- The module does no de-duplication of its own. `idempotencyKey` is only forwarded as an
  `X-Idempotency-Key` request header; the destination must implement the deduplication.
- `https:` is enforced at construction. A `http:` URL throws unless you explicitly pass
  `allowInsecureHttp: true`, which exists only for local development.
- The shipped entry points are TypeScript with `.js` relative specifiers, so plain `node` cannot
  import them directly — tests and the example run through vitest/vite-node (see runtime).

## api — API

There is no barrel file. The module exposes three documented entry points:

- `core/client.ts`
  - `createNotifier(config)` — factory returning a `NotificationClient` bound to the provider
    you inject.
  - `NotificationClient` — class with `notify(event): Promise<NotificationResult>`; validates the
    event, then delegates to the injected provider.
- `core/types.ts` (types only)
  - `NotificationEvent` — `{ type, payload, recipient?, idempotencyKey?, occurredAt? }`; `type`
    must be a non-empty string, `payload` a JSON-serializable plain object, `occurredAt` an ISO
    8601 string.
  - `NotificationProvider` — the transport contract: `send(event): Promise<NotificationResult>`.
  - `NotificationConfig` — `{ provider }`, the argument of `createNotifier`.
  - `NotificationResult` — `{ ok, statusCode?, attempts, error? }`.
  - `NotificationError` — `{ code, message, retryable }`.
  - `NotificationErrorCode` — union of `INVALID_EVENT`, `INVALID_CONFIG`, `SERIALIZATION_ERROR`,
    `NETWORK_ERROR`, `TIMEOUT`, `RATE_LIMITED`, `REMOTE_4XX`, `REMOTE_5XX`, `UNKNOWN_ERROR`.
- `providers/webhook.ts`
  - `WebhookProvider` — the webhook transport implementing `NotificationProvider`; `send()`
    signs the body when a secret is configured, sets `Content-Type: application/json`, forwards
    `X-Idempotency-Key`, applies the per-attempt timeout and retries according to the HTTP status.
  - `WebhookProviderConfig` — `{ url, secret?, timeoutMs?, maxAttempts?, headers?,
    allowInsecureHttp? }`. `content-type`, `x-signature` and `x-idempotency-key` are reserved
    names and a custom header using one of them throws.

Error codes you will observe in `NotificationResult.error.code` (all defined in
`core/types.ts` and documented in `MODULE.md`): `INVALID_EVENT` (validation failed, not
retryable), `SERIALIZATION_ERROR` (JSON.stringify failed, not retryable), `REMOTE_4XX` (4xx
other than 429, not retryable), `RATE_LIMITED` (429), `REMOTE_5XX` (5xx), `NETWORK_ERROR` (fetch
failed), `TIMEOUT` (per-attempt timeout aborted the request). Configuration mistakes are thrown
as `Error` whose message begins with `INVALID_CONFIG` (empty url, non-URL, non-`https:` without
`allowInsecureHttp`, a reserved custom header, or signing without a secret).

## tests — Tests

Run the suite from the module directory with:

```bash
npm test
```

Observed in this release round: `npm test` reported `Test Files 2 passed (2)` and
`Tests 30 passed (30)` — 30 tests in two test files. That is the pre-existing module suite (23
tests in `tests/webhook.test.ts`) plus the 7 assertions of the documentation contract in
`tests/docs-contract.test.ts`. Type checking is a separate gate:

```bash
npm run typecheck
```

## strengths — Strengths

- The signing is real and asserted against an independent computation: `WebhookProvider`
  computes HMAC-SHA256 with the Web Crypto API (`crypto.subtle`) over the exact JSON body it
  sends — see `providers/webhook.ts` — and `tests/webhook.test.ts` recomputes the digest with its
  own helper and asserts the `X-Signature` header equals it.
- Every failure mode is a structured result, not a thrown string: `NotificationResult.error` is
  `{ code, message, retryable }` with the codes listed above, and the retry rules are pinned by
  tests — 400/401/403 stop after one fetch, 429 and 500 retry and can succeed on attempt 2,
  persistent 503 exhausts `maxAttempts`, a hanging fetch aborts with `TIMEOUT`, and a
  `maxAttempts: 2` run asserts exactly two fetches.
- Secrets are kept out of results: `tests/webhook.test.ts` asserts that neither the signing
  secret nor a custom `Authorization` value appears anywhere in the returned result when a
  request fails.
- The transport is swappable: `core/client.ts` only depends on the `NotificationProvider`
  interface, so the suite proves provider injection with a plain mock (no transport, no network)
  and a different transport only has to implement `send(event)`.
- Zero runtime dependencies and zero `node:*` builtins in the source: `package.json` declares no
  `dependencies`, and `core/` and `providers/` import only each other, so the module does not
  constrain the runtime it is copied into.
- The example runs from one command with no network, no filesystem writes, no secrets and no
  environment reads (`npm run example`).
- The documentation contract is machine-checked, not eyeballed: `tests/docs-contract.test.ts`
  parses both README files from disk, compares their ordered section keys, and fails if a
  required section, the Thai README, the copy-and-own install or the example marker goes missing.

## runtime — Runtime

- Runtime dependencies: none. `package.json` has no `dependencies` field at all; the only
  devDependencies are `vitest`, `typescript` and `vite-node`, which are needed to run the tests
  and the example, not to use the module.
- Node builtins used by the module: none. The source contains no `node:*` import (the source
  deliberately avoids `node:crypto`), no `process.env` read and no filesystem access. It uses
  only web-standard globals: `fetch`, `AbortController`, `setTimeout`, `TextEncoder`, `URL` and
  `crypto.subtle`.
- Where it can run: anywhere those globals exist and TypeScript is compiled — Node.js 18+ under
  a bundler or TypeScript-capable runner, and bundler-based edge/worker runtimes (the module
  header names Cloudflare Workers and Supabase Edge Functions as its portability targets).
- Where it cannot run as shipped: plain `node` cannot import the entry points directly, because
  they are `.ts` files with `.js` relative specifiers. `npm test`, `npm run example`
  (vitest/vite-node) or your own bundler/transpile step are the supported paths.
- Type checking uses the shipped `tsconfig.json` (`tsc --noEmit`, `target ES2022`,
  `module ES2022`, `moduleResolution Bundler`, strict). Run `npm run typecheck` in the copied
  module directory before you deploy.
