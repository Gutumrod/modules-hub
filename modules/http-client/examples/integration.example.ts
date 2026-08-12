/**
 * Generic Cloudflare Worker Host Example — reference only when integrating into a real
 * project. Do NOT copy this file wholesale into production.
 *
 * This file shows how a Host project wires the HTTP Client module:
 *   - The Host declares its own Env interface and reads secrets from it.
 *   - The module NEVER reads env itself — all config is injected here by the Host.
 *   - createFetchTransport receives the Worker's globalThis.fetch from the Host.
 */

import { createHttpClient, createFetchTransport, HttpError } from '../index.js';
import type { HttpClient, HttpClientConfig } from '../index.js';

// Host-owned environment bindings — the module never reads these.
interface Env {
  UPSTREAM_BASE_URL: string;     // e.g. 'https://api.example.com'
  UPSTREAM_TOKEN: string;        // bound via `wrangler secret put UPSTREAM_TOKEN`
}

// Build a wired HttpClient from Host config.
// Called once per request in this example; hoist outside fetch() for long-lived clients.
// Note: the module never reads env — buildClient takes no env; the Host injects config below.
function buildClient(): HttpClient {
  const transport = createFetchTransport({ fetch: globalThis.fetch });

  const config: HttpClientConfig = {
    transport,
    defaultTimeoutMs: 8000,
    urlPolicy: {
      allowedProtocols: ['https:'],
      // SSRF protection: block loopback, link-local metadata endpoint
      blockedHosts: ['localhost', '127.0.0.1', '169.254.169.254', '::1'],
    },
    // Redact the Host's custom auth header in all logging hooks and errors
    sensitiveHeaders: ['X-Upstream-Token'],
    hooks: {
      onRequest: (info) =>
        console.log(`[HTTP →] ${info.method} ${info.url}`),
      onResponse: (info) =>
        console.log(
          `[HTTP ←] ${info.status} (${info.durationMs}ms) requestId=${info.requestId ?? '-'}`
        ),
      onError: (err, req) =>
        console.error(
          `[HTTP ✗] ${err.code} ${req.method} ${req.url} status=${err.status ?? '-'}`
        ),
    },
  };

  return createHttpClient(config);
}

// Map HttpError codes to a Worker Response status code.
function httpErrorToResponse(err: HttpError): Response {
  if (err.code === 'HTTP_RATE_LIMITED') {
    return new Response('Rate limited by upstream.', { status: 429 });
  }
  if (err.code === 'HTTP_INVALID_URL') {
    return new Response('Invalid or disallowed request URL.', { status: 400 });
  }
  if (
    err.code === 'HTTP_TIMEOUT' ||
    err.code === 'HTTP_NETWORK_ERROR' ||
    err.code === 'HTTP_RETRY_EXHAUSTED'
  ) {
    return new Response('Upstream unavailable.', { status: 502 });
  }
  return new Response('Internal error.', { status: 500 });
}

// Cloudflare Worker default export
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const client = buildClient();
    const { pathname } = new URL(request.url);

    // GET /items/:id — fetch a single item from the upstream API
    if (request.method === 'GET' && pathname.startsWith('/items/')) {
      const id = pathname.split('/')[2];
      try {
        const res = await client.get<{ id: string; name: string }>(
          `${env.UPSTREAM_BASE_URL}/items/${id}`,
          {
            headers: { 'X-Upstream-Token': env.UPSTREAM_TOKEN },
          }
        );
        return Response.json(res.data, { status: res.status });
      } catch (err) {
        if (err instanceof HttpError) return httpErrorToResponse(err);
        throw err;
      }
    }

    // POST /items — create an item; opt-in to retry on transient upstream failures
    if (request.method === 'POST' && pathname === '/items') {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return new Response('Invalid JSON body.', { status: 400 });
      }

      try {
        const res = await client.post<{ id: string }>(
          `${env.UPSTREAM_BASE_URL}/items`,
          body,
          {
            headers: { 'X-Upstream-Token': env.UPSTREAM_TOKEN },
            // POST is non-idempotent — allowUnsafeRetries must be explicitly set.
            retry: { allowUnsafeRetries: true, maxAttempts: 2 },
          }
        );
        return Response.json(res.data, { status: res.status });
      } catch (err) {
        if (err instanceof HttpError) return httpErrorToResponse(err);
        throw err;
      }
    }

    return new Response('Not found.', { status: 404 });
  },
};
