# Subscription + Entitlement Module

> Decouples SaaS business subscription lifecycle states and feature permission checks from billing providers (such as Stripe).

- **Version:** 0.1.0
- **Status:** Experimental / Pilot Ready — billing-event lifecycle transitions and entitlement checks are implemented and tested; time-based expiry is not automatic.
- **Priority:** P1 (SaaS Money Layer)

---

## Architecture

```text
Subscription Core
       │
       ├── Plan Repository
       ├── Subscription Repository
       └── Entitlement Engine
```

- **Core Responsibilities:** Manages subscription lifecycle status (`trialing`, `active`, `past_due`, `grace_period`, `cancel_at_period_end`, `cancelled`, `expired`), plan mapping, and entitlement evaluation (`canUseFeature`, `getLimit`, `checkUsage`). `subscription.payment_failed` transitions to `grace_period` and sets `gracePeriodEnd` using the configured duration (default 3 days).
- **Storage Agnostic:** Repositories (`SubscriptionRepository`, `PlanRepository`) abstract data persistence so the core is never tied to Supabase or Prisma.
- **Billing Integration:** Handles normalized billing events (`subscription.started`, `subscription.renewed`, `subscription.payment_failed`, `subscription.cancelled`, `subscription.expired`) passed from payment/webhook layers. Events carry an optional `eventId`; `handleBillingEvent` is idempotent — a repeated `eventId` is a no-op (verified by test).

---

## Quick Start

```ts
import { createSubscriptionCore } from '@module-hub/subscription';
import { createMockPlanRepository, createMockSubscriptionRepository } from '@module-hub/subscription/adapters';

const subscriptionCore = createSubscriptionCore(subscriptionRepo, planRepo);

// Check if tenant can use a feature
const allowed = await subscriptionCore.canUseFeature('tenant_123', 'ai_reply');

// Check numeric limits
const usage = await subscriptionCore.checkUsage({
  accountId: 'tenant_123',
  featureKey: 'max_staff',
  currentUsage: 4,
});
```

---

## Definition of Done

- [x] Plan contract & Entitlements dictionary (`null` = unlimited)
- [x] Subscription lifecycle status field + transitions for `trialing`→`active`, `active`↔`past_due`, `cancel_at_period_end`, `cancelled`, `expired` (event- or call-driven)
- [x] `subscription.payment_failed` transitions to `grace_period`; `gracePeriodDays` controls the deadline (default 3 days)
- [ ] Time-based expiry (e.g. auto-expiring when `currentPeriodEnd` or `gracePeriodEnd` passes) — not implemented; hosts must deliver the relevant billing event or enforce expiry separately
- [x] Entitlement engine (`canUseFeature`, `getLimit`, `checkUsage`)
- [x] Storage-agnostic repository interfaces (`SubscriptionRepository`, `PlanRepository`)
- [x] Billing event handler (`handleBillingEvent`), idempotent via `eventId`
- [x] Unit tests & typecheck passed — 39/39 tests (verified 2026-09-24; see Module Hub full sell-readiness audit)
- [x] `MODULE.md` and integration example

## Known Limitations (verified against code, not assumed)

- **No wall-clock expiry.** Billing events drive lifecycle changes; the module does not automatically transition a subscription when `currentPeriodEnd` or `gracePeriodEnd` passes.
- **Entitlement checks fail closed for `past_due` and terminal states.** `canUseFeature`/`getLimit` deny `past_due`, `expired`, and `cancelled`; `grace_period` is allowed only while `gracePeriodEnd` is a valid future `Date`.
