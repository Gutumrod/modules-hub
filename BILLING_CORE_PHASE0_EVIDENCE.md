# Billing Core Phase 0 — Builder Evidence

Date: 2026-08-28
Repository: `Gutumrod/modules-hub`
Branch: `codex/billing-core-phase0`
**Current remediation commit / candidate vendor pin: `ecf03f9e4b5a41b5b8d96aa8c70bde3bf91caef7`**

The earlier implementation commit `c8fef32f37d13ff113f92cc37baf458f400d635b` was rejected by independent QA and must not be pinned. See the remediation section at the end of this file.

This evidence is committed separately after the implementation so that it can name an immutable code commit without a self-referential hash. The evidence commit does not change module code.

## Scope and outcome

Implemented only the subscription/payment module changes in the supplied 2026-08-27 brief. The root evidence file is the brief's explicit deliverable exception to the module-only scope. The canonical BILLING_CORE_PLAN.md Context and section 1 were read only; no product repository was edited. No dependency, lockfile, live service, Stripe account, API version, scaffold, or deployment was changed.

Builder gates passed: subscription typecheck + 36 tests, payment typecheck + 28 tests. Independent Qwen QA has NOT been performed; this is not final Phase 0 item 1 acceptance or real billing readiness.

## Changes

- `modules/subscription/core/types.ts`: optional Date `gracePeriodEnd`.
- `modules/subscription/core/engine.ts`: block past_due and existing terminal statuses; grace only while a valid Date is strictly later than now. All entitlement entrypoints share this guard.
- `modules/subscription/core/service.ts`: calendar month/year helper with end-of-month/leap-year clamping, monthly default, trial path preserved; failed payment starts configured grace with default three days. Existing last-event idempotency handling unchanged.
- `modules/subscription/tests/unit/subscription.test.ts`: 24 added cases covering all status outcomes, invalid/missing/exact-boundary deadlines, numeric entitlements and usage, calendar boundaries, annual/default intervals, trial preservation, grace config 0/3/7/default, duplicate-event deadline preservation, and deadline expiry. Two existing event tests updated to the intentionally changed grace_period contract.
- `modules/payment/core/types.ts`: optional monthly/yearly recurring interval.
- `modules/payment/adapters/stripe-adapter.ts`: recurring Checkout mode and inline recurring interval. Existing inline currency/amount/product fields and PaymentIntent branch preserved.
- `modules/payment/tests/adapters/stripe-adapter.test.ts`: four added cases inspect outgoing encoded requests for month/year/one-time Checkout and unchanged PaymentIntent behavior.

## Decisions and limitations

