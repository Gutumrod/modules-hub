import { describe, it, expect, vi } from 'vitest';
import { createStripeAdapter } from '../../adapters/stripe-adapter.js';
import { PaymentError } from '../../core/index.js';

const checkoutRequest = {
  amount: 15000,
  currency: 'THB',
  referenceId: 'ord_1',
  idempotencyKey: 'idem_1',
  returnUrl: 'https://merchant.test/success?session_id={CHECKOUT_SESSION_ID}',
  cancelUrl: 'https://merchant.test/cancel',
};

function stripeResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function createMockFetch(body: unknown) {
  return vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => stripeResponse(body));
}

describe('Stripe Adapter Event Parsing', () => {
  const adapter = createStripeAdapter({ secretKey: 'sk_test_mock' });

  it('should parse payment_intent.succeeded webhook event', () => {
    const rawEvent = {
      id: 'evt_123',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_123',
          status: 'succeeded',
          amount: 15000,
          currency: 'thb',
          metadata: { orderId: 'ord_1' },
        },
      },
    };

    const result = adapter.parsePaymentEvent(rawEvent);
    expect(result.success).toBe(true);
    expect(result.event?.eventType).toBe('payment.succeeded');
    expect(result.event?.status).toBe('succeeded');
    expect(result.event?.amount).toBe(15000);
    expect(result.event?.currency).toBe('THB');
    expect(result.event?.paymentId).toBe('pi_123');
  });

  it('should parse checkout.session.completed webhook event', () => {
    const rawEvent = {
      id: 'evt_456',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_123',
          payment_intent: 'pi_456',
          status: 'complete',
          amount_total: 20000,
          currency: 'usd',
        },
      },
    };

    const result = adapter.parsePaymentEvent(rawEvent);
    expect(result.success).toBe(true);
    expect(result.event?.eventType).toBe('payment.succeeded');
    expect(result.event?.status).toBe('succeeded');
    expect(result.event?.amount).toBe(20000);
    expect(result.event?.currency).toBe('USD');
  });

  it('should return PaymentError when event currency is missing', () => {
    const rawEvent = {
      id: 'evt_missing_currency',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_missing_currency',
          status: 'succeeded',
          amount: 15000,
        },
      },
    };

    const result = adapter.parsePaymentEvent(rawEvent);
    expect(result.success).toBe(false);
    expect(result.error).toBeInstanceOf(PaymentError);
    expect(result.error?.code).toBe('UNSUPPORTED_CURRENCY');
    expect(result.event).toBeUndefined();
  });
});

