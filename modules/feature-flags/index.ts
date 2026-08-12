export { createFeatureFlagClient, FeatureFlagError } from './core/index.js';
export { createMemoryFlagStore } from './adapters/index.js';
export type {
  FeatureFlagClient,
  FeatureFlagConfig,
  FeatureFlagContext,
  FeatureFlagErrorCode,
  FeatureFlagLoggingHooks,
  FeatureFlagQuery,
  FeatureFlagResult,
  FeatureFlagStore,
  FlagTargetingRule,
  SanitizedFlagEvaluationInfo,
  StoredFlag,
} from './core/index.js';
export type { MemoryFeatureFlagStore } from './adapters/index.js';
