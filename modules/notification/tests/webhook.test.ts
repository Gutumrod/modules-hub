/**
 * modules/notification/tests/webhook.test.ts
 * รันด้วย: npm test (vitest)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebhookProvider } from '../providers/webhook';
import { createNotifier, NotificationClient } from '../core/client';
import type { NotificationProvider, NotificationEvent, NotificationResult } from '../core/types';

const WEBHOOK_URL = 'https://webhook.example.com/notify';

const baseConfig = {
  url: WEBHOOK_URL,
  secret: 'test-secret',
  timeoutMs: 5000,
  maxAttempts: 3,
};

// ──────────────────────────────────────────────
// Helper: HMAC-SHA256 hex digest using Web Crypto
// ──────────────────────────────────────────────
async function expectedHmac(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ──────────────────────────────────────────────
// Helper: fetch mock that resolves with a Response
// ──────────────────────────────────────────────
function mockFetchResponse(status: number): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue(new Response(null, { status }));
}

// ══════════════════════════════════════════════
// A) Core / client behavior
// ══════════════════════════════════════════════
describe('Core / client behavior', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('empty/whitespace event type -> provider.send NOT called, result.ok false, code INVALID_EVENT', async () => {
    const provider: NotificationProvider = {
      send: vi.fn().mockResolvedValue({ ok: true, attempts: 1 } satisfies NotificationResult),
    };
    const notifier = createNotifier({ provider });

    const result = await notifier.notify({
      type: '   ',
      payload: { id: 1 },
    });

    expect(provider.send).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('INVALID_EVENT');
  });

  it('payload is a string -> provider.send NOT called, result.ok false, code INVALID_EVENT', async () => {
    const provider: NotificationProvider = {
      send: vi.fn().mockResolvedValue({ ok: true, attempts: 1 } satisfies NotificationResult),
    };
    const notifier = createNotifier({ provider });

    const result = await notifier.notify({
      type: 'booking.created',
      payload: 'not-an-object' as unknown as Record<string, unknown>,
    });

    expect(provider.send).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('INVALID_EVENT');
  });

  it('payload is non-JSON-serializable (BigInt) -> provider.send NOT called, code INVALID_EVENT', async () => {
    const provider: NotificationProvider = {
      send: vi.fn().mockResolvedValue({ ok: true, attempts: 1 } satisfies NotificationResult),
    };
    const notifier = createNotifier({ provider });

    const result = await notifier.notify({
      type: 'booking.created',
      payload: { big: BigInt(123) } as unknown as Record<string, unknown>,
    });

    expect(provider.send).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('INVALID_EVENT');
  });

  it('provider injection: createNotifier({ provider }) delegates notify() to the injected provider', async () => {
    const mockSend = vi.fn().mockResolvedValue({ ok: true, attempts: 1 } satisfies NotificationResult);
    const provider: NotificationProvider = { send: mockSend };
    const notifier = createNotifier({ provider });

    const event: NotificationEvent = { type: 'booking.created', payload: { id: 42 } };
    const result = await notifier.notify(event);

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith(event);
    expect(result.ok).toBe(true);
  });
});

// ══════════════════════════════════════════════
// B) WebhookProvider success & headers
// ══════════════════════════════════════════════
describe('WebhookProvider — success & headers', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('200 success -> result.ok true, attempts 1', async () => {
    (fetch as any).mockResolvedValue(new Response(null, { status: 200 }));

    const provider = new WebhookProvider(baseConfig);
    const result = await provider.send({ type: 'booking.created', payload: { id: 1 } });

    expect(result.ok).toBe(true);
    expect(result.attempts).toBe(1);
  });

  it('custom headers merged into request', async () => {
    (fetch as any).mockResolvedValue(new Response(null, { status: 200 }));

    const provider = new WebhookProvider({
      ...baseConfig,
      headers: { Authorization: 'Bearer xxx' },
    });

    await provider.send({ type: 'booking.created', payload: { id: 1 } });

    const [, options] = (fetch as any).mock.calls[0];
    expect(options.headers.Authorization).toBe('Bearer xxx');
  });

  it('no secret configured -> request succeeds and NO X-Signature header', async () => {
    (fetch as any).mockResolvedValue(new Response(null, { status: 200 }));

    const provider = new WebhookProvider({
      url: WEBHOOK_URL,
      timeoutMs: 5000,
      maxAttempts: 1,
    });

    await provider.send({ type: 'booking.created', payload: { id: 1 } });

    const [, options] = (fetch as any).mock.calls[0];
    expect(options.headers['X-Signature']).toBeUndefined();
  });

  it('secret configured -> X-Signature equals exact HMAC-SHA256 hex of JSON body', async () => {
    (fetch as any).mockResolvedValue(new Response(null, { status: 200 }));

    const secret = 'test-secret';
    const provider = new WebhookProvider({ url: WEBHOOK_URL, secret, timeoutMs: 5000, maxAttempts: 1 });
    const event: NotificationEvent = { type: 'booking.created', payload: { id: 1 } };
    await provider.send(event);

    const [, options] = (fetch as any).mock.calls[0];
    const expected = await expectedHmac(secret, JSON.stringify(event));
    expect(options.headers['X-Signature']).toBe(expected);
  });

  it('idempotencyKey provided -> X-Idempotency-Key header equals it', async () => {
    (fetch as any).mockResolvedValue(new Response(null, { status: 200 }));

    const provider = new WebhookProvider({ url: WEBHOOK_URL, timeoutMs: 5000, maxAttempts: 1 });
    const idempotencyKey = 'booking-created-bk_123';
    await provider.send({ type: 'booking.created', payload: { id: 1 }, idempotencyKey });

    const [, options] = (fetch as any).mock.calls[0];
    expect(options.headers['X-Idempotency-Key']).toBe(idempotencyKey);
  });
});

// ══════════════════════════════════════════════
// C) Retry / status handling
// ══════════════════════════════════════════════
describe('WebhookProvider — retry / status handling', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('400 -> no retry (fetch called once), ok false, statusCode 400, code REMOTE_4XX', async () => {
    (fetch as any).mockResolvedValue(new Response(null, { status: 400 }));

    const provider = new WebhookProvider(baseConfig);
    const result = await provider.send({ type: 'booking.created', payload: {} });

    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(400);
    expect(result.error?.code).toBe('REMOTE_4XX');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('401 -> no retry (fetch called once)', async () => {
    (fetch as any).mockResolvedValue(new Response(null, { status: 401 }));

    const provider = new WebhookProvider(baseConfig);
    const result = await provider.send({ type: 'booking.created', payload: {} });

    expect(result.ok).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('403 -> no retry (fetch called once)', async () => {
    (fetch as any).mockResolvedValue(new Response(null, { status: 403 }));

    const provider = new WebhookProvider(baseConfig);
    const result = await provider.send({ type: 'booking.created', payload: {} });

    expect(result.ok).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('429 -> retry, succeeds on 2nd attempt (fetch called twice, ok true)', async () => {
    (fetch as any)
      .mockResolvedValueOnce(new Response(null, { status: 429 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    const provider = new WebhookProvider(baseConfig);
    const result = await provider.send({ type: 'booking.created', payload: {} });

    expect(result.ok).toBe(true);
    expect(result.attempts).toBe(2);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('500 -> retry, succeeds on 2nd attempt', async () => {
    (fetch as any)
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    const provider = new WebhookProvider(baseConfig);
    const result = await provider.send({ type: 'booking.created', payload: {} });

    expect(result.ok).toBe(true);
    expect(result.attempts).toBe(2);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('503 -> retry, still fails after maxAttempts (ok false, attempts === maxAttempts)', async () => {
    (fetch as any).mockResolvedValue(new Response(null, { status: 503 }));

    const provider = new WebhookProvider(baseConfig);
    const result = await provider.send({ type: 'booking.created', payload: {} });

    expect(result.ok).toBe(false);
    expect(result.attempts).toBe(baseConfig.maxAttempts);
    expect(fetch).toHaveBeenCalledTimes(baseConfig.maxAttempts);
  });

  it('network failure (fetch rejects with TypeError) -> retry, succeeds on 2nd attempt', async () => {
    (fetch as any)
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    const provider = new WebhookProvider(baseConfig);
    const result = await provider.send({ type: 'booking.created', payload: {} });

    expect(result.ok).toBe(true);
    expect(result.attempts).toBe(2);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('real timeout: fetch hangs, AbortSignal fires -> ok false, code TIMEOUT', async () => {
    // fetch mock: returns a promise that rejects with AbortError when the signal aborts
    (fetch as any).mockImplementation((_url: string, options: RequestInit) => {
      return new Promise((_resolve, reject) => {
        const signal = options.signal as AbortSignal;
        if (signal.aborted) {
          reject(new DOMException('Aborted', 'AbortError'));
          return;
        }
        signal.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    });

    const provider = new WebhookProvider({
      url: WEBHOOK_URL,
      secret: 'test-secret',
      timeoutMs: 50,
      maxAttempts: 1,
    });

    const result = await provider.send({ type: 'booking.created', payload: { id: 1 } });

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('TIMEOUT');
  });

  it('maxAttempts respected: maxAttempts 2 with persistent 500s -> fetch called exactly 2 times, attempts === 2', async () => {
    (fetch as any).mockResolvedValue(new Response(null, { status: 500 }));

    const provider = new WebhookProvider({
      url: WEBHOOK_URL,
      timeoutMs: 5000,
      maxAttempts: 2,
    });
    const result = await provider.send({ type: 'booking.created', payload: {} });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.attempts).toBe(2);
    expect(result.ok).toBe(false);
  });
});

// ══════════════════════════════════════════════
// D) URL / HTTPS validation
// ══════════════════════════════════════════════
describe('WebhookProvider — URL / HTTPS validation', () => {
  it('http:// URL throws at construction by default (error mentions https)', () => {
    expect(() => new WebhookProvider({ url: 'http://webhook.example.com/notify' })).toThrow(/https/);
  });

  it('http:// URL is allowed when allowInsecureHttp: true (no throw)', () => {
    expect(
      () => new WebhookProvider({ url: 'http://webhook.example.com/notify', allowInsecureHttp: true }),
    ).not.toThrow();
  });

  it('https:// URL constructs fine', () => {
    expect(() => new WebhookProvider({ url: WEBHOOK_URL })).not.toThrow();
  });
});

// ══════════════════════════════════════════════
// E) Security
// ══════════════════════════════════════════════
describe('WebhookProvider — security', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('secret is NOT leaked in error message/result when request fails', async () => {
    (fetch as any).mockResolvedValue(new Response(null, { status: 500 }));

    const secret = 'super-secret-do-not-leak';
    const provider = new WebhookProvider({
      url: WEBHOOK_URL,
      secret,
      timeoutMs: 5000,
      maxAttempts: 1,
    });

    const result = await provider.send({ type: 'booking.created', payload: {} });

    expect(result.ok).toBe(false);
    const resultStr = JSON.stringify(result);
    expect(resultStr).not.toContain(secret);
    if (result.error?.message) {
      expect(result.error.message).not.toContain(secret);
    }
  });

  it('custom Authorization header value is NOT leaked in error message/result when request fails', async () => {
    (fetch as any).mockResolvedValue(new Response(null, { status: 500 }));

    const authToken = 'Bearer secret-auth-token-xxx';
    const provider = new WebhookProvider({
      url: WEBHOOK_URL,
      timeoutMs: 5000,
      maxAttempts: 1,
      headers: { Authorization: authToken },
    });

    const result = await provider.send({ type: 'booking.created', payload: {} });

    expect(result.ok).toBe(false);
    const resultStr = JSON.stringify(result);
    expect(resultStr).not.toContain(authToken);
    if (result.error?.message) {
      expect(result.error.message).not.toContain(authToken);
    }
  });
});