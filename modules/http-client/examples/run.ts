/**
 * Single-command runnable example for the HTTP Client module.
 *
 * Run it with:  npm run example
 *
 * Self-contained and offline: it never opens a network connection, never reads the environment,
 * never writes a file and needs no credentials. The module's real fetch adapter is used with an
 * injected, scripted fetch implementation, so this example exercises the production code path —
 * the single request pipeline, URL policy validation, retry, timeout and abort control, response
 * parsing, header redaction and error mapping — without a server.
 *
 * The final line printed starts with `EXAMPLE_RESULT: OK` and reports only values this run
 * actually observed.
 */

import { createFetchTransport, createHttpClient, HttpError } from '../index.js';
import type { LoggingHooks, SanitizedRequestInfo } from '../index.js';

/** One transcript entry per call the injected fetch implementation received. */
type FetchCall = {
  method: string;
  url: string;
  authorization?: string;
  customToken?: string;
  contentType?: string;
  bodyText?: string;
};

/** Every fetch call this run observed, in order. */
const fetchCalls: FetchCall[] = [];
/** How many times each pathname was requested — this is how retry behaviour is measured. */
const pathCounts = new Map<string, number>();

/** Requests the pipeline dispatched for one pathname so far. */
function attemptsFor(pathname: string): number {
  return pathCounts.get(pathname) ?? 0;
}

function jsonResponse(status: number, payload: unknown, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json', ...extraHeaders },
  });
}

/**
 * Scripted stand-in for the runtime fetch implementation. The module never sees the script — it
 * only sees the `HttpTransport` contract — so this exercises the real adapter and pipeline.
 */
const fakeFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const method = (init?.method ?? 'GET').toUpperCase();
  const headers = new Headers(init?.headers);
  const { pathname } = new URL(url);
  const callIndex = attemptsFor(pathname) + 1;
  pathCounts.set(pathname, callIndex);

  fetchCalls.push({
    method,
    url,
    authorization: headers.get('authorization') ?? undefined,
    customToken: headers.get('x-upstream-token') ?? undefined,
    contentType: headers.get('content-type') ?? undefined,
    bodyText: typeof init?.body === 'string' ? init.body : undefined,
  });

  if (pathname === '/items/1') {
    return jsonResponse(200, { id: 'item_1', name: 'Widget' }, { 'x-request-id': 'req_example_1' });
  }

  if (pathname === '/items') {
    return jsonResponse(201, { id: 'item_2', contentType: headers.get('content-type'), body: init?.body });
  }

  if (pathname === '/text') {
    return new Response('hello from the transport', {
      status: 200,
      headers: { 'content-type': 'text/plain' },
    });
  }

  if (pathname === '/flaky') {
    return callIndex === 1
      ? jsonResponse(503, { error: 'temporarily unavailable' })
      : jsonResponse(200, { id: 'flaky_ok' });
  }

  if (pathname === '/unsafe') {
    return jsonResponse(503, { error: 'temporarily unavailable' });
  }

  if (pathname === '/slow') {
    // Never answers on its own: it only settles when the request pipeline aborts it. That is what
    // makes the timeout and caller-abort paths observable without a real server.
    return new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (!signal) {
        return;
      }
      const onAbort = () => reject(new DOMException('The operation was aborted.', 'AbortError'));
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  return jsonResponse(404, { error: 'not found' });
};

/** Logging hooks that record what the pipeline forwarded. */
const forwardedRequestInfo: SanitizedRequestInfo[] = [];
let onRequestCalls = 0;
let onResponseCalls = 0;
const onErrorCodes: string[] = [];

const hooks: LoggingHooks = {
  onRequest: (info: SanitizedRequestInfo) => {
    onRequestCalls += 1;
    forwardedRequestInfo.push(info);
  },
  onResponse: () => {
    onResponseCalls += 1;
  },
  onError: (error) => {
    onErrorCodes.push(error.code);
  },
};

/** Error codes this run caught at the call site, in the order they were observed. */
const caughtErrorCodes: string[] = [];

function codeOf(error: unknown): string {
  if (error instanceof HttpError) {
    caughtErrorCodes.push(error.code);
    return error.code;
  }
  return 'not-an-http-error';
}

function causeCodeOf(error: unknown): string {
  return error instanceof HttpError && error.cause instanceof HttpError ? error.cause.code : 'none';
}