describe('Stripe Adapter Checkout Creation', () => {
  it('should reject missing returnUrl', async () => {
    const fetch = createMockFetch({ id: 'cs_123', url: 'https://checkout.stripe.test/cs_123' });
    const adapter = createStripeAdapter({ secretKey: 'sk_test_mock', fetch });

    await expect(adapter.createPayment({ ...checkoutRequest, returnUrl: undefined })).rejects.toMatchObject({
      name: 'PaymentError',
      code: 'INVALID_PAYMENT_REQUEST',
      provider: 'stripe',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('should reject missing cancelUrl', async () => {
    const fetch = createMockFetch({ id: 'cs_123', url: 'https://checkout.stripe.test/cs_123' });
    const adapter = createStripeAdapter({ secretKey: 'sk_test_mock', fetch });

    await expect(adapter.createPayment({ ...checkoutRequest, cancelUrl: '   ' })).rejects.toMatchObject({
      name: 'PaymentError',
      code: 'INVALID_PAYMENT_REQUEST',
      provider: 'stripe',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('should serialize supplied checkout URLs without example.com fallback', async () => {
    const fetch = createMockFetch({
      id: 'cs_123',
      url: 'https://checkout.stripe.test/cs_123',
      status: 'open',
      payment_intent: 'pi_123',
    });
    const adapter = createStripeAdapter({ secretKey: 'sk_test_mock', fetch });

    await adapter.createPayment(checkoutRequest);

    expect(fetch).toHaveBeenCalledOnce();
    const [, init] = fetch.mock.calls[0];
    const body = String(init?.body);
    expect(body).toContain(`success_url=${encodeURIComponent(checkoutRequest.returnUrl)}`);
    expect(body).toContain(`cancel_url=${encodeURIComponent(checkoutRequest.cancelUrl)}`);
    expect(body).not.toContain('example.com');
  });
});

describe('Stripe Adapter Provider Currency Validation', () => {
  it('should reject checkout-session lookup when currency is missing', async () => {
    const adapter = createStripeAdapter({
      secretKey: 'sk_test_mock',
      fetch: createMockFetch({ id: 'cs_123', status: 'complete', payment_status: 'paid', amount_total: 15000 }),
    });

    await expect(adapter.getPayment('cs_123')).rejects.toMatchObject({
      name: 'PaymentError',
      code: 'UNSUPPORTED_CURRENCY',
      provider: 'stripe',
    });
  });

  it('should reject payment-intent lookup when currency is blank', async () => {
    const adapter = createStripeAdapter({
      secretKey: 'sk_test_mock',
      fetch: createMockFetch({ id: 'pi_123', status: 'succeeded', amount: 15000, currency: ' ' }),
    });

    await expect(adapter.getPayment('pi_123')).rejects.toMatchObject({
      name: 'PaymentError',
      code: 'UNSUPPORTED_CURRENCY',
      provider: 'stripe',
    });
  });

  it('should reject refund when currency is missing', async () => {
    const adapter = createStripeAdapter({
      secretKey: 'sk_test_mock',
      fetch: createMockFetch({ id: 're_123', amount: 15000 }),
    });

    await expect(adapter.refundPayment({ paymentId: 'pi_123', idempotencyKey: 'idem_refund_1' })).rejects.toMatchObject({
      name: 'PaymentError',
      code: 'UNSUPPORTED_CURRENCY',
      provider: 'stripe',
    });
  });
});

describe('Stripe recurring Checkout', () => {
  it.each(['month', 'year', undefined] as const)('serializes interval %s without changing inline prices', async (recurringInterval) => {
    const fetch = createMockFetch({ id: 'cs_recurring', url: 'https://checkout.stripe.test/cs_recurring', status: 'open' });
    const adapter = createStripeAdapter({ secretKey: 'sk_test_mock', fetch });
    await adapter.createPayment({ ...checkoutRequest, recurringInterval });
    const [url, init] = fetch.mock.calls[0];
    const body = new URLSearchParams(String(init?.body));
    expect(url).toBe('https://api.stripe.com/v1/checkout/sessions');
    expect(body.get('mode')).toBe(recurringInterval ? 'subscription' : 'payment');
    expect(body.get('line_items[0][price_data][recurring][interval]')).toBe(recurringInterval ?? null);
    if (!recurringInterval) body.forEach((_value, key) => expect(key).not.toContain('recurring'));
    expect(body.get('line_items[0][price_data][currency]')).toBe('thb');
    expect(body.get('line_items[0][price_data][unit_amount]')).toBe('15000');
    expect(body.get('line_items[0][price_data][product_data][name]')).toBe('Reference: ord_1');
  });

  it('leaves PaymentIntent mode unchanged even with a recurring interval', async () => {
    const fetch = createMockFetch({ id: 'pi_123', status: 'requires_payment_method', client_secret: 'mock' });
    const adapter = createStripeAdapter({ secretKey: 'sk_test_mock', fetch, useCheckoutSession: false });
    await adapter.createPayment({ ...checkoutRequest, recurringInterval: 'month' });
    const [url, init] = fetch.mock.calls[0];
    const body = new URLSearchParams(String(init?.body));
    expect(url).toBe('https://api.stripe.com/v1/payment_intents');
    expect(body.get('amount')).toBe('15000');
    expect(body.has('mode')).toBe(false);
    body.forEach((_value, key) => expect(key).not.toContain('recurring'));
  });
});
