/**
 * Rate Limit Module — Integration Example (reference only).
 *
 * This file shows how a Host project wires the Rate Limit module:
 *   - The Host composes a business identity key (IP, user id, tenant id, API key, ...).
 *   - The module NEVER reads env itself — all config is injected here by the Host.
 *   - The Host injects the storage adapter (createMemoryStore in v0.1).
 *
 * It is a complete, runnable example: it creates a rate limiter with a memory store,
 * checks a key, prints allowed/remaining/resetAt/retryAfterMs, and handles RATE_LIMITED.
 */

import {
  createRateLimiter,
  createMemoryStore,
  RateLimitError,
} from '../index.js';
import type { RateLimitResult } from '../index.js';

// Host-owned configuration — the module never reads these.
const RATE_LIMIT = 5; // max requests per window
const WINDOW_MS = 60_000; // 1 minute fixed window

// Build a wired RateLimiter from Host config.
// Hoist outside the request handler for a long-lived limiter.
function buildLimiter() {
  const store = createMemoryStore(); // v0.1 in-memory adapter
  return createRateLimiter({
    store,
    defaultLimit: RATE_LIMIT,
    defaultWindowMs: WINDOW_MS,
  });
}

// Map a RateLimitResult to a Host-side HTTP response.
function allowedResponse(result: RateLimitResult) {
  return {
    status: 200,
    headers: {
      'X-RateLimit-Limit': String(RATE_LIMIT),
      'X-RateLimit-Remaining': String(result.remaining),
      'X-RateLimit-Reset': String(result.resetAt),
    },
    body: 'Success',
  };
}

// Map a RateLimitError to a Host-side 429 response.
function blockedResponse(err: RateLimitError) {
  return {
    status: err.status, // 429
    headers: {
      'Retry-After': Math.ceil(err.retryAfterMs / 1000).toString(),
      'X-RateLimit-Reset': err.resetAt.toString(),
    },
    body: {
      code: err.code, // 'RATE_LIMITED'
      message: err.message,
      retryAfterMs: err.retryAfterMs,
    },
  };
}

// Handle an incoming request for a given client IP.
async function handleIncomingRequest(limiter: ReturnType<typeof buildLimiter>, clientIp: string) {
  // The Host composes the business identity key — the module never infers it.
  const key = `ip:${clientIp}:api_v1`;

  try {
    // checkOrThrow throws RateLimitError when the limit is exceeded.
    const result = await limiter.checkOrThrow({
      key,
      limit: RATE_LIMIT,
      windowMs: WINDOW_MS,
    });

    console.log(
      `[ALLOWED] key=${key} remaining=${result.remaining}/${RATE_LIMIT} ` +
        `resetAt=${new Date(result.resetAt).toISOString()} retryAfterMs=${result.retryAfterMs}`
    );
    return allowedResponse(result);
  } catch (err) {
    if (err instanceof RateLimitError) {
      console.error(
        `[BLOCKED] key=${err.key} code=${err.code} retryAfterMs=${err.retryAfterMs}ms ` +
          `resetAt=${new Date(err.resetAt).toISOString()}`
      );
      return blockedResponse(err);
    }
    throw err;
  }
}

// Run the example: fire 6 requests against a limit of 5 — the 6th is blocked.
async function run() {
  const limiter = buildLimiter();
  const clientIp = '203.0.113.195';

  for (let i = 1; i <= 6; i++) {
    const res = await handleIncomingRequest(limiter, clientIp);
    console.log(`Request ${i} -> status=${res.status}`);
  }
}

run();