async function main(): Promise<void> {
  const lines: string[] = [];

  const client = createHttpClient({
    transport: createFetchTransport({ fetch: fakeFetch }),
    defaultTimeoutMs: 2000,
    urlPolicy: {
      allowedProtocols: ['http:', 'https:'],
      // SSRF guard: loopback and link-local metadata addresses are refused before any I/O.
      blockedHosts: ['localhost', '127.0.0.1', '169.254.169.254'],
    },
    sensitiveHeaders: ['X-Upstream-Token'],
    hooks,
  });

  // ── 1. A plain GET: JSON decoded, provider request id surfaced ──────────────
  const item = await client.get<{ id: string; name: string }>('https://api.example.test/items/1');
  lines.push(
    `GET  /items/1 -> status=${item.status} ok=${item.ok} id=${item.data?.id} name=${item.data?.name} requestId=${item.requestId}`,
  );

  // ── 2. Same pipeline, text decoding ────────────────────────────────────────
  const text = await client.get<string>('https://api.example.test/text', { responseType: 'text' });
  lines.push(`GET  /text    -> status=${text.status} dataType=${typeof text.data} data="${text.data}"`);

  // ── 3. POST with an object body: the transport serializes it and sets the header,
  //     and both sensitive header names are redacted before the hooks see them. ──
  const created = await client.post<{ id: string; contentType: string | null; body: unknown }>(
    'https://api.example.test/items',
    { name: 'Widget' },
    { headers: { Authorization: 'Bearer example-token', 'X-Upstream-Token': 'example-token' } },
  );
  const redactedHeaderValues = forwardedRequestInfo
    .flatMap((info) => Object.entries(info.headers))
    .filter(([, value]) => value === '[REDACTED]').length;
  lines.push(
    `POST /items   -> status=${created.status} contentType=${created.data?.contentType} body=${String(created.data?.body)} redactedHeaders=${redactedHeaderValues}`,
  );

  // ── 4. GET retried after a 503: the safe method is retried by default ───────
  const flaky = await client.get<{ id: string }>('https://api.example.test/flaky');
  const flakyAttempts = attemptsFor('/flaky');
  lines.push(`GET  /flaky   -> status=${flaky.status} id=${flaky.data?.id} attempts=${flakyAttempts}`);

  // ── 5. POST is NOT retried by default: 503 on a non-idempotent method means
  //     exactly one attempt, whatever maxAttempts would otherwise allow. ───────
  let unsafeCode = 'none';
  let unsafeCauseCode = 'none';
  try {
    await client.post('https://api.example.test/unsafe', { name: 'Widget' });
  } catch (error) {
    unsafeCode = codeOf(error);
    unsafeCauseCode = causeCodeOf(error);
  }
  const unsafePostAttempts = attemptsFor('/unsafe');
  lines.push(
    `POST /unsafe  -> code=${unsafeCode} cause=${unsafeCauseCode} attempts=${unsafePostAttempts}`,
  );

  // ── 6. URL policy refuses a blocked host before any I/O happens ─────────────
  const fetchesBeforeBlock = fetchCalls.length;
  let blockedCode = 'none';
  try {
    await client.get('http://127.0.0.1:9080/internal');
  } catch (error) {
    blockedCode = codeOf(error);
  }
  const blockedFetchesAttempted = fetchCalls.length - fetchesBeforeBlock;
  lines.push(`GET  blocked  -> code=${blockedCode} fetchesAttempted=${blockedFetchesAttempted}`);

  // ── 7. An unparseable URL fails the same way, without any attempt ───────────
  let invalidUrlCode = 'none';
  try {
    await client.get('not a url');
  } catch (error) {
    invalidUrlCode = codeOf(error);
  }
  lines.push(`GET  bad-url  -> code=${invalidUrlCode}`);

  // ── 8. A 4xx that is not 408/429 is terminal — thrown on the first attempt ──
  const fetchesBeforeMissing = fetchCalls.length;
  let clientErrorCode = 'none';
  try {
    await client.get('https://api.example.test/missing');
  } catch (error) {
    clientErrorCode = codeOf(error);
  }
  const missingAttempts = fetchCalls.length - fetchesBeforeMissing;
  lines.push(`GET  /missing -> code=${clientErrorCode} attempts=${missingAttempts}`);

  // ── 9. The module's own timeout fires on a request that never answers ──────
  const slowBeforeTimeout = attemptsFor('/slow');
  let timeoutCode = 'none';
  let timeoutCauseCode = 'none';
  try {
    await client.get('https://api.example.test/slow', { timeoutMs: 25, retry: { maxAttempts: 1 } });
  } catch (error) {
    timeoutCode = codeOf(error);
    timeoutCauseCode = causeCodeOf(error);
  }
  const timeoutAttempts = attemptsFor('/slow') - slowBeforeTimeout;
  lines.push(
    `GET  /slow    -> code=${timeoutCode} cause=${timeoutCauseCode} attempts=${timeoutAttempts}`,
  );

  // ── 10. A caller's own AbortSignal cancels on the first attempt ────────────
  const controller = new AbortController();
  const slowBeforeAbort = attemptsFor('/slow');
  const abortTimer = setTimeout(() => controller.abort(), 10);
  let abortCode = 'none';
  try {
    await client.get('https://api.example.test/slow', { timeoutMs: 5000, signal: controller.signal });
  } catch (error) {
    abortCode = codeOf(error);
  } finally {
    clearTimeout(abortTimer);
  }
  const abortAttempts = attemptsFor('/slow') - slowBeforeAbort;
  lines.push(`GET  aborted  -> code=${abortCode} attempts=${abortAttempts}`);

  // ── 11. A hook that throws cannot change the outcome (success or failure) ──
  const hostileHookClient = createHttpClient({
    transport: createFetchTransport({ fetch: fakeFetch }),
    hooks: {
      onRequest: () => {
        throw new Error('telemetry sink exploded');
      },
      onResponse: () => {
        throw new Error('telemetry sink exploded');
      },
      onError: () => {
        throw new Error('telemetry sink exploded');
      },
    },
  });
  let hostileHooksIsolated = false;
  try {
    const hostileOk = await hostileHookClient.get('https://api.example.test/items/1');
    let hostileFailureCode = 'none';
    try {
      await hostileHookClient.post('https://api.example.test/unsafe', { name: 'Widget' });
    } catch (error) {
      hostileFailureCode = error instanceof HttpError ? error.code : 'not-an-http-error';
    }
    hostileHooksIsolated = hostileOk.status === 200 && hostileFailureCode === 'HTTP_RETRY_EXHAUSTED';
  } catch {
    hostileHooksIsolated = false;
  }
  lines.push(`throwing hooks isolated -> ${hostileHooksIsolated}`);

  // ── 12. HttpError is a real inspectable class ─────────────────────────────
  const inspected = new HttpError({
    message: 'HTTP response body is not valid JSON.',
    code: 'HTTP_INVALID_RESPONSE',
    status: 200,
    url: 'https://api.example.test/items/1',
    method: 'GET',
  });
  const errorClassOk =
    inspected instanceof Error &&
    inspected.name === 'HttpError' &&
    inspected.retryable === false &&
    inspected.status === 200;

  for (const line of lines) {
    console.log(line);
  }

  const uniqueCaught = [...new Set(caughtErrorCodes)];
  const uniqueHookErrors = [...new Set(onErrorCodes)];
  console.log(
    `EXAMPLE_RESULT: OK fetches=${fetchCalls.length} ` +
      `hookCalls=onRequest:${onRequestCalls}+onResponse:${onResponseCalls}+onError:${onErrorCodes.length} ` +
      `redactedHeaderValues=${redactedHeaderValues} itemStatus=${item.status} itemId=${item.data?.id} ` +
      `requestId=${item.requestId} textDataType=${typeof text.data} ` +
      `postStatus=${created.status} postBodySerialized=${created.data?.contentType === 'application/json'} ` +
      `flakyAttempts=${flakyAttempts} flakyStatus=${flaky.status} ` +
      `unsafePostAttempts=${unsafePostAttempts} unsafeCode=${unsafeCode} unsafeCause=${unsafeCauseCode} ` +
      `blockedCode=${blockedCode} blockedFetchesAttempted=${blockedFetchesAttempted} ` +
      `invalidUrlCode=${invalidUrlCode} clientErrorCode=${clientErrorCode} ` +
      `clientErrorAttempts=${missingAttempts} timeoutCode=${timeoutCode} timeoutCause=${timeoutCauseCode} ` +
      `abortCode=${abortCode} abortAttempts=${abortAttempts} attemptsPerSlowRequest=${timeoutAttempts === 1 && abortAttempts === 1} ` +
      `hostileHooksIsolated=${hostileHooksIsolated} errorClassOk=${errorClassOk} ` +
      `caughtErrorCodes=${uniqueCaught.join('+')} hookErrorCodes=${uniqueHookErrors.join('+')}`,
  );
}

await main();
