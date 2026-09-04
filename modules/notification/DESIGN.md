# Notification Module — DESIGN.md

**Version:** 0.2.0
**Status:** ✅ Completed
**Documentation Authority:** Current version/status follow `../REGISTRY.md`; this document describes the module contract/design for that registered version.

## Purpose

Notification is an embedded outbound-notification building block. The host owns business events, secrets, provider selection, and deployment; the module validates a generic `NotificationEvent` and delegates delivery to an injected `NotificationProvider`.

It is not a central notification service, workflow engine, database, or business-domain router.

## Architecture

```text
Host business event
      ↓
createNotifier({ provider })
      ↓
NotificationProvider contract
      ↓
WebhookProvider (current shipped provider)
      ↓
Destination endpoint
```

Core and providers are copied into the consuming project under the Module Hub copy-and-own rule. Cross-repository runtime imports are not supported.

## Public contract

`createNotifier({ provider })` returns a notifier exposing `notify(event)`.

`NotificationEvent` contains:
- `type: string`
- `payload: object`
- optional `idempotencyKey`
- optional ISO `occurredAt`

`NotificationResult` reports success, HTTP status when available, attempts, and a structured retryability-aware error.

The current `WebhookProvider` supports:
- injected URL and optional HMAC secret
- custom headers
- timeout and bounded retries
- optional idempotency-key forwarding
- HMAC-SHA256 signing through Web Crypto
- HTTPS enforcement with explicit local-development escape hatch

## Failure model

Canonical errors include `INVALID_EVENT`, `REMOTE_4XX`, `RATE_LIMITED`, `REMOTE_5XX`, `NETWORK_ERROR`, `TIMEOUT`, and `SERIALIZATION_ERROR`.

## Security and runtime boundaries

- Core/provider configuration is injected by the host; the module does not read environment variables directly.
- Secrets, signature values, and sensitive headers must not be logged.
- Provider implementations must remain business-domain agnostic.
- Web Crypto is used instead of Node-only crypto so the shipped provider remains Edge/Cloudflare-compatible.
- Payload formatting/routing to LINE, Telegram, email, or another channel belongs to the destination endpoint or a future provider implementation.

## Integration contract

Consumers copy the complete module directory, record immutable provenance, read `MODULE.md`, and run the copied module tests before deployment. Project-specific behavior belongs in the destination copy/integration layer; upstream Module Hub changes require a separate scoped task.

The full usage example remains `integration.example.ts`; `MODULE.md` is the public operational reference.
