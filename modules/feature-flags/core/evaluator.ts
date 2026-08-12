import { FeatureFlagError } from './error.js';
import { findMatchingTargetingRule } from './targeting.js';
import type { FeatureFlagConfig, FeatureFlagQuery, FeatureFlagResult, StoredFlag } from './types.js';

export async function evaluateFeatureFlag(
  query: FeatureFlagQuery,
  config: Required<Pick<FeatureFlagConfig, 'store'>> & Omit<FeatureFlagConfig, 'store'>,
): Promise<FeatureFlagResult> {
  const startedAt = Date.now();
  let result: FeatureFlagResult | undefined;

  try {
    if (!isValidFlagKey(query.key)) {
      const error = new FeatureFlagError({
        message: 'Feature flag key must be a non-empty string',
        code: 'FLAG_KEY_INVALID',
        key: typeof query.key === 'string' ? query.key : undefined,
      });

      notifyError(config, error, query);
      result = createFallbackResult(query, config, 'error_fallback', 'Invalid flag key');
      return result;
    }

    const storedFlag = await getStoredFlag(query, config);

    if (storedFlag === null) {
      result = createFallbackResult(query, config, 'default_fallback', 'Flag not found in store');
      return result;
    }

    const invalidValueError = validateStoredFlag(storedFlag, query.key);

    if (invalidValueError) {
      notifyError(config, invalidValueError, query);
      result = createFallbackResult(query, config, 'error_fallback', 'Invalid flag value');
      return result;
    }

    const matchedRule = findMatchingTargetingRule(storedFlag, query.context);

    result = {
      key: query.key,
      enabled: matchedRule?.enabled ?? storedFlag.enabled,
      source: 'store',
      reason: matchedRule ? 'Matched targeting rule' : 'Evaluated flag default state',
    };

    return result;
  } catch (cause) {
    if (cause instanceof FeatureFlagError && cause.code === 'FLAG_PROVIDER_ERROR') {
      result = createFallbackResult(query, config, 'error_fallback', 'Provider error: storage lookup failed');
      return result;
    }

    throw cause;
  } finally {
    if (result !== undefined) {
      notifyEvaluation(config, query, result, Date.now() - startedAt);
    }
  }
}

async function getStoredFlag(
  query: FeatureFlagQuery,
  config: Required<Pick<FeatureFlagConfig, 'store'>> & Omit<FeatureFlagConfig, 'store'>,
): Promise<StoredFlag | null> {
  try {
    return await config.store.getFlag(query.key, query.context);
  } catch (cause) {
    const error = new FeatureFlagError({
      message: 'Provider error: storage lookup failed',
      code: 'FLAG_PROVIDER_ERROR',
      key: query.key,
      cause,
    });

    notifyError(config, error, query);
    return Promise.reject(error);
  }
}

function validateStoredFlag(storedFlag: StoredFlag, key: string): FeatureFlagError | null {
  if (
    !isObjectRecord(storedFlag) ||
    typeof storedFlag.key !== 'string' ||
    typeof storedFlag.enabled !== 'boolean' ||
    (storedFlag.rules !== undefined && !areValidRules(storedFlag.rules))
  ) {
    return new FeatureFlagError({
      message: 'Stored feature flag must contain a string key and boolean enabled value',
      code: 'FLAG_VALUE_INVALID',
      key,
    });
  }

  return null;
}

function areValidRules(rules: StoredFlag['rules']): boolean {
  if (!Array.isArray(rules)) {
    return false;
  }

  return rules.every((rule) => typeof rule.enabled === 'boolean');
}

function createFallbackResult(
  query: FeatureFlagQuery,
  config: FeatureFlagConfig,
  source: 'default_fallback' | 'error_fallback',
  reason: string,
): FeatureFlagResult {
  return {
    key: typeof query.key === 'string' ? query.key : '',
    enabled: resolveFallbackValue(query, config),
    source,
    reason,
  };
}

function resolveFallbackValue(query: FeatureFlagQuery, config: FeatureFlagConfig): boolean {
  if (typeof query.defaultValue === 'boolean') {
    return query.defaultValue;
  }

  if (typeof config.defaultFallback === 'boolean') {
    return config.defaultFallback;
  }

  return false;
}

function isValidFlagKey(key: string): boolean {
  return typeof key === 'string' && key.trim().length > 0;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function notifyError(config: FeatureFlagConfig, error: FeatureFlagError, query: FeatureFlagQuery): void {
  try {
    config.hooks?.onError?.(error, query);
  } catch {
    // Hook failures are intentionally isolated from flag evaluation.
  }
}

function notifyEvaluation(
  config: FeatureFlagConfig,
  query: FeatureFlagQuery,
  result: FeatureFlagResult,
  durationMs: number,
): void {
  try {
    config.hooks?.onEvaluation?.({
      key: result.key,
      context: sanitizeContext(query.context),
      result,
      durationMs,
    });
  } catch {
    // Hook failures are intentionally isolated from flag evaluation.
  }
}

function sanitizeContext(context: FeatureFlagQuery['context']): FeatureFlagQuery['context'] {
  if (!context) {
    return undefined;
  }

  return {
    tenantId: context.tenantId,
    userId: context.userId,
    environment: context.environment,
  };
}
