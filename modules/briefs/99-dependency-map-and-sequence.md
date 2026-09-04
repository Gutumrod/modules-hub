# Module Hub — Dependency Map & Change Sequence

**Status:** Current architecture guidance
**Reconciled:** 2026-09-04

## Current registry state

`../REGISTRY.md` is authoritative for the 24 registered modules: 23 `✅ Completed` and 1 `🧪 Pilot / Testing` (`line-oa-ai-module`). This file no longer tracks a build queue because the original bootstrap sequence is complete.

Future hardening or new-module work must be opened from a real product/module gap and handled as separate scoped work. Do not infer a development priority from historical module numbering.

## Dependency principle

Avoid dependency spaghetti. Prefer host orchestration over direct module-to-module runtime coupling:

```text
Host Project
 ├─ verifies/normalizes an external event
 ├─ invokes the relevant module contract
 ├─ persists product-owned state
 ├─ emits audit/notification side effects
 └─ owns failure/retry policy across modules
```

A module may expose adapters/contracts that make composition easier, but its core should not import another Module Hub module merely for convenience.

## Common composition relationships

Typical host-level composition:

```text
Webhook Receiver ──verified event──▶ Payment / Subscription / product logic
Payment ──normalized payment result──▶ host orchestration
Subscription ──entitlement result──▶ host feature gate
Auth / Auth-Supabase + Tenant Context ──identity/context──▶ host routes/services
Job / Retry + Scheduler ──execution trigger──▶ host task handler
AI Provider + AI Workflow Engine ──AI/runtime contracts──▶ host workflow
Audit Log / Notification / Event Bus ──side effects──▶ host integration
Health Check / Enterprise Features ──operational contracts──▶ host runtime
```

These arrows are composition guidance, not permission to create hidden cross-repository imports.

## Money-layer boundary

`payment`, `subscription`, and `webhook-receiver` are reusable contracts/components. A consuming product must still respect the owning product/platform architecture. The presence of these modules does not require every product to duplicate billing/subscription state locally.

Current shared contracts include:
- `payment`: single-payment operations plus optional Stripe recurring Checkout initiation; it does not own subscription lifecycle or reconciliation.
- `subscription`: lifecycle/entitlement state, UTC billing interval handling, bounded grace behavior, and a durable billing-event idempotency contract.
- `webhook-receiver`: generic HMAC plus implemented Stripe verification; LINE/GitHub verifiers remain placeholders.

## Change sequence

For future module hardening or a proven capability gap:

```text
Evidence from a real consumer
→ scope the upstream change
→ update design/contract
→ implement in Module Hub
→ test/typecheck/review
→ update VERSION + package metadata when required
→ reconcile MODULE/DESIGN/REGISTRY/ROADMAP/INDEX
→ consumer adopts a pinned copy with provenance
```

Do not modify Module Hub opportunistically while implementing one product.

## Documentation gate

A documentation reconciliation passes only when:
- every registered module directory exists
- `VERSION`, package version, and Registry version agree
- every registered module has `MODULE.md` and `DESIGN.md`
- current metadata in module docs agrees with Registry maturity
- ROADMAP and INDEX contain every registered module
- current docs contain no known broken internal references presented as authoritative
- historical briefs are clearly marked historical

This documentation gate does not certify implementation quality or production readiness; those require separate module hardening/validation work.
