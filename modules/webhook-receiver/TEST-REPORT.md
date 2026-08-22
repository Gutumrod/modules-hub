# TEST-REPORT.md — Webhook Receiver Module

> **Note (re-verified 2026-08-22):** the original Stage-4 QA report below (121 tests, all
> three non-generic providers as stubs) is **stale**. `providers/stripe/index.ts` was
> subsequently implemented in full (dated 2026-08-18) and `tests/webhook.test.ts` grew
> accordingly. Figures below reflect an actual `npm test` / `npm run typecheck` run against
> the current source, not the original Stage-4 numbers.

## Result (verified)

- **Test file:** `tests/webhook.test.ts`
- **`npm test` (vitest run):** **136 passed / 0 failed** (1 test file, ~36ms test time)
- **Typecheck (`npm run typecheck` / tsc --noEmit):** exit 0, no errors
- **Coverage:** NOT configured — `package.json` has no `test:coverage` script (no `@vitest/coverage-v8` dep). Coverage was not run/measured.

## Coverage of required areas

- Request parsing: `normalizeHeaders` (plain object: string / array joined ", " / undefined skipped; real `Headers` instance)
- Signature verification (`GenericHmacVerifier`): valid HMAC-SHA-256 hex, SHA-512, base64 encoding, `sha256=` prefix stripping, wrong secret, mismatched body, malformed signature
- Signature verification (`StripeWebhookVerifier`): valid `t=`/`v1=` header parsing, HMAC-SHA256 over `{timestamp}.{rawBody}`, missing/empty header, malformed header, non-numeric timestamp, invalid hex signature, wrong secret, expired timestamp, custom tolerance, non-object/malformed JSON body — 19 tests
- Timing-safe comparison: `timingSafeEqual` equal/length-mismatch/byte-mismatch
- Timestamp validation: missing / invalid / expired-outside-window / within-window, custom tolerance
- Replay protection / idempotency: Map-based in-memory store; duplicate eventId → `WEBHOOK_REPLAY_DETECTED`; no store / no eventId skip; TTL passthrough
- Payload validation & size limit: oversized over default 1MB AND over custom limit → `WEBHOOK_OVERSIZED_PAYLOAD`; malformed JSON → `WEBHOOK_MALFORMED_JSON`; string + Uint8Array rawBody forms; valid parse
- Structured error codes: all `WebhookErrorCode` values exercised across failure paths
- Full pipeline (`createWebhookReceiver`): happy path, empty object `{}`, Uint8Array, provider resolution (verifier / verifiers map / defaultProvider / argument / request.provider / unknown → `WEBHOOK_UNKNOWN_PROVIDER`), config validation (`payloadMaxBytes<=0`, `timestampToleranceSeconds<=0`, no verifiers, defaultProvider-not-found → `WEBHOOK_CONFIG_INVALID`)
- LINE / GitHub providers: each is an unimplemented stub — `verify()` always returns `WEBHOOK_UNKNOWN_PROVIDER` with message "... is not yet implemented"; asserted directly, one test each

## Production bugs

**None found.** All implemented production code (core pipeline, `GenericHmacVerifier`, `StripeWebhookVerifier`) behaved as expected under test.

## Known gap (expected, not a defect)

`providers/line/` and `providers/github/` are **unimplemented stubs** — each `verify()`
returns `WEBHOOK_UNKNOWN_PROVIDER` ("... is not yet implemented"). `providers/stripe/` is
**fully implemented** (see above) and is not part of this gap. `GenericHmacVerifier` and
`StripeWebhookVerifier` are both fully implemented and covered by tests.
