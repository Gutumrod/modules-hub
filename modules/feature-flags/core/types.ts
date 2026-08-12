import type { FeatureFlagError } from './error.js';

/** Context passed with a feature flag query to evaluate targeting rules */
export type FeatureFlagContext = {
  tenantId?: string;
  userId?: string;
  environment?: string;
  attributes?: Record<string, string | number | boolean>;
};

/** Input query options for evaluating a feature flag */
export type FeatureFlagQuery = {
  key: string;
  context?: FeatureFlagContext;
  defaultValue?: boolean;
};

/** Detailed evaluation result returned by getFlag() */
export type FeatureFlagResult = {
  key: string;
  enabled: boolean;
  source: 'store' | 'default_fallback' | 'error_fallback';
  reason: string;
};

/** Targeted rule for v0.1 simple exact matching */
export type FlagTargetingRule = {
  tenantId?: string;
  userId?: string;
  environment?: string;
  enabled: boolean;
};

/** Representation of a flag record stored in a FeatureFlagStore */
export type StoredFlag = {
  key: string;
  enabled: boolean;
  rules?: FlagTargetingRule[];
  metadata?: Record<string, unknown>;
};

/** Abstract Store contract injected by Host */
export interface FeatureFlagStore {
  getFlag(key: string, context?: FeatureFlagContext): Promise<StoredFlag | null>;
}

/** Logging & Telemetry Hooks */
export type SanitizedFlagEvaluationInfo = {
  key: string;
  context?: FeatureFlagContext;
  result: FeatureFlagResult;
  durationMs: number;
};

/** Logging hooks interface */
export type FeatureFlagLoggingHooks = {
  onEvaluation?: (info: SanitizedFlagEvaluationInfo) => void;
  onError?: (error: FeatureFlagError, query: FeatureFlagQuery) => void;
};

/** Host-injected client configuration */
export type FeatureFlagConfig = {
  /** Feature flag store implementation (Defaults to empty memory store) */
  store?: FeatureFlagStore;
  /** Global default fallback value if none provided in query (Default: false) */
  defaultFallback?: boolean;
  /** Logging and telemetry hooks */
  hooks?: FeatureFlagLoggingHooks;
};
