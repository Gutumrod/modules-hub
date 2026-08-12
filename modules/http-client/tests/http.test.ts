import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHttpClient } from '../core/client.js';
import { HttpError } from '../core/error.js';
import {
  DEFAULT_RETRY_POLICY,
  mergeRetryPolicy,
  canRetryMethod,
  isRetryableStatus,
  retryDelayMs,
  parseRetryAfterMs,
  assertRetryAfterWithinLimit,
  sleep,
} from '../core/retry.js';
import { createTimeoutControl, normalizeAbortError } from '../core/timeout.js';
import { parseResponseData, errorBodyText } from '../core/parsing.js';
import { cleanRecord, redactHeaders, validateUrlPolicy, extractProviderRequestId } from '../core/security.js';
import { createFetchTransport } from '../adapters/fetch-transport.js';
import type {
  HttpTransport,
  TransportRequest,
  TransportResponse,
  HttpClientConfig,
  HttpRequest,
} from '../core/types.js';

// ---------------------------------------------------------------------------
// Helpers / Fakes
// ---------------------------------------------------------------------------

class FakeHttpTransport implements HttpTransport {
  public calls: TransportRequest[] = [];
  private scripts: Array<
    | { kind: 'response'; response: TransportResponse }
    | { kind: 'error'; error: unknown }
    | { kind: 'timeout'; delayMs: number; response?: TransportResponse }
  > = [];

  respond(response: TransportResponse): this {
    this.scripts.push({ kind: 'response', response });
    return this;
  }

  fail(error: unknown): this {
    this.scripts.push({ kind: 'error', error });
    return this;
  }

  delay(delayMs: number, response: TransportResponse): this {
    this.scripts.push({ kind: 'timeout', delayMs, response });
    return this;
  }

  async send(request: TransportRequest): Promise<TransportResponse> {
    this.calls.push(request);
    const script = this.scripts.shift();
    if (!script) {
      throw new Error('FakeHttpTransport: no more scripted responses');
    }

    if (request.signal?.aborted) {
      throw new DOMException('The operation was aborted.', 'AbortError');
    }

    if (script.kind === 'response') {
      return script.response;
    }
    if (script.kind === 'error') {
      throw script.error;
    }

    return new Promise<TransportResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (request.signal?.aborted) {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        } else {
          resolve(script.response!);
        }
      }, script.delayMs);
      request.signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        },
        { once: true }
      );
    });
  }
}

function jsonResponse(status: number, data: unknown, headers: Record<string, string> = {}): TransportResponse {
  return { status, headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(data) };
}

function textResponse(status: number, body: string, headers: Record<string, string> = {}): TransportResponse {
  return { status, headers, body };
}

function noBodyResponse(status: number, headers: Record<string, string> = {}): TransportResponse {
  return { status, headers, body: null };
}

function makeClient(transport: FakeHttpTransport, config: Partial<HttpClientConfig> = {}): ReturnType<typeof createHttpClient> {
  return createHttpClient({ transport, ...config });
}

function assertHttpError(promise: Promise<unknown>, code: string, causeCode?: string): Promise<HttpError> {
  return promise.then(
    () => { throw new Error(`Expected HttpError ${code} but request succeeded`); },
    (e: unknown) => {
      expect(e).toBeInstanceOf(HttpError);
      expect((e as HttpError).code).toBe(code);
      if (causeCode !== undefined) {
        expect((e as HttpError).cause).toBeInstanceOf(HttpError);
        expect(((e as HttpError).cause as HttpError).code).toBe(causeCode);
      }
      return e as HttpError;
    }
  );
}

// ---------------------------------------------------------------------------
// (a) HttpClient verb helpers + default transport wiring
// ---------------------------------------------------------------------------

