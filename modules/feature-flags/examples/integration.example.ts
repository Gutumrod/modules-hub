/**
 * Feature Flags Module — Integration Example
 *
 * Reference for wiring the feature-flags module into a host application.
 * The Host owns env reads and configuration; the module never touches env.
 *
 * Do NOT copy this file wholesale into production — adapt to your own
 * flag store, context resolution, and logging infrastructure.
 */

import { createFeatureFlagClient, createMemoryFlagStore, FeatureFlagError } from '../index.js';
import type { FeatureFlagResult } from '../index.js';

// ── 1. Flag Store ─────────────────────────────────────────────────────────────
//
// Memory store for development, tests, and contract validation.
// NOT a distributed production store — does not sync across processes or Workers.
// In production, inject a distributed FeatureFlagStore implementation instead.
const store = createMemoryFlagStore({
  // Boolean shorthand: auto-wrapped to { key: 'new-checkout-flow', enabled: true }
  'new-checkout-flow': true,

  // Full StoredFlag with targeting rules (v0.1 simple exact matching)
  'beta-dashboard': {
    key: 'beta-dashboard',
    enabled: false,
    rules: [
      // VIP tenants get early access regardless of environment
      { tenantId: 'tenant-vip', enabled: true },
      // Staging environment always sees the beta dashboard
      { environment: 'staging', enabled: true },
    ],
  },
});

// ── 2. Feature Flag Client ────────────────────────────────────────────────────
//
// Host builds and injects all configuration — the module never reads env.
const client = createFeatureFlagClient({
  store,
  defaultFallback: false,
  hooks: {
    onEvaluation: (info) =>
      console.log(
        `[Flag] ${info.key} => ${info.result.enabled}` +
          ` (source: ${info.result.source}, ${info.durationMs}ms)`,
      ),
    onError: (err, query) =>
      console.error(`[Flag Error] ${err.code} on '${query.key}': ${err.message}`),
  },
});

async function run(): Promise<void> {
  // ── 3. isEnabled: simple boolean check ───────────────────────────────────────
  //
  // isEnabled internally calls getFlag and returns result.enabled.
  // All validation, store lookup, targeting, fallback, and hook logic runs
  // through the single getFlag pipeline.
  const checkoutEnabled = await client.isEnabled({
    key: 'new-checkout-flow',
    context: { environment: 'production' },
  });
  console.log('New checkout flow enabled?', checkoutEnabled); // true

  // ── 4. getFlag: full diagnostic result ───────────────────────────────────────
  //
  // tenantId 'tenant-vip' matches the first targeting rule → enabled: true.
  const dashboardResult: FeatureFlagResult = await client.getFlag({
    key: 'beta-dashboard',
    context: { tenantId: 'tenant-vip', environment: 'production' },
  });
  console.log('Beta Dashboard result:', dashboardResult);
  // { key: 'beta-dashboard', enabled: true, source: 'store', reason: 'Matched targeting rule' }

  // ── 5. Missing flag with explicit defaultValue ────────────────────────────────
  //
  // Flag does not exist → source: 'default_fallback'.
  // Fallback precedence: query.defaultValue (1st) → config.defaultFallback (2nd) → false (3rd).
  const experimentEnabled = await client.isEnabled({
    key: 'experimental-ai-feature',
    defaultValue: true,
  });
  console.log('Missing flag (defaultValue: true):', experimentEnabled); // true

  // ── 6. Runtime update — immediately visible ───────────────────────────────────
  //
  // No restart or cache purge required. The core never caches internally.
  const beforeUpdate = await client.isEnabled({
    key: 'beta-dashboard',
    context: { environment: 'production' },
  });
  console.log('Beta Dashboard before update:', beforeUpdate); // false (no rule match, store default: false)

  store.setFlag('beta-dashboard', true);

  const afterUpdate = await client.isEnabled({
    key: 'beta-dashboard',
    context: { environment: 'production' },
  });
  console.log('Beta Dashboard after setFlag(true):', afterUpdate); // true

  // ── 7. Error handling ─────────────────────────────────────────────────────────
  //
  // During isEnabled/getFlag, provider errors (FLAG_PROVIDER_ERROR),
  // invalid keys (FLAG_KEY_INVALID), and invalid values (FLAG_VALUE_INVALID)
  // all degrade to error_fallback and fire the onError hook — they do NOT
  // throw to the caller. Wrap in try/catch as a defensive pattern.
  try {
    const flagResult = await client.getFlag({ key: 'some-flag' });
    if (flagResult.source === 'error_fallback') {
      console.warn(`Flag '${flagResult.key}' degraded to error fallback: ${flagResult.reason}`);
    }
  } catch (err) {
    if (err instanceof FeatureFlagError) {
      console.error(`Unexpected FeatureFlagError [${err.code}]: ${err.message}`);
    } else {
      throw err;
    }
  }
}

run();
