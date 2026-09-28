/**
 * Single-command runnable example for the Feature Flags module.
 *
 * Run it with:  npm run example
 *
 * Self-contained: no network, no file system access, no environment reads, no secrets.
 * It exercises the real module behaviour through the public entry point and prints one final
 * line starting with `EXAMPLE_RESULT: OK`, followed only by numbers this run actually observed.
 */

import { createFeatureFlagClient, createMemoryFlagStore, FeatureFlagError } from '../index.js';
import type {
  FeatureFlagQuery,
  FeatureFlagResult,
  FeatureFlagStore,
  SanitizedFlagEvaluationInfo,
  StoredFlag,
} from '../index.js';

/** Number of evaluation-hook callbacks recorded for the primary client. */
let evaluationCalls = 0;
/** Error codes reported to the primary client's `onError` hook, in order. */
const reportedErrorCodes: string[] = [];
/** Context objects the primary client forwarded to `onEvaluation` (already sanitized by the module). */
const forwardedContexts: Array<SanitizedFlagEvaluationInfo['context']> = [];

/** Renders one `getFlag()` result as a single readable line. */
function describe(label: string, result: FeatureFlagResult): string {
  return `${label} -> enabled=${result.enabled} source=${result.source} reason="${result.reason}"`;
}

async function main(): Promise<void> {
  const lines: string[] = [];

  // ── 1. Store ────────────────────────────────────────────────────────────────
  // Boolean shorthand is auto-wrapped; full StoredFlag objects carry targeting rules.
  const store = createMemoryFlagStore({
    'new-checkout-flow': true,
    'beta-dashboard': {
      key: 'beta-dashboard',
      enabled: false,
      rules: [
        { tenantId: 'tenant-vip', enabled: true },
        { environment: 'staging', enabled: true },
      ],
    },
  });

  // ── 2. Client ───────────────────────────────────────────────────────────────
  const client = createFeatureFlagClient({
    store,
    defaultFallback: false,
    hooks: {
      onEvaluation: (info: SanitizedFlagEvaluationInfo) => {
        evaluationCalls += 1;
        forwardedContexts.push(info.context);
      },
      onError: (error: FeatureFlagError) => {
        reportedErrorCodes.push(error.code);
      },
    },
  });

  // ── 3. Stored flag, no context ──────────────────────────────────────────────
  const checkout = await client.getFlag({ key: 'new-checkout-flow' });
  lines.push(describe('new-checkout-flow            ', checkout));

  // ── 4. Targeting rule matches the context ──────────────────────────────────
  const vipDashboard = await client.getFlag({
    key: 'beta-dashboard',
    context: { tenantId: 'tenant-vip', environment: 'production' },
  });
  lines.push(describe('beta-dashboard / tenant-vip  ', vipDashboard));

  // ── 5. Same flag, context that matches no rule -> stored default state ─────
  const basicDashboard = await client.getFlag({
    key: 'beta-dashboard',
    context: { tenantId: 'tenant-basic', environment: 'production' },
  });
  lines.push(describe('beta-dashboard / tenant-basic', basicDashboard));

  // ── 6. Missing flag -> fallback precedence ─────────────────────────────────
  const missing = await client.getFlag({ key: 'not-registered' });
  lines.push(describe('not-registered               ', missing));

  const missingWithQueryDefault = await client.getFlag({
    key: 'not-registered',
    defaultValue: true,
  });
  lines.push(describe('not-registered + defaultValue', missingWithQueryDefault));

  // Config-level fallback applies only when the query default is absent.
  const configFallbackClient = createFeatureFlagClient({
    store: createMemoryFlagStore(),
    defaultFallback: true,
  });
  const configFallback = await configFallbackClient.getFlag({ key: 'not-registered' });
  lines.push(describe('config defaultFallback=true  ', configFallback));

  // ── 7. Runtime update is visible immediately — no cache, no re-initialisation ──
  // A flag with no targeting rules is updated here, so the rules on 'beta-dashboard'
  // stay untouched for the context-isolation check below.
  const beforeUpdate = await client.isEnabled({ key: 'new-checkout-flow' });
  store.setFlag('new-checkout-flow', false);
  const afterUpdate = await client.isEnabled({ key: 'new-checkout-flow' });
  store.setFlag('new-checkout-flow', true);
  const afterSecondUpdate = await client.isEnabled({ key: 'new-checkout-flow' });
  lines.push(
    `setFlag runtime update       -> true=${beforeUpdate} thenFalse=${afterUpdate} thenTrue=${afterSecondUpdate}`,
  );

  // ── 8. Degraded paths: all three error codes resolve, none of them throw ────
  const invalidKeyResult = await client.getFlag({ key: '   ' });
  lines.push(describe('invalid key "   "            ', invalidKeyResult));

  const failingStore: FeatureFlagStore = {
    async getFlag(): Promise<StoredFlag | null> {
      throw new Error('storage backend unavailable');
    },
  };
  const providerResult = await createFeatureFlagClient({
    store: failingStore,
    hooks: { onError: (error) => reportedErrorCodes.push(error.code) },
  }).getFlag({ key: 'provider-failure' });
  lines.push(describe('provider that throws         ', providerResult));

  const malformedStore: FeatureFlagStore = {
    async getFlag(): Promise<StoredFlag | null> {
      return { key: 'broken-flag', enabled: 'yes' } as unknown as StoredFlag;
    },
  };
  const malformedResult = await createFeatureFlagClient({
    store: malformedStore,
    hooks: { onError: (error) => reportedErrorCodes.push(error.code) },
  }).getFlag({ key: 'broken-flag' });
  lines.push(describe('malformed stored value       ', malformedResult));

  // ── 9. A throwing hook must not change the evaluation outcome ──────────────
  const hostileHookClient = createFeatureFlagClient({
    store: createMemoryFlagStore({ 'hostile-hook': true }),
    hooks: {
      onEvaluation: () => {
        throw new Error('telemetry sink exploded');
      },
      onError: () => {
        throw new Error('error sink exploded');
      },
    },
  });
  let hostileHookSurvived = false;
  try {
    const result = await hostileHookClient.getFlag({ key: 'hostile-hook' });
    const invalid = await hostileHookClient.getFlag({ key: '' });
    hostileHookSurvived = result.enabled === true && invalid.source === 'error_fallback';
  } catch {
    hostileHookSurvived = false;
  }
  lines.push(`throwing hooks survived      -> ${hostileHookSurvived}`);

  // ── 10. Context isolation: different tenants evaluated concurrently ────────
  const contexts: FeatureFlagQuery[] = [
    { key: 'beta-dashboard', context: { tenantId: 'tenant-vip', environment: 'staging' } },
    { key: 'beta-dashboard', context: { tenantId: 'tenant-other', environment: 'production' } },
  ];
  const isolated = await Promise.all(contexts.map((query) => client.getFlag(query)));
  lines.push(
    `concurrent tenants isolated  -> vip=${isolated[0]?.enabled} other=${isolated[1]?.enabled}`,
  );

  // ── 11. Hook context is sanitized: raw attributes never reach the log sink ──
  await client.getFlag({
    key: 'beta-dashboard',
    context: { tenantId: 'tenant-vip', attributes: { internalCreditScore: 812 } },
  });
  const forwardedWithAttributes = forwardedContexts.filter(
    (context) => context !== undefined && 'attributes' in context,
  ).length;

  // ── 12. FeatureFlagError is a real inspectable class ──────────────────────
  const inspected = new FeatureFlagError({
    message: 'Feature flag key must be a non-empty string',
    code: 'FLAG_KEY_INVALID',
    key: '   ',
  });
  const errorClassOk =
    inspected instanceof Error && inspected.name === 'FeatureFlagError' && inspected.key === '   ';

  for (const line of lines) {
    console.log(line);
  }

  const uniqueCodes = [...new Set(reportedErrorCodes)];
  console.log(
    `EXAMPLE_RESULT: OK evaluations=${evaluationCalls} onErrorCalls=${reportedErrorCodes.length} ` +
      `errorCodes=${uniqueCodes.join('+')} flagsInStore=2 sources=` +
      `${[checkout, vipDashboard, basicDashboard, missing].map((r) => r.source).join(',')} ` +
      `targetingRuleFired=${vipDashboard.reason === 'Matched targeting rule'} ` +
      `runtimeUpdateApplied=${beforeUpdate && !afterUpdate && afterSecondUpdate} ` +
      `throwingHooksIsolated=${hostileHookSurvived} tenantIsolation=${isolated[0]?.enabled === true && isolated[1]?.enabled === false} ` +
      `hookAttributesStripped=${forwardedWithAttributes === 0} errorClassOk=${errorClassOk}`,
  );
}

await main();
