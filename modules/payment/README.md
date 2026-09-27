# @module-hub/payment

Provider-neutral payment core with a Stripe adapter. See [MODULE.md](./MODULE.md) and [DESIGN.md](./DESIGN.md) for contracts and integration boundaries.

## Security note (0.1.1)

Refunding a Checkout Session ID (`cs_...`) first retrieves the session and requires a paid session with a PaymentIntent; refunds use that PaymentIntent ID. Stripe webhook parsing rejects missing event or payment IDs and does not synthesize identifiers. The host webhook receiver remains responsible for signature verification. Tests use mocked Stripe responses only; live Stripe test-mode verification and independent review remain required before production use.