describe('HttpClient verb helpers', () => {
  it('get() sends GET request and returns parsed JSON', async () => {
    const t = new FakeHttpTransport().respond(jsonResponse(200, { ok: true }));
    const client = makeClient(t);
    const res = await client.get<{ ok: boolean }>('https://api.example.com/data');
    expect(t.calls[0].method).toBe('GET');
    expect(t.calls[0].url).toBe('https://api.example.com/data');
    expect(res.status).toBe(200);
    expect(res.ok).toBe(true);
    expect(res.data).toEqual({ ok: true });
  });

  it('post() sends POST with body', async () => {
    const t = new FakeHttpTransport().respond(jsonResponse(201, { id: 1 }));
    const client = makeClient(t);
    const res = await client.post<{ id: number }>('https://api.example.com/items', { name: 'x' });
    expect(t.calls[0].method).toBe('POST');
    expect(t.calls[0].body).toEqual({ name: 'x' });
    expect(res.status).toBe(201);
    expect(res.data).toEqual({ id: 1 });
  });

  it('put() sends PUT with body', async () => {
    const t = new FakeHttpTransport().respond(jsonResponse(200, { updated: true }));
    const client = makeClient(t);
    const res = await client.put('https://api.example.com/items/1', { name: 'y' });
    expect(t.calls[0].method).toBe('PUT');
    expect(t.calls[0].body).toEqual({ name: 'y' });
    expect(res.data).toEqual({ updated: true });
  });

  it('patch() sends PATCH with body', async () => {
    const t = new FakeHttpTransport().respond(jsonResponse(200, { patched: true }));
    const client = makeClient(t);
    const res = await client.patch('https://api.example.com/items/1', { status: 'active' });
    expect(t.calls[0].method).toBe('PATCH');
    expect(t.calls[0].body).toEqual({ status: 'active' });
    expect(res.data).toEqual({ patched: true });
  });

  it('delete() sends DELETE without body', async () => {
    const t = new FakeHttpTransport().respond(noBodyResponse(204));
    const client = makeClient(t);
    const res = await client.delete('https://api.example.com/items/1');
    expect(t.calls[0].method).toBe('DELETE');
    expect(t.calls[0].body).toBeUndefined();
    expect(res.status).toBe(204);
    expect(res.ok).toBe(true);
  });

  it('request() forwards custom method', async () => {
    const t = new FakeHttpTransport().respond(noBodyResponse(200));
    const client = makeClient(t);
    await client.request({ url: 'https://api.example.com/health', method: 'HEAD' });
    expect(t.calls[0].method).toBe('HEAD');
  });

  it('default transport is createFetchTransport when none provided', () => {
    const client = createHttpClient();
    expect(client).toBeDefined();
    expect(typeof client.get).toBe('function');
  });

  it('passes headers through to transport', async () => {
    const t = new FakeHttpTransport().respond(jsonResponse(200, {}));
    const client = makeClient(t);
    await client.get('https://api.example.com/data', { headers: { 'x-custom': 'val' } });
    expect(t.calls[0].headers['x-custom']).toBe('val');
  });

  it('uses defaultTimeoutMs from config when request omits timeoutMs', async () => {
    const t = new FakeHttpTransport();
    t.delay(50, jsonResponse(200, {})).delay(50, jsonResponse(200, {})).delay(50, jsonResponse(200, {}));
    const client = makeClient(t, { defaultTimeoutMs: 10 });
    const err = await assertHttpError(client.get('https://api.example.com/slow'), 'HTTP_RETRY_EXHAUSTED', 'HTTP_TIMEOUT');
    expect(t.calls).toHaveLength(3);
    expect(err.status).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// (b) Happy-path 2xx response parsing (json / text / raw / 204)
// ---------------------------------------------------------------------------

describe('2xx response parsing', () => {
  it('parses JSON body by default', async () => {
    const t = new FakeHttpTransport().respond(jsonResponse(200, { hello: 'world' }));
    const client = makeClient(t);
    const res = await client.get('https://api.example.com/');
    expect(res.data).toEqual({ hello: 'world' });
  });

  it('returns string for responseType text', async () => {
    const t = new FakeHttpTransport().respond(textResponse(200, 'plain text'));
    const client = makeClient(t);
    const res = await client.get<string>('https://api.example.com/', { responseType: 'text' });
    expect(res.data).toBe('plain text');
  });

  it('returns raw body for responseType raw', async () => {
    const t = new FakeHttpTransport().respond(textResponse(200, 'raw-body'));
    const client = makeClient(t);
    const res = await client.request<string>({ url: 'https://api.example.com/', method: 'GET', responseType: 'raw' });
    expect(res.data).toBe('raw-body');
  });

  it('returns undefined data for 204', async () => {
    const t = new FakeHttpTransport().respond(noBodyResponse(204));
    const client = makeClient(t);
    const res = await client.get('https://api.example.com/');
    expect(res.data).toBeUndefined();
  });

  it('returns undefined data for empty body on 200', async () => {
    const t = new FakeHttpTransport().respond(textResponse(200, ''));
    const client = makeClient(t);
    const res = await client.get('https://api.example.com/');
    expect(res.data).toBeUndefined();
  });

  it('parses ArrayBuffer body as JSON', async () => {
    const t = new FakeHttpTransport().respond({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: new TextEncoder().encode(JSON.stringify({ buf: true })).buffer,
    });
    const client = makeClient(t);
    const res = await client.get('https://api.example.com/');
    expect(res.data).toEqual({ buf: true });
  });

  it('parses ReadableStream body as JSON', async () => {
    const t = new FakeHttpTransport().respond({
      status: 200,
      headers: {},
      body: new Response(JSON.stringify({ streamed: true })).body,
    });
    const client = makeClient(t);
    const res = await client.get('https://api.example.com/');
    expect(res.data).toEqual({ streamed: true });
  });

  it('extracts provider request id into response.requestId', async () => {
    const t = new FakeHttpTransport().respond(jsonResponse(200, {}, { 'x-request-id': 'req-123' }));
    const client = makeClient(t);
    const res = await client.get('https://api.example.com/');
    expect(res.requestId).toBe('req-123');
  });

  it('returns clean headers from response', async () => {
    const t = new FakeHttpTransport().respond(jsonResponse(200, {}, { 'x-foo': 'bar' }));
    const client = makeClient(t);
    const res = await client.get('https://api.example.com/');
    expect(res.headers['x-foo']).toBe('bar');
  });
});

// ---------------------------------------------------------------------------
// (c) Timeout behavior
// ---------------------------------------------------------------------------

describe('timeout behavior', () => {
  it('throws HTTP_TIMEOUT (via HTTP_RETRY_EXHAUSTED cause) when transport exceeds timeoutMs', async () => {
    const t = new FakeHttpTransport();
    t.delay(50, jsonResponse(200, {})).delay(50, jsonResponse(200, {})).delay(50, jsonResponse(200, {}));
    const client = makeClient(t, { defaultTimeoutMs: 10000 });
    const err = await assertHttpError(
      client.get('https://api.example.com/slow', { timeoutMs: 10, retry: { maxAttempts: 3, initialDelayMs: 1 } }),
      'HTTP_RETRY_EXHAUSTED',
      'HTTP_TIMEOUT'
    );
    expect(err.cause).toBeInstanceOf(HttpError);
    expect((err.cause as HttpError).retryable).toBe(true);
  });

  it('retries on timeout then exhausts -> HTTP_RETRY_EXHAUSTED', async () => {
    const t = new FakeHttpTransport();
    t.delay(100, jsonResponse(200, {})).delay(100, jsonResponse(200, {})).delay(100, jsonResponse(200, {}));
    const client = makeClient(t);
    const err = await assertHttpError(
      client.get('https://api.example.com/slow', {
        timeoutMs: 10,
        retry: { maxAttempts: 3, initialDelayMs: 1 },
      }),
      'HTTP_RETRY_EXHAUSTED',
      'HTTP_TIMEOUT'
    );
    expect(t.calls).toHaveLength(3);
  });

  it('succeeds after a timeout retry on the next attempt', async () => {
    const t = new FakeHttpTransport();
    t.delay(100, jsonResponse(200, {})).respond(jsonResponse(200, { recovered: true }));
    const client = makeClient(t);
    const res = await client.get('https://api.example.com/flaky', {
      timeoutMs: 10,
      retry: { maxAttempts: 3, initialDelayMs: 1 },
    });
    expect(res.data).toEqual({ recovered: true });
  });
});

// ---------------------------------------------------------------------------
// (d) Retry policy
// ---------------------------------------------------------------------------

describe('retry policy', () => {
  it('retries on 500 and succeeds on second attempt', async () => {
    const t = new FakeHttpTransport();
    t.respond(jsonResponse(500, { err: 'fail' })).respond(jsonResponse(200, { ok: true }));
    const client = makeClient(t);
    const res = await client.get('https://api.example.com/retry', {
      retry: { maxAttempts: 3, initialDelayMs: 1 },
    });
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ ok: true });
    expect(t.calls).toHaveLength(2);
  });

  it('exhausts retries on persistent 503 -> HTTP_RETRY_EXHAUSTED', async () => {
    const t = new FakeHttpTransport();
    t.respond(noBodyResponse(503)).respond(noBodyResponse(503)).respond(noBodyResponse(503));
    const client = makeClient(t);
    const err = await assertHttpError(
      client.get('https://api.example.com/down', { retry: { maxAttempts: 3, initialDelayMs: 1 } }),
      'HTTP_RETRY_EXHAUSTED'
    );
    expect(err.status).toBe(503);
    expect(t.calls).toHaveLength(3);
  });

  it('non-idempotent POST does not retry by default (maxAttempts forced to 1)', async () => {
    const t = new FakeHttpTransport().respond(noBodyResponse(500));
    const client = makeClient(t);
    const err = await assertHttpError(
      client.post('https://api.example.com/create', { a: 1 }, { retry: { maxAttempts: 3, initialDelayMs: 1 } }),
      'HTTP_RETRY_EXHAUSTED',
      'HTTP_SERVER_ERROR'
    );
    expect(t.calls).toHaveLength(1);
    expect((err.cause as HttpError).status).toBe(500);
  });

  it('non-idempotent POST retries when allowUnsafeRetries=true', async () => {
    const t = new FakeHttpTransport();
    t.respond(noBodyResponse(500)).respond(jsonResponse(200, { ok: true }));
    const client = makeClient(t);
    const res = await client.post('https://api.example.com/create', { a: 1 }, {
      retry: { maxAttempts: 3, initialDelayMs: 1, allowUnsafeRetries: true },
    });
    expect(res.status).toBe(200);
    expect(t.calls).toHaveLength(2);
  });

  it('non-retryable 404 -> HTTP_CLIENT_ERROR immediately', async () => {
    const t = new FakeHttpTransport().respond(textResponse(404, 'Not Found'));
    const client = makeClient(t);
    const err = await assertHttpError(
      client.get('https://api.example.com/missing'),
      'HTTP_CLIENT_ERROR'
    );
    expect(err.status).toBe(404);
    expect(err.retryable).toBe(false);
    expect(t.calls).toHaveLength(1);
  });

  it('429 is retryable and retries', async () => {
    const t = new FakeHttpTransport();
    t.respond(noBodyResponse(429)).respond(jsonResponse(200, { ok: true }));
    const client = makeClient(t);
    const res = await client.get('https://api.example.com/limited', {
      retry: { maxAttempts: 3, initialDelayMs: 1 },
    });
    expect(res.status).toBe(200);
    expect(t.calls).toHaveLength(2);
  });

  it('Retry-After header is considered in retry delay', async () => {
    const t = new FakeHttpTransport();
    t.respond({ status: 503, headers: { 'retry-after': '1' }, body: null }).respond(jsonResponse(200, { ok: true }));
    const client = makeClient(t);
    const res = await client.get('https://api.example.com/backoff', {
      retry: { maxAttempts: 2, initialDelayMs: 1, maxDelayMs: 5000 },
    });
    expect(res.status).toBe(200);
    expect(t.calls).toHaveLength(2);
  });

  it('Retry-After > maxRetryAfterMs on 429 -> retried then HTTP_RETRY_EXHAUSTED with cause HTTP_RATE_LIMITED', async () => {
    const t = new FakeHttpTransport();
    t.respond({ status: 429, headers: { 'retry-after': '99999' }, body: null })
      .respond({ status: 429, headers: { 'retry-after': '99999' }, body: null })
      .respond({ status: 429, headers: { 'retry-after': '99999' }, body: null });
    const client = makeClient(t);
    const err = await assertHttpError(
      client.get('https://api.example.com/rate', {
        retry: { maxAttempts: 3, initialDelayMs: 1, maxRetryAfterMs: 5000 },
      }),
      'HTTP_RETRY_EXHAUSTED',
      'HTTP_RATE_LIMITED'
    );
    expect(t.calls).toHaveLength(3);
  });

  it('Retry-After > maxRetryAfterMs on 503 -> retried then HTTP_RETRY_EXHAUSTED with cause HTTP_SERVER_ERROR', async () => {
    const t = new FakeHttpTransport();
    t.respond({ status: 503, headers: { 'retry-after': '99999' }, body: null })
      .respond({ status: 503, headers: { 'retry-after': '99999' }, body: null })
      .respond({ status: 503, headers: { 'retry-after': '99999' }, body: null });
    const client = makeClient(t);
    const err = await assertHttpError(
      client.get('https://api.example.com/svc', {
        retry: { maxAttempts: 3, initialDelayMs: 1, maxRetryAfterMs: 5000 },
      }),
      'HTTP_RETRY_EXHAUSTED',
      'HTTP_SERVER_ERROR'
    );
    expect(t.calls).toHaveLength(3);
  });

  it('custom retryableStatusCodes controls which statuses retry', async () => {
    const t = new FakeHttpTransport();
    t.respond(textResponse(400, 'bad')).respond(jsonResponse(200, {}));
    const client = makeClient(t);
    const res = await client.get('https://api.example.com/custom', {
      retry: { maxAttempts: 2, initialDelayMs: 1, retryableStatusCodes: [400] },
    });
    expect(res.status).toBe(200);
    expect(t.calls).toHaveLength(2);
  });

  it('respectRetryAfter=false ignores Retry-After header', async () => {
    const t = new FakeHttpTransport();
    t.respond({
      status: 503,
      headers: { 'retry-after': '99999' },
      body: null,
    }).respond(jsonResponse(200, { ok: true }));
    const client = makeClient(t);
    const res = await client.get('https://api.example.com/ignore-ra', {
      retry: { maxAttempts: 2, initialDelayMs: 1, respectRetryAfter: false },
    });
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// (e) Error normalization + structured error codes
// ---------------------------------------------------------------------------

describe('error normalization and codes', () => {
  it('HTTP_NETWORK_ERROR on transport throw (non-abort) wrapped as HTTP_RETRY_EXHAUSTED when maxAttempts=1', async () => {
    const t = new FakeHttpTransport().fail(new TypeError('fetch failed'));
    const client = makeClient(t);
    const err = await assertHttpError(
      client.get('https://api.example.com/net', { retry: { maxAttempts: 1 } }),
      'HTTP_RETRY_EXHAUSTED',
      'HTTP_NETWORK_ERROR'
    );
    expect((err.cause as HttpError).retryable).toBe(true);
    expect((err.cause as HttpError).url).toBe('https://api.example.com/net');
    expect((err.cause as HttpError).method).toBe('GET');
  });

  it('HTTP_NETWORK_ERROR retries then exhausts -> HTTP_RETRY_EXHAUSTED', async () => {
    const t = new FakeHttpTransport();
    t.fail(new TypeError('fail')).fail(new TypeError('fail')).fail(new TypeError('fail'));
    const client = makeClient(t);
    const err = await assertHttpError(
      client.get('https://api.example.com/net2', { retry: { maxAttempts: 3, initialDelayMs: 1 } }),
      'HTTP_RETRY_EXHAUSTED',
      'HTTP_NETWORK_ERROR'
    );
    expect(t.calls).toHaveLength(3);
  });

  it('HTTP_ABORTED on external signal abort (not retried)', async () => {
    const controller = new AbortController();
    const t = new FakeHttpTransport().delay(500, jsonResponse(200, {}));
    const client = makeClient(t);
    setTimeout(() => controller.abort(), 10);
    const err = await assertHttpError(
      client.get('https://api.example.com/abort', { signal: controller.signal }),
      'HTTP_ABORTED'
    );
    expect(err.retryable).toBe(false);
  });

  it('HTTP_INVALID_URL on malformed URL', async () => {
    const t = new FakeHttpTransport().respond(jsonResponse(200, {}));
    const client = makeClient(t);
    const err = await assertHttpError(client.get('not-a-url'), 'HTTP_INVALID_URL');
    expect(err.retryable).toBe(false);
  });

  it('HTTP_INVALID_URL on disallowed protocol', async () => {
    const t = new FakeHttpTransport().respond(jsonResponse(200, {}));
    const client = makeClient(t, { urlPolicy: { allowedProtocols: ['https:'] } });
    await assertHttpError(client.get('http://api.example.com/'), 'HTTP_INVALID_URL');
  });

  it('HTTP_INVALID_URL on blocked host', async () => {
    const t = new FakeHttpTransport().respond(jsonResponse(200, {}));
    const client = makeClient(t, { urlPolicy: { blockedHosts: ['evil.com'] } });
    await assertHttpError(client.get('https://evil.com/'), 'HTTP_INVALID_URL');
  });

  it('HTTP_INVALID_URL on disallowed host', async () => {
    const t = new FakeHttpTransport().respond(jsonResponse(200, {}));
    const client = makeClient(t, { urlPolicy: { allowedHosts: ['api.example.com'] } });
    await assertHttpError(client.get('https://other.com/'), 'HTTP_INVALID_URL');
  });

  it('HTTP_INVALID_RESPONSE on invalid JSON in 2xx body', async () => {
    const t = new FakeHttpTransport().respond(textResponse(200, '{bad json'));
    const client = makeClient(t);
    const err = await assertHttpError(client.get('https://api.example.com/badjson'), 'HTTP_INVALID_RESPONSE');
    expect(err.retryable).toBe(false);
  });

  it('HTTP_CLIENT_ERROR on 4xx (non-429)', async () => {
    const t = new FakeHttpTransport().respond(textResponse(403, 'Forbidden'));
    const client = makeClient(t);
    const err = await assertHttpError(client.get('https://api.example.com/forbidden'), 'HTTP_CLIENT_ERROR');
    expect(err.status).toBe(403);
    expect(err.retryable).toBe(false);
  });

  it('HTTP_SERVER_ERROR on 500 with maxAttempts=1 wrapped as HTTP_RETRY_EXHAUSTED', async () => {
    const t = new FakeHttpTransport().respond(textResponse(500, 'Server Error'));
    const client = makeClient(t);
    const err = await assertHttpError(
      client.get('https://api.example.com/err', { retry: { maxAttempts: 1 } }),
      'HTTP_RETRY_EXHAUSTED',
      'HTTP_SERVER_ERROR'
    );
    expect((err.cause as HttpError).status).toBe(500);
    expect((err.cause as HttpError).retryable).toBe(true);
  });

  it('HTTP_RATE_LIMITED on 429 with Retry-After exceeding limit (wrapped as HTTP_RETRY_EXHAUSTED)', async () => {
    const t = new FakeHttpTransport().respond({
      status: 429,
      headers: { 'retry-after': '99999' },
      body: null,
    });
    const client = makeClient(t);
    const err = await assertHttpError(
      client.get('https://api.example.com/rl', { retry: { maxAttempts: 1, maxRetryAfterMs: 1000 } }),
      'HTTP_RETRY_EXHAUSTED',
      'HTTP_RATE_LIMITED'
    );
    expect((err.cause as HttpError).status).toBe(429);
  });

  it('HttpError carries url, method, and cause', async () => {
    const t = new FakeHttpTransport().fail(new TypeError('network down'));
    const client = makeClient(t);
    const err = await assertHttpError(
      client.get('https://api.example.com/cause', { retry: { maxAttempts: 1 } }),
      'HTTP_RETRY_EXHAUSTED',
      'HTTP_NETWORK_ERROR'
    );
    expect(err.url).toBe('https://api.example.com/cause');
    expect(err.method).toBe('GET');
    expect((err.cause as HttpError).cause).toBeInstanceOf(TypeError);
  });

  it('error message includes truncated body text', async () => {
    const longBody = 'x'.repeat(3000);
    const t = new FakeHttpTransport().respond(textResponse(500, longBody));
    const client = makeClient(t);
    const err = await assertHttpError(
      client.get('https://api.example.com/long', { retry: { maxAttempts: 1 } }),
      'HTTP_RETRY_EXHAUSTED',
      'HTTP_SERVER_ERROR'
    );
    expect((err.cause as HttpError).message).toContain('500');
    expect((err.cause as HttpError).message.length).toBeLessThan(longBody.length);
  });

  it('DOMException TimeoutError from transport normalized to HTTP_TIMEOUT via isAbortLike', async () => {
    const t = new FakeHttpTransport().fail(new DOMException('timeout', 'TimeoutError'));
    const client = makeClient(t);
    const err = await assertHttpError(
      client.get('https://api.example.com/timeout-like', { retry: { maxAttempts: 1 } }),
      'HTTP_RETRY_EXHAUSTED',
      'HTTP_TIMEOUT'
    );
    expect((err.cause as HttpError).retryable).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// (f) Adapter interface / fetch-transport
// ---------------------------------------------------------------------------

describe('fetch-transport adapter', () => {
  it('string body passes through without JSON.stringify', async () => {
    const fakeFetch = vi.fn().mockResolvedValue(
      new Response('ok', { status: 200, headers: { 'content-type': 'text/plain' } })
    );
    const transport = createFetchTransport({ fetch: fakeFetch as unknown as typeof globalThis.fetch });
    await transport.send({
      url: 'https://api.example.com/',
      method: 'POST',
      headers: {},
      body: 'hello',
    });
    expect(fakeFetch).toHaveBeenCalledTimes(1);
    const init = fakeFetch.mock.calls[0][1] as RequestInit;
    expect(init.body).toBe('hello');
  });

  it('object body gets JSON.stringify and content-type application/json', async () => {
    const fakeFetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    const transport = createFetchTransport({ fetch: fakeFetch as unknown as typeof globalThis.fetch });
    await transport.send({
      url: 'https://api.example.com/',
      method: 'POST',
      headers: {},
      body: { key: 'val' },
    });
    const init = fakeFetch.mock.calls[0][1] as RequestInit;
    expect(init.body).toBe(JSON.stringify({ key: 'val' }));
    const headers = init.headers as Headers;
    expect(headers.get('content-type')).toBe('application/json');
  });

  it('does not override existing content-type', async () => {
    const fakeFetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    const transport = createFetchTransport({ fetch: fakeFetch as unknown as typeof globalThis.fetch });
    await transport.send({
      url: 'https://api.example.com/',
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: { key: 'val' },
    });
    const headers = fakeFetch.mock.calls[0][1].headers as Headers;
    expect(headers.get('content-type')).toBe('text/plain');
  });

  it('ArrayBuffer body passes through', async () => {
    const fakeFetch = vi.fn().mockResolvedValue(new Response('', { status: 200 }));
    const transport = createFetchTransport({ fetch: fakeFetch as unknown as typeof globalThis.fetch });
    const buf = new TextEncoder().encode('abc').buffer;
    await transport.send({
      url: 'https://api.example.com/',
      method: 'POST',
      headers: {},
      body: buf,
    });
    const init = fakeFetch.mock.calls[0][1] as RequestInit;
    expect(init.body).toBe(buf);
  });

  it('undefined body results in no body set', async () => {
    const fakeFetch = vi.fn().mockResolvedValue(new Response('', { status: 200 }));
    const transport = createFetchTransport({ fetch: fakeFetch as unknown as typeof globalThis.fetch });
    await transport.send({
      url: 'https://api.example.com/',
      method: 'GET',
      headers: {},
    });
    const init = fakeFetch.mock.calls[0][1] as RequestInit;
    expect(init.body).toBeUndefined();
  });

  it('flattens response headers into a record', async () => {
    const fakeFetch = vi.fn().mockResolvedValue(
      new Response('ok', { status: 200, headers: { 'x-custom': 'val', 'x-other': 'two' } })
    );
    const transport = createFetchTransport({ fetch: fakeFetch as unknown as typeof globalThis.fetch });
    const res = await transport.send({ url: 'https://api.example.com/', method: 'GET', headers: {} });
    expect(res.headers['x-custom']).toBe('val');
    expect(res.headers['x-other']).toBe('two');
  });

  it('returns status and rawResponse from fetch Response', async () => {
    const fakeFetch = vi.fn().mockResolvedValue(new Response('ok', { status: 201 }));
    const transport = createFetchTransport({ fetch: fakeFetch as unknown as typeof globalThis.fetch });
    const res = await transport.send({ url: 'https://api.example.com/', method: 'GET', headers: {} });
    expect(res.status).toBe(201);
    expect(res.rawResponse).toBeDefined();
  });

  it('fetch failure propagates as HTTP_NETWORK_ERROR through pipeline (wrapped as HTTP_RETRY_EXHAUSTED)', async () => {
    const fakeFetch = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    const transport = createFetchTransport({ fetch: fakeFetch as unknown as typeof globalThis.fetch });
    const client = createHttpClient({ transport });
    await assertHttpError(
      client.get('https://api.example.com/fail', { retry: { maxAttempts: 1 } }),
      'HTTP_RETRY_EXHAUSTED',
      'HTTP_NETWORK_ERROR'
    );
  });

  it('forwards signal to fetch', async () => {
    const fakeFetch = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    const transport = createFetchTransport({ fetch: fakeFetch as unknown as typeof globalThis.fetch });
    const controller = new AbortController();
    await transport.send({
      url: 'https://api.example.com/',
      method: 'GET',
      headers: {},
      signal: controller.signal,
    });
    const init = fakeFetch.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBe(controller.signal);
  });

  it('Blob body passes through without JSON.stringify', async () => {
    const fakeFetch = vi.fn().mockResolvedValue(new Response('', { status: 200 }));
    const transport = createFetchTransport({ fetch: fakeFetch as unknown as typeof globalThis.fetch });
    const blob = new Blob(['blob-data']);
    await transport.send({
      url: 'https://api.example.com/',
      method: 'POST',
      headers: {},
      body: blob,
    });
    const init = fakeFetch.mock.calls[0][1] as RequestInit;
    expect(init.body).toBe(blob);
  });
});

// ---------------------------------------------------------------------------
// (g) Security (header redaction, provider request id, cleanRecord)
// ---------------------------------------------------------------------------

describe('security: header redaction', () => {
  it('redacts standard sensitive headers', () => {
    const result = redactHeaders({
      authorization: 'Bearer token',
      cookie: 'session=abc',
      'set-cookie': 'foo=bar',
      'x-api-key': 'secret',
      'proxy-authorization': 'Basic xyz',
      'x-custom': 'visible',
    });
    expect(result.authorization).toBe('[REDACTED]');
    expect(result.cookie).toBe('[REDACTED]');
    expect(result['set-cookie']).toBe('[REDACTED]');
    expect(result['x-api-key']).toBe('[REDACTED]');
    expect(result['proxy-authorization']).toBe('[REDACTED]');
    expect(result['x-custom']).toBe('visible');
  });

  it('redacts custom sensitiveHeaders (case-insensitive)', () => {
    const result = redactHeaders(
      { 'X-Trace-Id': '123', 'x-custom': 'val' },
      ['X-TRACE-ID']
    );
    expect(result['X-Trace-Id']).toBe('[REDACTED]');
    expect(result['x-custom']).toBe('val');
  });

  it('onRequest hook receives redacted sensitive headers', async () => {
    const t = new FakeHttpTransport().respond(jsonResponse(200, {}));
    const seen: Record<string, string>[] = [];
    const client = makeClient(t, {
      hooks: {
        onRequest: (info) => { seen.push(info.headers); },
      },
    });
    await client.get('https://api.example.com/', { headers: { authorization: 'Bearer secret' } });
    expect(seen[0].authorization).toBe('[REDACTED]');
  });

  it('onResponse hook receives redacted response headers', async () => {
    const t = new FakeHttpTransport().respond(jsonResponse(200, {}, { 'set-cookie': 'foo=bar' }));
    const seen: Record<string, string>[] = [];
    const client = makeClient(t, {
      hooks: {
        onResponse: (info) => { seen.push(info.headers); },
      },
    });
    await client.get('https://api.example.com/');
    expect(seen[0]['set-cookie']).toBe('[REDACTED]');
  });

  it('cleanRecord drops __proto__, constructor, prototype', () => {
    const input = { a: 1, __proto__: { evil: true }, constructor: 'bad', prototype: 'bad', b: 2 };
    const result = cleanRecord(input as Record<string, number>);
    expect(result.a).toBe(1);
    expect(result.b).toBe(2);
    expect(result.__proto__).toBeUndefined();
    expect(result.constructor).toBeUndefined();
    expect(result.prototype).toBeUndefined();
  });

  it('cleanRecord returns null-prototype object', () => {
    const result = cleanRecord({ a: 1 });
    expect(Object.getPrototypeOf(result)).toBe(null);
  });

  it('cleanRecord with no input returns empty null-prototype object', () => {
    const result = cleanRecord();
    expect(Object.getPrototypeOf(result)).toBe(null);
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('extractProviderRequestId finds x-request-id', () => {
    expect(extractProviderRequestId({ 'x-request-id': 'abc' })).toBe('abc');
  });

  it('extractProviderRequestId finds x-correlation-id', () => {
    expect(extractProviderRequestId({ 'x-correlation-id': 'corr-1' })).toBe('corr-1');
  });

  it('extractProviderRequestId finds cf-ray', () => {
    expect(extractProviderRequestId({ 'cf-ray': 'ray-1' })).toBe('ray-1');
  });

  it('extractProviderRequestId finds x-amzn-requestid', () => {
    expect(extractProviderRequestId({ 'x-amzn-requestid': 'amz-1' })).toBe('amz-1');
  });

  it('extractProviderRequestId finds x-github-request-id', () => {
    expect(extractProviderRequestId({ 'x-github-request-id': 'gh-1' })).toBe('gh-1');
  });

  it('extractProviderRequestId returns undefined when none present', () => {
    expect(extractProviderRequestId({ 'content-type': 'application/json' })).toBeUndefined();
  });

  it('extractProviderRequestId returns first match when multiple present', () => {
    const result = extractProviderRequestId({ 'x-request-id': 'first', 'x-correlation-id': 'second' });
    expect(result).toBe('first');
  });

  it('validateUrlPolicy allows valid https URL with no policy', () => {
    const url = validateUrlPolicy('https://api.example.com/', undefined, 'GET');
    expect(url.hostname).toBe('api.example.com');
  });

  it('validateUrlPolicy allows URL matching allowedHosts', () => {
    const url = validateUrlPolicy('https://api.example.com/', { allowedHosts: ['api.example.com'] }, 'GET');
    expect(url.hostname).toBe('api.example.com');
  });

  it('validateUrlPolicy allows URL matching allowedProtocols', () => {
    const url = validateUrlPolicy('http://api.example.com/', { allowedProtocols: ['http:'] }, 'GET');
    expect(url.protocol).toBe('http:');
  });

  it('validateUrlPolicy throws on invalid URL string', () => {
    expect(() => validateUrlPolicy(':::not-a-url', undefined, 'GET')).toThrow(HttpError);
  });
});

// ---------------------------------------------------------------------------
// (h) Logging hooks
// ---------------------------------------------------------------------------

describe('logging hooks', () => {
  it('onRequest called with sanitized request info', async () => {
    const t = new FakeHttpTransport().respond(jsonResponse(200, {}));
    const calls: { url: string; method: string }[] = [];
    const client = makeClient(t, {
      hooks: { onRequest: (info) => { calls.push({ url: info.url, method: info.method }); } },
    });
    await client.get('https://api.example.com/hook');
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.example.com/hook');
    expect(calls[0].method).toBe('GET');
  });

  it('onResponse called with status and durationMs', async () => {
    const t = new FakeHttpTransport().respond(jsonResponse(200, {}));
    const calls: { status: number; durationMs: number }[] = [];
    const client = makeClient(t, {
      hooks: { onResponse: (info) => { calls.push({ status: info.status, durationMs: info.durationMs }); } },
    });
    await client.get('https://api.example.com/hook');
    expect(calls).toHaveLength(1);
    expect(calls[0].status).toBe(200);
    expect(calls[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  it('onError called with HttpError and sanitized request', async () => {
    const t = new FakeHttpTransport().respond(textResponse(404, 'Not Found'));
    const errors: HttpError[] = [];
    const client = makeClient(t, {
      hooks: { onError: (err) => { errors.push(err); } },
    });
    await client.get('https://api.example.com/err').catch(() => {});
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe('HTTP_CLIENT_ERROR');
  });

  it('onError called on HTTP_RETRY_EXHAUSTED', async () => {
    const t = new FakeHttpTransport();
    t.fail(new TypeError('fail')).fail(new TypeError('fail')).fail(new TypeError('fail'));
    const errors: HttpError[] = [];
    const client = makeClient(t, {
      hooks: { onError: (err) => { errors.push(err); } },
    });
    await client.get('https://api.example.com/exhaust', { retry: { maxAttempts: 3, initialDelayMs: 1 } }).catch(() => {});
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe('HTTP_RETRY_EXHAUSTED');
  });

  it('hook exception is swallowed and does not break request', async () => {
    const t = new FakeHttpTransport().respond(jsonResponse(200, { ok: true }));
    const client = makeClient(t, {
      hooks: {
        onRequest: () => { throw new Error('hook boom'); },
        onResponse: () => { throw new Error('hook boom'); },
      },
    });
    const res = await client.get('https://api.example.com/swallow');
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ ok: true });
  });

  it('onError hook exception is swallowed', async () => {
    const t = new FakeHttpTransport().respond(textResponse(404, 'nf'));
    const client = makeClient(t, {
      hooks: { onError: () => { throw new Error('onError boom'); } },
    });
    await assertHttpError(client.get('https://api.example.com/'), 'HTTP_CLIENT_ERROR');
  });

  it('onRequest receives metadata from request', async () => {
    const t = new FakeHttpTransport().respond(jsonResponse(200, {}));
    const metadatas: Record<string, unknown>[] = [];
    const client = makeClient(t, {
      hooks: { onRequest: (info) => { metadatas.push(info.metadata ?? {}); } },
    });
    await client.get('https://api.example.com/', { metadata: { traceId: 't1' } });
    expect(metadatas[0]).toEqual({ traceId: 't1' });
  });
});

// ---------------------------------------------------------------------------
// (i) Core unit functions
// ---------------------------------------------------------------------------

describe('retryDelayMs', () => {
  it('exponential backoff: attempt 1 = initialDelayMs', () => {
    expect(retryDelayMs(1, DEFAULT_RETRY_POLICY)).toBe(200);
  });

  it('exponential backoff: attempt 2 = initialDelayMs * multiplier', () => {
    expect(retryDelayMs(2, DEFAULT_RETRY_POLICY)).toBe(400);
  });

  it('exponential backoff: attempt 3 = initialDelayMs * multiplier^2', () => {
    expect(retryDelayMs(3, DEFAULT_RETRY_POLICY)).toBe(800);
  });

  it('capped at maxDelayMs', () => {
    expect(retryDelayMs(20, DEFAULT_RETRY_POLICY)).toBe(5000);
  });

  it('uses retryAfter header when present and larger than exponential', () => {
    expect(retryDelayMs(1, DEFAULT_RETRY_POLICY, '5')).toBe(5000);
  });

  it('uses exponential when larger than retryAfter', () => {
    expect(retryDelayMs(5, DEFAULT_RETRY_POLICY, '1')).toBe(3200);
  });

  it('ignores retryAfter when respectRetryAfter=false', () => {
    const policy = { ...DEFAULT_RETRY_POLICY, respectRetryAfter: false };
    expect(retryDelayMs(1, policy, '999')).toBe(200);
  });

  it('attempt 0 treated as attempt 1 (Math.max(0, -1))', () => {
    expect(retryDelayMs(0, DEFAULT_RETRY_POLICY)).toBe(200);
  });
});

describe('parseRetryAfterMs', () => {
  it('integer seconds -> ms', () => {
    expect(parseRetryAfterMs('5')).toBe(5000);
  });

  it('zero seconds -> 0', () => {
    expect(parseRetryAfterMs('0')).toBe(0);
  });

  it('HTTP date format -> ms diff from now', () => {
    const future = new Date(Date.now() + 10000).toUTCString();
    const result = parseRetryAfterMs(future);
    expect(result).toBeGreaterThan(5000);
    expect(result).toBeLessThan(15000);
  });

  it('undefined -> undefined', () => {
    expect(parseRetryAfterMs(undefined)).toBeUndefined();
  });

  it('empty string -> undefined', () => {
    expect(parseRetryAfterMs('')).toBeUndefined();
  });

  it('non-integer non-date -> undefined', () => {
    expect(parseRetryAfterMs('not-a-date')).toBeUndefined();
  });

  it('negative integer falls through to Date.parse (valid past date) -> 0', () => {
    expect(parseRetryAfterMs('-5')).toBe(0);
  });

  it('float seconds falls through to Date.parse (valid past date) -> 0', () => {
    expect(parseRetryAfterMs('1.5')).toBe(0);
  });
});

describe('canRetryMethod', () => {
  it('GET is retryable', () => {
    expect(canRetryMethod('GET', DEFAULT_RETRY_POLICY)).toBe(true);
  });

  it('HEAD is retryable', () => {
    expect(canRetryMethod('HEAD', DEFAULT_RETRY_POLICY)).toBe(true);
  });

  it('OPTIONS is retryable', () => {
    expect(canRetryMethod('OPTIONS', DEFAULT_RETRY_POLICY)).toBe(true);
  });

  it('POST is not retryable by default', () => {
    expect(canRetryMethod('POST', DEFAULT_RETRY_POLICY)).toBe(false);
  });

  it('PUT is not retryable by default', () => {
    expect(canRetryMethod('PUT', DEFAULT_RETRY_POLICY)).toBe(false);
  });

  it('DELETE is not retryable by default', () => {
    expect(canRetryMethod('DELETE', DEFAULT_RETRY_POLICY)).toBe(false);
  });

  it('POST is retryable when allowUnsafeRetries=true', () => {
    expect(canRetryMethod('POST', { ...DEFAULT_RETRY_POLICY, allowUnsafeRetries: true })).toBe(true);
  });

  it('lowercase methods are normalized', () => {
    expect(canRetryMethod('get', DEFAULT_RETRY_POLICY)).toBe(true);
  });
});

describe('isRetryableStatus', () => {
  it('500 is retryable', () => {
    expect(isRetryableStatus(500, DEFAULT_RETRY_POLICY)).toBe(true);
  });

  it('429 is retryable', () => {
    expect(isRetryableStatus(429, DEFAULT_RETRY_POLICY)).toBe(true);
  });

  it('404 is not retryable', () => {
    expect(isRetryableStatus(404, DEFAULT_RETRY_POLICY)).toBe(false);
  });

  it('custom status codes', () => {
    const policy = { ...DEFAULT_RETRY_POLICY, retryableStatusCodes: [400, 500] };
    expect(isRetryableStatus(400, policy)).toBe(true);
    expect(isRetryableStatus(429, policy)).toBe(false);
  });
});

describe('mergeRetryPolicy', () => {
  it('returns defaults with no args', () => {
    const result = mergeRetryPolicy();
    expect(result).toEqual(DEFAULT_RETRY_POLICY);
  });

  it('base overrides defaults', () => {
    const result = mergeRetryPolicy({ maxAttempts: 5 });
    expect(result.maxAttempts).toBe(5);
    expect(result.initialDelayMs).toBe(DEFAULT_RETRY_POLICY.initialDelayMs);
  });

  it('override takes precedence over base', () => {
    const result = mergeRetryPolicy({ maxAttempts: 5 }, { maxAttempts: 10 });
    expect(result.maxAttempts).toBe(10);
  });

  it('retryableStatusCodes from override takes precedence', () => {
    const result = mergeRetryPolicy({ retryableStatusCodes: [500] }, { retryableStatusCodes: [502] });
    expect(result.retryableStatusCodes).toEqual([502]);
  });

  it('retryableStatusCodes from base when override undefined', () => {
    const result = mergeRetryPolicy({ retryableStatusCodes: [500] });
    expect(result.retryableStatusCodes).toEqual([500]);
  });
});

describe('assertRetryAfterWithinLimit', () => {
  it('does not throw when retryAfter within limit', () => {
    expect(() =>
      assertRetryAfterWithinLimit({ status: 429, retryAfterHeader: '5', policy: DEFAULT_RETRY_POLICY, url: 'https://x.com', method: 'GET' })
    ).not.toThrow();
  });

  it('throws HTTP_RATE_LIMITED when 429 and retryAfter > max', () => {
    expect(() =>
      assertRetryAfterWithinLimit({ status: 429, retryAfterHeader: '99999', policy: DEFAULT_RETRY_POLICY, url: 'https://x.com', method: 'GET' })
    ).toThrow(HttpError);
  });

  it('throws HTTP_SERVER_ERROR when non-429 and retryAfter > max', () => {
    let err: HttpError | undefined;
    try {
      assertRetryAfterWithinLimit({ status: 503, retryAfterHeader: '99999', policy: DEFAULT_RETRY_POLICY, url: 'https://x.com', method: 'GET' });
    } catch (e) {
      err = e as HttpError;
    }
    expect(err).toBeInstanceOf(HttpError);
    expect(err!.code).toBe('HTTP_SERVER_ERROR');
  });

  it('does not throw when respectRetryAfter=false', () => {
    const policy = { ...DEFAULT_RETRY_POLICY, respectRetryAfter: false };
    expect(() =>
      assertRetryAfterWithinLimit({ status: 429, retryAfterHeader: '99999', policy, url: 'https://x.com', method: 'GET' })
    ).not.toThrow();
  });

  it('does not throw when retryAfterHeader is undefined', () => {
    expect(() =>
      assertRetryAfterWithinLimit({ status: 429, policy: DEFAULT_RETRY_POLICY, url: 'https://x.com', method: 'GET' })
    ).not.toThrow();
  });
});

describe('parseResponseData', () => {
  it('parses JSON on 200', async () => {
    const res = await parseResponseData<{ a: number }>(
      { status: 200, headers: {}, body: '{"a":1}' },
      { url: 'https://x.com', method: 'GET' }
    );
    expect(res).toEqual({ a: 1 });
  });

  it('returns string for responseType text', async () => {
    const res = await parseResponseData<string>(
      { status: 200, headers: {}, body: 'hello' },
      { url: 'https://x.com', method: 'GET', responseType: 'text' }
    );
    expect(res).toBe('hello');
  });

  it('returns raw body for responseType raw', async () => {
    const stream = new Response('raw').body;
    const res = await parseResponseData<ReadableStream>(
      { status: 200, headers: {}, body: stream },
      { url: 'https://x.com', method: 'GET', responseType: 'raw' }
    );
    expect(res).toBe(stream);
  });

  it('returns undefined for 204', async () => {
    const res = await parseResponseData(
      { status: 204, headers: {}, body: null },
      { url: 'https://x.com', method: 'GET' }
    );
    expect(res).toBeUndefined();
  });

  it('returns undefined for empty body on 200 (json)', async () => {
    const res = await parseResponseData(
      { status: 200, headers: {}, body: '' },
      { url: 'https://x.com', method: 'GET' }
    );
    expect(res).toBeUndefined();
  });

  it('throws HTTP_INVALID_RESPONSE on invalid JSON 2xx', async () => {
    await expect(
      parseResponseData({ status: 200, headers: {}, body: '{bad' }, { url: 'https://x.com', method: 'GET' })
    ).rejects.toThrow(HttpError);
  });

  it('returns undefined on invalid JSON non-2xx', async () => {
    const res = await parseResponseData(
      { status: 500, headers: {}, body: '{bad' },
      { url: 'https://x.com', method: 'GET' }
    );
    expect(res).toBeUndefined();
  });

  it('parses ArrayBuffer body', async () => {
    const res = await parseResponseData<{ x: number }>(
      { status: 200, headers: {}, body: new TextEncoder().encode('{"x":42}').buffer },
      { url: 'https://x.com', method: 'GET' }
    );
    expect(res).toEqual({ x: 42 });
  });

  it('parses ReadableStream body', async () => {
    const res = await parseResponseData<{ x: number }>(
      { status: 200, headers: {}, body: new Response('{"x":99}').body },
      { url: 'https://x.com', method: 'GET' }
    );
    expect(res).toEqual({ x: 99 });
  });
});

describe('errorBodyText', () => {
  it('returns body text', async () => {
    const text = await errorBodyText({ status: 500, headers: {}, body: 'error occurred' });
    expect(text).toBe('error occurred');
  });

  it('truncates body longer than 2048 chars', async () => {
    const long = 'x'.repeat(3000);
    const text = await errorBodyText({ status: 500, headers: {}, body: long });
    expect(text.length).toBe(2048 + 3);
    expect(text.endsWith('...')).toBe(true);
  });

  it('returns empty string for null body', async () => {
    const text = await errorBodyText({ status: 204, headers: {}, body: null });
    expect(text).toBe('');
  });
});

describe('createTimeoutControl', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('aborts with HTTP_TIMEOUT after timeoutMs', () => {
    const ctrl = createTimeoutControl({ timeoutMs: 100 });
    expect(ctrl.signal.aborted).toBe(false);
    vi.advanceTimersByTime(100);
    expect(ctrl.signal.aborted).toBe(true);
    expect(ctrl.getAbortCode()).toBe('HTTP_TIMEOUT');
    ctrl.cleanup();
  });

  it('aborts with HTTP_ABORTED when external signal aborts', () => {
    const external = new AbortController();
    const ctrl = createTimeoutControl({ timeoutMs: 1000, externalSignal: external.signal });
    external.abort();
    expect(ctrl.signal.aborted).toBe(true);
    expect(ctrl.getAbortCode()).toBe('HTTP_ABORTED');
    ctrl.cleanup();
  });

  it('aborts immediately when external signal already aborted', () => {
    const external = new AbortController();
    external.abort();
    const ctrl = createTimeoutControl({ timeoutMs: 1000, externalSignal: external.signal });
    expect(ctrl.signal.aborted).toBe(true);
    expect(ctrl.getAbortCode()).toBe('HTTP_ABORTED');
    ctrl.cleanup();
  });

  it('cleanup clears timer so no abort happens', () => {
    const ctrl = createTimeoutControl({ timeoutMs: 100 });
    ctrl.cleanup();
    vi.advanceTimersByTime(200);
    expect(ctrl.signal.aborted).toBe(false);
  });

  it('timeoutMs=0 does not set a timer', () => {
    const ctrl = createTimeoutControl({ timeoutMs: 0 });
    vi.advanceTimersByTime(1000);
    expect(ctrl.signal.aborted).toBe(false);
    expect(ctrl.getAbortCode()).toBeUndefined();
    ctrl.cleanup();
  });
});

describe('normalizeAbortError', () => {
  it('returns HTTP_ABORTED when code is HTTP_ABORTED', () => {
    const err = normalizeAbortError(new DOMException('aborted', 'AbortError'), { url: 'https://x.com', method: 'GET', code: 'HTTP_ABORTED' });
    expect(err.code).toBe('HTTP_ABORTED');
    expect(err.retryable).toBe(false);
  });

  it('returns HTTP_TIMEOUT when code is undefined', () => {
    const err = normalizeAbortError(new DOMException('timeout', 'TimeoutError'), { url: 'https://x.com', method: 'GET' });
    expect(err.code).toBe('HTTP_TIMEOUT');
    expect(err.retryable).toBe(true);
  });

  it('returns HTTP_TIMEOUT when code is HTTP_TIMEOUT', () => {
    const err = normalizeAbortError(new Error('x'), { url: 'https://x.com', method: 'GET', code: 'HTTP_TIMEOUT' });
    expect(err.code).toBe('HTTP_TIMEOUT');
  });
});

describe('sleep (retry.ts)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('resolves after ms', async () => {
    const p = sleep(100, new AbortController().signal);
    vi.advanceTimersByTime(100);
    await expect(p).resolves.toBeUndefined();
  });

  it('resolves immediately when ms <= 0', async () => {
    await expect(sleep(0, new AbortController().signal)).resolves.toBeUndefined();
    await expect(sleep(-1, new AbortController().signal)).resolves.toBeUndefined();
  });

  it('rejects with AbortError when signal aborts', async () => {
    const controller = new AbortController();
    const p = sleep(1000, controller.signal);
    controller.abort();
    await expect(p).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Additional pipeline edge cases
// ---------------------------------------------------------------------------

describe('pipeline edge cases', () => {
  it('external abort during retry sleep (after status error) -> HTTP_ABORTED', async () => {
    const t = new FakeHttpTransport();
    t.respond(noBodyResponse(503)).delay(200, jsonResponse(200, {}));
    const controller = new AbortController();
    const client = makeClient(t);
    setTimeout(() => controller.abort(), 10);
    const err = await assertHttpError(
      client.get('https://api.example.com/abort-retry', {
        signal: controller.signal,
        retry: { maxAttempts: 3, initialDelayMs: 50 },
      }),
      'HTTP_ABORTED'
    );
    expect(err.retryable).toBe(false);
  });

  it('external abort during retry sleep (after network error) -> HTTP_ABORTED via catch path', async () => {
    const t = new FakeHttpTransport();
    t.fail(new TypeError('network fail')).fail(new TypeError('network fail'));
    const controller = new AbortController();
    const client = makeClient(t);
    setTimeout(() => controller.abort(), 10);
    const err = await assertHttpError(
      client.get('https://api.example.com/abort-netretry', {
        signal: controller.signal,
        retry: { maxAttempts: 3, initialDelayMs: 50 },
      }),
      'HTTP_ABORTED'
    );
    expect(err.retryable).toBe(false);
  });

  it('non-2xx with non-retryable status and no remaining attempts throws immediately', async () => {
    const t = new FakeHttpTransport().respond(textResponse(403, 'Forbidden'));
    const client = makeClient(t);
    const err = await assertHttpError(
      client.get('https://api.example.com/forbidden', { retry: { maxAttempts: 5, initialDelayMs: 1 } }),
      'HTTP_CLIENT_ERROR'
    );
    expect(t.calls).toHaveLength(1);
    expect(err.status).toBe(403);
  });

  it('HEAD request retries on 500', async () => {
    const t = new FakeHttpTransport();
    t.respond(noBodyResponse(500)).respond(noBodyResponse(200));
    const client = makeClient(t);
    const res = await client.request({ url: 'https://api.example.com/head', method: 'HEAD', retry: { maxAttempts: 3, initialDelayMs: 1 } });
    expect(res.status).toBe(200);
    expect(t.calls).toHaveLength(2);
  });

  it('OPTIONS request retries on 503', async () => {
    const t = new FakeHttpTransport();
    t.respond(noBodyResponse(503)).respond(noBodyResponse(200));
    const client = makeClient(t);
    const res = await client.request({ url: 'https://api.example.com/opt', method: 'OPTIONS', retry: { maxAttempts: 3, initialDelayMs: 1 } });
    expect(res.status).toBe(200);
    expect(t.calls).toHaveLength(2);
  });

  it('error on non-2xx includes providerRequestId in cause', async () => {
    const t = new FakeHttpTransport().respond({
      status: 500,
      headers: { 'x-request-id': 'prov-123' },
      body: 'error',
    });
    const client = makeClient(t);
    const err = await assertHttpError(
      client.get('https://api.example.com/prov', { retry: { maxAttempts: 1 } }),
      'HTTP_RETRY_EXHAUSTED',
      'HTTP_SERVER_ERROR'
    );
    expect((err.cause as HttpError).providerRequestId).toBe('prov-123');
  });

  it('request headers are cleaned before sending to transport', async () => {
    const t = new FakeHttpTransport().respond(jsonResponse(200, {}));
    const client = makeClient(t);
    await client.get('https://api.example.com/', {
      headers: { good: 'val', __proto__: { bad: true } } as Record<string, string>,
    });
    expect(t.calls[0].headers.__proto__).toBeUndefined();
    expect(t.calls[0].headers.good).toBe('val');
  });

  it('PUT with allowUnsafeRetries retries on 502', async () => {
    const t = new FakeHttpTransport();
    t.respond(noBodyResponse(502)).respond(jsonResponse(200, { ok: true }));
    const client = makeClient(t);
    const res = await client.put('https://api.example.com/put', { a: 1 }, {
      retry: { maxAttempts: 2, initialDelayMs: 1, allowUnsafeRetries: true },
    });
    expect(res.status).toBe(200);
    expect(t.calls).toHaveLength(2);
  });

  it('DELETE with allowUnsafeRetries retries on 503', async () => {
    const t = new FakeHttpTransport();
    t.respond(noBodyResponse(503)).respond(noBodyResponse(204));
    const client = makeClient(t);
    const res = await client.delete('https://api.example.com/del', {
      retry: { maxAttempts: 2, initialDelayMs: 1, allowUnsafeRetries: true },
    });
    expect(res.status).toBe(204);
    expect(t.calls).toHaveLength(2);
  });

  it('PATCH without allowUnsafeRetries does not retry on 500 (wrapped as HTTP_RETRY_EXHAUSTED)', async () => {
    const t = new FakeHttpTransport().respond(noBodyResponse(500));
    const client = makeClient(t);
    await assertHttpError(
      client.patch('https://api.example.com/patch', { a: 1 }, { retry: { maxAttempts: 3, initialDelayMs: 1 } }),
      'HTTP_RETRY_EXHAUSTED',
      'HTTP_SERVER_ERROR'
    );
    expect(t.calls).toHaveLength(1);
  });

  it('408 is retryable and retries', async () => {
    const t = new FakeHttpTransport();
    t.respond(noBodyResponse(408)).respond(jsonResponse(200, { ok: true }));
    const client = makeClient(t);
    const res = await client.get('https://api.example.com/408', { retry: { maxAttempts: 3, initialDelayMs: 1 } });
    expect(res.status).toBe(200);
    expect(t.calls).toHaveLength(2);
  });

  it('502 is retryable and retries', async () => {
    const t = new FakeHttpTransport();
    t.respond(noBodyResponse(502)).respond(jsonResponse(200, { ok: true }));
    const client = makeClient(t);
    const res = await client.get('https://api.example.com/502', { retry: { maxAttempts: 3, initialDelayMs: 1 } });
    expect(res.status).toBe(200);
    expect(t.calls).toHaveLength(2);
  });

  it('504 is retryable and retries', async () => {
    const t = new FakeHttpTransport();
    t.respond(noBodyResponse(504)).respond(jsonResponse(200, { ok: true }));
    const client = makeClient(t);
    const res = await client.get('https://api.example.com/504', { retry: { maxAttempts: 3, initialDelayMs: 1 } });
    expect(res.status).toBe(200);
    expect(t.calls).toHaveLength(2);
  });

  it('defaultTimeoutMs applies when request has no timeoutMs', async () => {
    const t = new FakeHttpTransport();
    t.delay(50, jsonResponse(200, {})).delay(50, jsonResponse(200, {})).delay(50, jsonResponse(200, {}));
    const client = makeClient(t, { defaultTimeoutMs: 10 });
    await assertHttpError(client.get('https://api.example.com/slow'), 'HTTP_RETRY_EXHAUSTED', 'HTTP_TIMEOUT');
  });

  it('onResponse receives requestId from provider headers', async () => {
    const t = new FakeHttpTransport().respond(jsonResponse(200, {}, { 'x-request-id': 'resp-id' }));
    const ids: (string | undefined)[] = [];
    const client = makeClient(t, {
      hooks: { onResponse: (info) => { ids.push(info.requestId); } },
    });
    await client.get('https://api.example.com/');
    expect(ids[0]).toBe('resp-id');
  });
});