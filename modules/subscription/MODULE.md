# Subscription + Entitlement Module

> Decouples SaaS business subscription lifecycle states and feature permission checks from billing providers (such as Stripe).

- **Version:** 0.1.0
- **Status:** Experimental / Pilot Ready — core lifecycle + entitlement checks work and are tested; grace-period automation is NOT implemented (see Known Limitations)
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

- **Core Responsibilities:** Manages subscription lifecycle status field (`trialing`, `active`, `past_due`, `grace_period`, `cancel_at_period_end`, `cancelled`, `expired`), plan mapping, and entitlement evaluation (`canUseFeature`, `getLimit`, `checkUsage`). `grace_period` is a valid value of the `SubscriptionStatus` type, but **no code path in `core/service.ts` ever sets it automatically** — see Known Limitations.
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
- [ ] `grace_period` state — type exists, but nothing ever transitions a subscription into or out of it automatically (not implemented, not a state machine)
- [ ] Configurable grace period duration (`SubscriptionCoreConfig.gracePeriodDays`) — accepted in the config object but unused; the read is commented out in `core/service.ts:37`
- [ ] Time-based expiry (e.g. auto-expiring when `currentPeriodEnd` passes) — not implemented; status only changes in response to explicit `handleBillingEvent`/`cancelSubscription` calls
- [x] Entitlement engine (`canUseFeature`, `getLimit`, `checkUsage`)
- [x] Storage-agnostic repository interfaces (`SubscriptionRepository`, `PlanRepository`)
- [x] Billing event handler (`handleBillingEvent`), idempotent via `eventId`
- [x] Unit tests & typecheck passed — 12/12 tests passing (`npx vitest run`), `tsc --noEmit` clean, verified 2026-08-22
- [x] `MODULE.md` and integration example

## Known Limitations (verified against code, not assumed)

- **No automatic grace period.** `SubscriptionStatus` includes `'grace_period'` and `DESIGN.md` describes a `past_due` → `grace_period` → `expired` flow, but `core/service.ts` never produces that transition. `handleBillingEvent('subscription.payment_failed')` only sets `past_due`; nothing later moves it to `grace_period` or `expired` on its own. `SubscriptionCoreConfig.gracePeriodDays` is plumbed through the type but not read (`core/service.ts:37` is commented out).
- **Billing interval is ignored on creation.** `createSubscription` always sets `currentPeriodEnd` to `now + 30 days` (or the trial length), regardless of the plan's `billingInterval` (`month`/`year`). A `year` plan is not given a year-long period.
- **`canUseFeature`/`getLimit` only block on `expired`/`cancelled`.** A subscription manually left in `past_due` or (if ever set) `grace_period` still resolves entitlements normally — there is no explicit rule for those states in `core/engine.ts`.
