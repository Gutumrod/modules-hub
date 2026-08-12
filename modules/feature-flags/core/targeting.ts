import type { FeatureFlagContext, FlagTargetingRule, StoredFlag } from './types.js';

export function findMatchingTargetingRule(
  flag: StoredFlag,
  context?: FeatureFlagContext,
): FlagTargetingRule | null {
  if (!context || !flag.rules?.length) {
    return null;
  }

  for (const rule of flag.rules) {
    if (matchesRule(rule, context)) {
      return rule;
    }
  }

  return null;
}

function matchesRule(rule: FlagTargetingRule, context: FeatureFlagContext): boolean {
  if (rule.tenantId !== undefined && rule.tenantId !== context.tenantId) {
    return false;
  }

  if (rule.userId !== undefined && rule.userId !== context.userId) {
    return false;
  }

  if (rule.environment !== undefined && rule.environment !== context.environment) {
    return false;
  }

  return true;
}
