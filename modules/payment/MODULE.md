# Payment Core + Stripe Adapter Module

> Reusable payment abstraction layer separating business domain logic from payment provider SDKs.

- **Version:** 0.1.0
- **Status:** Implementation complete, unit-tested (mocked HTTP only) — never exercised against the live Stripe API. Treat as pilot-ready, not production-verified.
- **Priority:** P1 (SaaS Money Layer)

---

## Architecture

```text
Business Project
      ↓
Payment Core
      ↓
Payment Provider (Interface)
      ↓
Stripe Adapter
      ↓
Stripe API / SDK
```

- **Core Responsibilities:** Payment creation (`createPayment`), retrieval (`getPayment`), refunding (`refundPayment`), normalization of statuses and errors, integer minor-unit amount validation, idempotency enforcement. (No `verifyPayment` method exists — see note below.)
- **Provider Adapter:** Encapsulates Stripe API calls using standard Web `fetch` (100% compatible with Cloudflare Workers and Edge runtimes). Host injects secrets (`secretKey`), zero direct environment reads.
- **Webhook Integration:** Delegates HTTP listener & cryptographic signature verification to the Webhook Receiver Module. Provides `parsePaymentEvent()` to normalize verified raw Stripe webhook payloads.

---

## Quick Start

```ts
import { createPaymentCore, createStripeAdapter } from '@module-hub/payment';

const stripeAdapter = createStripeAdapter({
  secretKey: process.env.STRIPE_SECRET_KEY || 'sk_test_...',
  useCheckoutSession: true,
});

const paymentCore = createPaymentCore(
  {
    defaultCurrency: 'THB',
    supportedCurrencies: ['THB', 'USD'],
    minAmountMinorUnits: 1000, // 10.00 THB
  },
  stripeAdapter
);

const result = await paymentCore.createPayment({
  amount: 10000, // 100.00 THB (integer minor units)
  currency: 'THB',
  referenceId: 'order_123',
  idempotencyKey: 'idemp_order_123',
  // returnUrl/cancelUrl are REQUIRED here when useCheckoutSession is true
  // (the default) — the Stripe adapter throws INVALID_PAYMENT_REQUEST
  // without them. Omitted above only for brevity.
  returnUrl: 'https://example.com/checkout/success',
  cancelUrl: 'https://example.com/checkout/cancel',
});
```

---

## Definition of Done

- [x] Payment Core & Interface Contracts (`createPayment`, `getPayment`, `refundPayment` — no `verifyPayment`)
- [x] Integer minor-unit amount validation (`assertValidAmount`)
- [x] Idempotency key enforcement & pass-through (`idempotencyKey`)
- [x] Normalized 7 payment statuses
- [x] Structured error normalization (`PaymentError` with 17 error codes, incl. `INVALID_PAYMENT_REQUEST` which is not documented in DESIGN.md)
- [x] Stripe Adapter (Hosted Checkout + PaymentIntent flows via Web `fetch`) — real HTTP-calling implementation, not a stub
- [x] Stripe webhook event parser (`parsePaymentEvent`)
- [x] Mock adapter for unit testing
- [x] Unit tests (Vitest) — 24 tests passing across 6 files (verified 2026-08-22); `npm run typecheck` clean
- [x] Integration example & `MODULE.md`

### Verification notes (2026-08-22 audit)

- **Not verified against live Stripe:** all tests mock `fetch`; there is no `tests/adapters/stripe-adapter.integration.test.ts` (DESIGN.md calls for one but it was never created). The adapter's request/response shape has not been confirmed against the real Stripe API.
- **No dedicated `mock-adapter.test.ts`:** DESIGN.md's file structure and test plan list one, but it does not exist. The mock adapter is exercised indirectly through `tests/unit/service.test.ts`.
- **No "provider timeout" or "unsupported currency" service-level tests:** DESIGN.md's test table (`service.test.ts` → `unsupported currency`, `provider timeout`) is not implemented as such; timeout/currency-error behavior is covered only incidentally in `error.test.ts` / `stripe-adapter.test.ts`.
