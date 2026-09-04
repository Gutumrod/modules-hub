# Payment Core + Stripe Adapter Module

**Version:** 0.1.0
**Status:** ✅ Completed
**Documentation Authority:** Current version/status follow `../REGISTRY.md`; this document describes the module contract/design for that registered version.

> Reusable payment abstraction layer separating business domain logic from payment provider SDKs.

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

- **Core Responsibilities:** Payment creation (`createPayment`), retrieval (`getPayment`), refunding (`refundPayment`), normalization of statuses and errors, integer minor-unit amount validation, idempotency enforcement.
- **Provider Adapter:** Encapsulates Stripe API calls using standard Web `fetch` (100% compatible with Cloudflare Workers and Edge runtimes). Host injects secrets (`secretKey`), zero direct environment reads.
- **Recurring Checkout Boundary:** `CreatePaymentRequest.recurringInterval` (`month` or `year`) switches Stripe Checkout to subscription mode and sends the recurring price interval. This only initiates provider checkout; subscription lifecycle, renewals, entitlements, invoices, and portfolio billing orchestration remain outside this module.
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
});
```

---

## Definition of Done

- [x] Payment Core & Interface Contracts
- [x] Integer minor-unit amount validation (`assertValidAmount`)
- [x] Idempotency key enforcement & pass-through (`idempotencyKey`)
- [x] Normalized 7 payment statuses
- [x] Structured error normalization (`PaymentError` with 16 error codes)
- [x] Stripe Adapter (Hosted Checkout + PaymentIntent flows via Web `fetch`)
- [x] Optional recurring Checkout initiation via `recurringInterval` (`month` / `year`)
- [x] Stripe webhook event parser (`parsePaymentEvent`)
- [x] Mock adapter for unit testing
- [x] Comprehensive unit tests (Vitest)
- [x] Integration example & `MODULE.md`
