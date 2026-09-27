/**
 * Notification Module — single-command runnable example.
 *
 * Run it with:
 *
 *   npm run example
 *
 * Self-contained by design: no network, no file system writes, no secrets and no
 * environment reads. Every input is a fixed literal, so the printed output is the
 * same on every run.
 *
 * Network isolation: global `fetch` is replaced by a local stub for the duration of
 * each scenario (the same technique the shipped test suite uses) and restored before
 * the process exits, so nothing is ever sent to a real endpoint.
 *
 * It exercises the module's real public surface through the module's documented
 * entry points:
 *   core/client.ts        createNotifier(config), NotificationClient — validate + inject
 *   providers/webhook.ts  WebhookProvider                           — sign, retry, HTTP status
 *   core/types.ts         NotificationEvent, NotificationProvider, NotificationResult (types)
 */

import { createNotifier, NotificationClient } from '../core/client.js';
import { WebhookProvider } from '../providers/webhook.js';
import type {
  NotificationEvent,
  NotificationProvider,
  NotificationResult,
} from '../core/types.js';

// Fixed, fake values. The module never reads configuration from the environment.
const WEBHOOK_URL = 'https://webhook.example.com/notify';
const SIGNING_SECRET = 'example-signing-secret';
const AUTH_HEADER = 'Bearer example-token';
const IDEMPOTENCY_KEY = 'booking-created-bk_123';

const EVENT: NotificationEvent = {
  type: 'booking.created',
  payload: { bookingId: 'bk_123', shopId: 'kmo' },
  idempotencyKey: IDEMPOTENCY_KEY,
  occurredAt: '2026-01-01T00:00:00.000Z',
};

type RecordedRequest = { url: string; headers: Record<string, string>; body: string };

/** Local fetch stub: records the outgoing request and replays the queued status codes. */
function installFetchStub(statusQueue: number[]): {
  calls: RecordedRequest[];
  restore: () => void;
} {
  const calls: RecordedRequest[] = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({ url: String(input), headers, body: String(init?.body ?? '') });

    const status = statusQueue.shift();
    if (status === undefined) {
      throw new Error('example stub: unexpected extra request');
    }
    return new Response(null, { status });
  }) as unknown as typeof fetch;

  return {
    calls,
    restore(): void {
      globalThis.fetch = originalFetch;
    },
  };
}

/** HMAC-SHA256 hex digest computed with the Web Crypto API, for signature verification. */
async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function main(): Promise<void> {
  // ── A) Validation and provider injection (injected provider, no transport) ──
  let injectedSendCalls = 0;
  const injectedProvider: NotificationProvider = {
    async send(): Promise<NotificationResult> {
      injectedSendCalls += 1;
      return { ok: true, statusCode: 200, attempts: 1 };
    },
  };

  const notifier = createNotifier({ provider: injectedProvider });
  const isClient = notifier instanceof NotificationClient;

  const invalid = await notifier.notify({ type: '   ', payload: { bookingId: 'bk_123' } });
  const valid = await notifier.notify(EVENT);

  console.log(
    `validation invalidCode=${invalid.error?.code} invalidAttempts=${invalid.attempts} ok=${valid.ok}`
  );
  console.log(`injection isClient=${isClient} sendCalls=${injectedSendCalls}`);

  // ── B) WebhookProvider over a local fetch stub (no network) ──
  const provider = new WebhookProvider({
    url: WEBHOOK_URL,
    secret: SIGNING_SECRET,
    timeoutMs: 1000,
    maxAttempts: 2,
    headers: { Authorization: AUTH_HEADER },
  });

  // B1) a single 200 response: signed request, custom header, idempotency header
  const success = installFetchStub([200]);
  let successResult: NotificationResult;
  try {
    successResult = await provider.send(EVENT);
  } finally {
    success.restore();
  }

  const sent = success.calls[0];
  const signatureMatched = sent.headers['X-Signature'] === (await hmacSha256Hex(SIGNING_SECRET, sent.body));
  const bodyMatched = sent.body === JSON.stringify(EVENT);

  console.log(
    `success ok=${successResult.ok} statusCode=${successResult.statusCode} attempts=${successResult.attempts}`
  );
  console.log(
    `transport contentType=${sent.headers['Content-Type']} idempotencyKey=${sent.headers['X-Idempotency-Key']} authHeader=${sent.headers['Authorization']}`
  );
  console.log(`signature matched=${signatureMatched} bodyMatched=${bodyMatched}`);

  // B2) 429 then 200: the provider retries and succeeds on the second attempt
  const retry = installFetchStub([429, 200]);
  let retryResult: NotificationResult;
  try {
    retryResult = await provider.send(EVENT);
  } finally {
    retry.restore();
  }
  console.log(
    `retry429 ok=${retryResult.ok} attempts=${retryResult.attempts} fetchCalls=${retry.calls.length}`
  );

  // B3) 400: a client error is not retried
  const rejected = installFetchStub([400]);
  let rejectedResult: NotificationResult;
  try {
    rejectedResult = await provider.send(EVENT);
  } finally {
    rejected.restore();
  }
  console.log(
    `rejected ok=${rejectedResult.ok} statusCode=${rejectedResult.statusCode} code=${rejectedResult.error?.code} fetchCalls=${rejected.calls.length}`
  );

  console.log(
    `EXAMPLE_RESULT: OK validations=2 invalidCode=${invalid.error?.code} delegatedSendCalls=${injectedSendCalls} signatureMatched=${signatureMatched} retryAttempts=${retryResult.attempts} remote4xxCode=${rejectedResult.error?.code}`
  );
}

await main();
