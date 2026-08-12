import { evaluateFeatureFlag } from './evaluator.js';
import type { FeatureFlagConfig, FeatureFlagQuery, FeatureFlagResult, FeatureFlagStore } from './types.js';

export interface FeatureFlagClient {
  /**
   * Evaluates a feature flag and returns a boolean state.
   * Shortcut for getFlag(), extracting the `enabled` field.
   */
  isEnabled(query: FeatureFlagQuery): Promise<boolean>;

  /**
   * Evaluates a feature flag and returns full diagnostic metadata.
   */
  getFlag(query: FeatureFlagQuery): Promise<FeatureFlagResult>;
}

export function createFeatureFlagClient(config: FeatureFlagConfig = {}): FeatureFlagClient {
  const resolvedConfig = {
    ...config,
    store: config.store ?? createEmptyFlagStore(),
  };

  return {
    async isEnabled(query: FeatureFlagQuery): Promise<boolean> {
      const result = await this.getFlag(query);
      return result.enabled;
    },

    getFlag(query: FeatureFlagQuery): Promise<FeatureFlagResult> {
      return evaluateFeatureFlag(query, resolvedConfig);
    },
  };
}

function createEmptyFlagStore(): FeatureFlagStore {
  return {
    async getFlag(): Promise<null> {
      return null;
    },
  };
}