- Calendar arithmetic uses UTC and preserves UTC time/milliseconds. This avoids host-timezone/DST dependence; Jan 31 clamps to Feb 28/29 and Feb 29 annual clamps to Feb 28. It calculates a single interval, not a persistent original billing-anchor scheduler.
- Grace days mean 24-hour durations, consistent with existing trial math. Zero days is respected by nullish defaulting and blocks immediately. Broader configuration validation is outside the brief.
- Entitlement reads fail closed at the deadline; no expiry sweep is added. Existing last-event-only idempotency is retained, not upgraded into durable replay/concurrency handling. Distinct failure events still set their own deadline per the brief.
- No live Stripe call or real Checkout/browser/webhook lifecycle test was performed. HTTP fetch is mocked at the adapter boundary. Recurring request shape was cross-checked against [Stripe Create Checkout Session](https://docs.stripe.com/api/checkout/sessions/create).
- Existing Stripe version and card-only payment method configuration remain unchanged to preserve scope. Tax, invoice and other monetary policies are owner configuration outside this task; no automatic tax setting was enabled.
- A first payment typecheck caught use of URLSearchParams.keys without DOM.Iterable in the module's existing TS configuration. Tests were adjusted to use forEach; no tsconfig or dependency change was made.
- Diff audit before code commit: seven files, all within the two permitted modules; git diff --check passed. Git emitted existing LF-to-CRLF normalization notices, not test/compiler warnings.
- Additional timezone run: subscription suite passed 36/36 with TZ=America/New_York.

## Test-first evidence

Before production changes, the updated subscription suite failed 18/36 cases and payment failed 2/28 cases for expected assertion failures: leaked entitlements, 30-day period math, payment_failed producing past_due, and recurring Checkout producing payment mode. Existing behavior-preservation cases remained green. Final outputs below are complete tool-captured stdout/stderr, not summaries.

## subscription — final required gates

Working directory: `modules/subscription`
Command: `npm run typecheck`
Exit code: 0

```text

> @module-hub/subscription@0.1.0 typecheck
> tsc --noEmit

```

Working directory: `modules/subscription`
Command: `npm test`
Exit code: 0

```text

> @module-hub/subscription@0.1.0 test
> vitest run


 RUN  v2.1.9 D:/AI-Workspace/projects/modules-hub/modules/subscription

 ✓ tests/unit/subscription.test.ts (36 tests) 14ms

 Test Files  1 passed (1)
      Tests  36 passed (36)
   Start at  23:02:39
   Duration  629ms (transform 160ms, setup 0ms, collect 168ms, tests 14ms, environment 0ms, prepare 229ms)

```

## payment — final required gates

Working directory: `modules/payment`
Command: `npm run typecheck`
Exit code: 0

```text

> @module-hub/payment@0.1.0 typecheck
> tsc --noEmit

```

Working directory: `modules/payment`
Command: `npm test`
Exit code: 0

```text

> @module-hub/payment@0.1.0 test
> vitest run


 RUN  v2.1.9 D:/AI-Workspace/projects/modules-hub/modules/payment

 ✓ tests/unit/error.test.ts (2 tests) 3ms
 ✓ tests/unit/idempotency.test.ts (2 tests) 3ms
 ✓ tests/unit/state.test.ts (1 test) 4ms
 ✓ tests/adapters/stripe-adapter.test.ts (13 tests) 13ms
 ✓ tests/unit/amount.test.ts (5 tests) 4ms
 ✓ tests/unit/service.test.ts (5 tests) 4ms

 Test Files  6 passed (6)
      Tests  28 passed (28)
   Start at  23:02:39
   Duration  641ms (transform 589ms, setup 0ms, collect 837ms, tests 31ms, environment 3ms, prepare 927ms)

```

## Handoff to independent Qwen QA

Use a clean checkout of the implementation commit above (or this evidence-only descendant) and rerun npm run typecheck and npm test in both modules. Independently inspect grace fail-closed boundaries, month/year clamping, and encoded Checkout fields. Compare against this evidence. Do not mark Phase 0 item 1 complete until that separate QA passes. Branch push does not merge main or authorize live billing.

## Independent QA failure and builder remediation — 2026-08-29

The original implementation pin `c8fef32f37d13ff113f92cc37baf458f400d635b` was rejected by an independent requirements-based QA pass. The reviewer reproduced a HIGH-severity non-consecutive replay defect: `payment_failed(A) -> renewed/cancelled(B) -> replay A` was accepted because only `lastProcessedEventId` was remembered. A cancelled subscription could return to grace and regain entitlement. The locked first-pass report and its temporary adversarial tests remain outside this repository at `D:\AI-Workspace\agents\codex\qa-worktrees\modules-hub-billing-phase0-20260829\`.

Remediation commit `ecf03f9e4b5a41b5b8d96aa8c70bde3bf91caef7` supersedes the rejected pin:

- `SubscriptionRepository.saveForBillingEvent(subscription, eventId)` now defines the durable atomic boundary. A real adapter must insert the globally unique provider event ID into a processed-event ledger and persist subscription state in one transaction; duplicate claims return `false` without changing state.
- The core invokes hooks only after that atomic save succeeds. `lastProcessedEventId` remains latest-event metadata and is no longer treated as the durable ledger.
- The mock adapter implements the contract with a processed-ID set and returns cloned reads so a rejected candidate mutation cannot leak into stored state.
- Three regression tests cover `A -> B -> A`, cancelled-entitlement reactivation, and concurrent duplicate delivery. The first two were observed failing against the rejected implementation before production remediation. The concurrent test also guards the new atomic repository contract.
- `modules/subscription/DESIGN.md` documents the adapter transaction requirement.

This is builder remediation evidence only. The independent FAIL is not overwritten, and the remediation has **not** received independent re-review. Do not treat Phase 0 item 1 as accepted until a fresh reviewer verifies this new target commit.

### subscription remediation gates

Working directory: `modules/subscription`
Command: `npm run typecheck`
Exit code: 0

```text

> @module-hub/subscription@0.1.0 typecheck
> tsc --noEmit

```

Working directory: `modules/subscription`
Command: `npm test`
Exit code: 0

```text

> @module-hub/subscription@0.1.0 test
> vitest run


 RUN  v2.1.9 D:/AI-Workspace/projects/modules-hub/modules/subscription

 ✓ tests/unit/subscription.test.ts (39 tests) 19ms

 Test Files  1 passed (1)
      Tests  39 passed (39)
   Start at  09:21:23
   Duration  631ms (transform 189ms, setup 0ms, collect 190ms, tests 19ms, environment 0ms, prepare 199ms)

```

### payment regression gates

Working directory: `modules/payment`
Command: `npm run typecheck`
Exit code: 0

```text

> @module-hub/payment@0.1.0 typecheck
> tsc --noEmit

```

Working directory: `modules/payment`
Command: `npm test`
Exit code: 0

```text

> @module-hub/payment@0.1.0 test
> vitest run


 RUN  v2.1.9 D:/AI-Workspace/projects/modules-hub/modules/payment

 ✓ tests/unit/state.test.ts (1 test) 4ms
 ✓ tests/unit/idempotency.test.ts (2 tests) 3ms
 ✓ tests/unit/error.test.ts (2 tests) 5ms
 ✓ tests/unit/amount.test.ts (5 tests) 8ms
 ✓ tests/adapters/stripe-adapter.test.ts (13 tests) 14ms
 ✓ tests/unit/service.test.ts (5 tests) 3ms

 Test Files  6 passed (6)
      Tests  28 passed (28)
   Start at  09:21:23
   Duration  697ms (transform 418ms, setup 0ms, collect 641ms, tests 37ms, environment 1ms, prepare 938ms)

```


