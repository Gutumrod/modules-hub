import { describe, it, expect } from 'vitest';
import { findMatchingTargetingRule } from '../../core/targeting.js';
import { evaluateFeatureFlag } from '../../core/evaluator.js';
import { createMemoryFlagStore } from '../../index.js';
import type { StoredFlag, FeatureFlagContext } from '../../index.js';

// ---------------------------------------------------------------------------
// Targeting rule matching — findMatchingTargetingRule + end-to-end evaluation
// ---------------------------------------------------------------------------

describe('targeting rule matching', () => {
  describe('findMatchingTargetingRule (direct)', () => {
    it('matches a rule by tenantId', () => {
      const flag: StoredFlag = {
        key: 'f',
        enabled: false,
        rules: [{ tenantId: 't1', enabled: true }],
      };
      const ctx: FeatureFlagContext = { tenantId: 't1' };
      const rule = findMatchingTargetingRule(flag, ctx);
      expect(rule).not.toBeNull();
      expect(rule?.enabled).toBe(true);
    });

    it('does not match when tenantId differs', () => {
      const flag: StoredFlag = {
        key: 'f',
        enabled: false,
        rules: [{ tenantId: 't1', enabled: true }],
      };
      const ctx: FeatureFlagContext = { tenantId: 't2' };
      const rule = findMatchingTargetingRule(flag, ctx);
      expect(rule).toBeNull();
    });

    it('matches a rule by userId', () => {
      const flag: StoredFlag = {
        key: 'f',
        enabled: false,
        rules: [{ userId: 'u1', enabled: true }],
      };
      const ctx: FeatureFlagContext = { userId: 'u1' };
      const rule = findMatchingTargetingRule(flag, ctx);
      expect(rule?.enabled).toBe(true);
    });

    it('does not match when userId differs', () => {
      const flag: StoredFlag = {
        key: 'f',
        enabled: false,
        rules: [{ userId: 'u1', enabled: true }],
      };
      const ctx: FeatureFlagContext = { userId: 'u2' };
      const rule = findMatchingTargetingRule(flag, ctx);
      expect(rule).toBeNull();
    });

    it('matches a rule by environment (dev)', () => {
      const flag: StoredFlag = {
        key: 'f',
        enabled: false,
        rules: [{ environment: 'dev', enabled: true }],
      };
      const ctx: FeatureFlagContext = { environment: 'dev' };
      const rule = findMatchingTargetingRule(flag, ctx);
      expect(rule?.enabled).toBe(true);
    });

    it('matches a rule by environment (prod)', () => {
      const flag: StoredFlag = {
        key: 'f',
        enabled: true,
        rules: [{ environment: 'prod', enabled: false }],
      };
      const ctx: FeatureFlagContext = { environment: 'prod' };
      const rule = findMatchingTargetingRule(flag, ctx);
      expect(rule?.enabled).toBe(false);
    });

    it('does not match when environment differs', () => {
      const flag: StoredFlag = {
        key: 'f',
        enabled: false,
        rules: [{ environment: 'prod', enabled: true }],
      };
      const ctx: FeatureFlagContext = { environment: 'staging' };
      const rule = findMatchingTargetingRule(flag, ctx);
      expect(rule).toBeNull();
    });
  });

  describe('multi-field AND rule', () => {
    it('matches when all specified fields match (tenantId + environment)', () => {
      const flag: StoredFlag = {
        key: 'f',
        enabled: false,
        rules: [{ tenantId: 't1', environment: 'prod', enabled: true }],
      };
      const ctx: FeatureFlagContext = { tenantId: 't1', environment: 'prod' };
      const rule = findMatchingTargetingRule(flag, ctx);
      expect(rule?.enabled).toBe(true);
    });

    it('does not match when one field differs (AND semantics)', () => {
      const flag: StoredFlag = {
        key: 'f',
        enabled: false,
        rules: [{ tenantId: 't1', environment: 'prod', enabled: true }],
      };
      const ctx: FeatureFlagContext = { tenantId: 't1', environment: 'dev' };
      const rule = findMatchingTargetingRule(flag, ctx);
      expect(rule).toBeNull();
    });

    it('matches a 3-field rule (tenantId + userId + environment)', () => {
      const flag: StoredFlag = {
        key: 'f',
        enabled: false,
        rules: [{ tenantId: 't1', userId: 'u1', environment: 'prod', enabled: true }],
      };
      const ctx: FeatureFlagContext = { tenantId: 't1', userId: 'u1', environment: 'prod' };
      const rule = findMatchingTargetingRule(flag, ctx);
      expect(rule?.enabled).toBe(true);
    });

    it('does not match a 3-field rule when one field is wrong', () => {
      const flag: StoredFlag = {
        key: 'f',
        enabled: false,
        rules: [{ tenantId: 't1', userId: 'u1', environment: 'prod', enabled: true }],
      };
      const ctx: FeatureFlagContext = { tenantId: 't1', userId: 'u2', environment: 'prod' };
      const rule = findMatchingTargetingRule(flag, ctx);
      expect(rule).toBeNull();
    });

    it('omitted fields in a rule act as wildcards', () => {
      const flag: StoredFlag = {
        key: 'f',
        enabled: false,
        rules: [{ tenantId: 't1', enabled: true }],
      };
      // Context provides extra fields not in the rule — rule should still match
      const ctx: FeatureFlagContext = { tenantId: 't1', userId: 'u9', environment: 'dev' };
      const rule = findMatchingTargetingRule(flag, ctx);
      expect(rule?.enabled).toBe(true);
    });
  });

  describe('first-match-wins', () => {
    it('returns the first matching rule when multiple match', () => {
      const flag: StoredFlag = {
        key: 'f',
        enabled: false,
        rules: [
          { tenantId: 't1', enabled: true },
          { tenantId: 't1', enabled: false },
        ],
      };
      const ctx: FeatureFlagContext = { tenantId: 't1' };
      const rule = findMatchingTargetingRule(flag, ctx);
      expect(rule?.enabled).toBe(true);
    });

    it('skips non-matching rules and returns the first match', () => {
      const flag: StoredFlag = {
        key: 'f',
        enabled: false,
        rules: [
          { tenantId: 't9', enabled: true },
          { tenantId: 't1', enabled: false },
          { tenantId: 't1', enabled: true },
        ],
      };
      const ctx: FeatureFlagContext = { tenantId: 't1' };
      const rule = findMatchingTargetingRule(flag, ctx);
      expect(rule?.enabled).toBe(false);
    });
  });

  describe('no rules -> flag default', () => {
    it('returns null when flag has no rules', () => {
      const flag: StoredFlag = { key: 'f', enabled: true };
      const ctx: FeatureFlagContext = { tenantId: 't1' };
      const rule = findMatchingTargetingRule(flag, ctx);
      expect(rule).toBeNull();
    });

    it('returns null when rules array is empty', () => {
      const flag: StoredFlag = { key: 'f', enabled: true, rules: [] };
      const ctx: FeatureFlagContext = { tenantId: 't1' };
      const rule = findMatchingTargetingRule(flag, ctx);
      expect(rule).toBeNull();
    });
  });

  describe('no context -> flag default', () => {
    it('returns null when context is undefined', () => {
      const flag: StoredFlag = {
        key: 'f',
        enabled: true,
        rules: [{ tenantId: 't1', enabled: false }],
      };
      const rule = findMatchingTargetingRule(flag, undefined);
      expect(rule).toBeNull();
    });

    it('returns null when context is an empty object', () => {
      const flag: StoredFlag = {
        key: 'f',
        enabled: true,
        rules: [{ tenantId: 't1', enabled: false }],
      };
      const rule = findMatchingTargetingRule(flag, {});
      expect(rule).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // End-to-end through evaluateFeatureFlag
  // -----------------------------------------------------------------------

  describe('end-to-end evaluation with targeting', () => {
    function makeConfig(store: ReturnType<typeof createMemoryFlagStore>) {
      return { store, hooks: {} };
    }

    it('tenant context matching rule overrides flag default', async () => {
      const flag: StoredFlag = {
        key: 'tenant-flag',
        enabled: false,
        rules: [{ tenantId: 'acme', enabled: true }],
      };
      const store = createMemoryFlagStore({ 'tenant-flag': flag });
      const result = await evaluateFeatureFlag(
        { key: 'tenant-flag', context: { tenantId: 'acme' } },
        makeConfig(store),
      );
      expect(result.enabled).toBe(true);
      expect(result.source).toBe('store');
      expect(result.reason).toBe('Matched targeting rule');
    });

    it('tenant context non-matching falls back to flag default', async () => {
      const flag: StoredFlag = {
        key: 'tenant-flag',
        enabled: false,
        rules: [{ tenantId: 'acme', enabled: true }],
      };
      const store = createMemoryFlagStore({ 'tenant-flag': flag });
      const result = await evaluateFeatureFlag(
        { key: 'tenant-flag', context: { tenantId: 'other' } },
        makeConfig(store),
      );
      expect(result.enabled).toBe(false);
      expect(result.reason).toBe('Evaluated flag default state');
    });

    it('environment context dev/prod evaluate independently', async () => {
      const flag: StoredFlag = {
        key: 'env-flag',
        enabled: true,
        rules: [
          { environment: 'dev', enabled: false },
          { environment: 'prod', enabled: true },
        ],
      };
      const store = createMemoryFlagStore({ 'env-flag': flag });

      const devResult = await evaluateFeatureFlag(
        { key: 'env-flag', context: { environment: 'dev' } },
        makeConfig(store),
      );
      const prodResult = await evaluateFeatureFlag(
        { key: 'env-flag', context: { environment: 'prod' } },
        makeConfig(store),
      );
      const stagingResult = await evaluateFeatureFlag(
        { key: 'env-flag', context: { environment: 'staging' } },
        makeConfig(store),
      );

      expect(devResult.enabled).toBe(false);
      expect(devResult.reason).toBe('Matched targeting rule');
      expect(prodResult.enabled).toBe(true);
      expect(prodResult.reason).toBe('Matched targeting rule');
      // staging matches no rule -> flag default (true)
      expect(stagingResult.enabled).toBe(true);
      expect(stagingResult.reason).toBe('Evaluated flag default state');
    });

    it('multi-field AND rule matches end-to-end', async () => {
      const flag: StoredFlag = {
        key: 'and-flag',
        enabled: false,
        rules: [{ tenantId: 't1', environment: 'prod', enabled: true }],
      };
      const store = createMemoryFlagStore({ 'and-flag': flag });

      const matchResult = await evaluateFeatureFlag(
        { key: 'and-flag', context: { tenantId: 't1', environment: 'prod' } },
        makeConfig(store),
      );
      const noMatchResult = await evaluateFeatureFlag(
        { key: 'and-flag', context: { tenantId: 't1', environment: 'dev' } },
        makeConfig(store),
      );

      expect(matchResult.enabled).toBe(true);
      expect(matchResult.reason).toBe('Matched targeting rule');
      expect(noMatchResult.enabled).toBe(false);
      expect(noMatchResult.reason).toBe('Evaluated flag default state');
    });

    it('first-match-wins end-to-end', async () => {
      const flag: StoredFlag = {
        key: 'first-match',
        enabled: false,
        rules: [
          { tenantId: 't1', enabled: true },
          { tenantId: 't1', enabled: false },
        ],
      };
      const store = createMemoryFlagStore({ 'first-match': flag });
      const result = await evaluateFeatureFlag(
        { key: 'first-match', context: { tenantId: 't1' } },
        makeConfig(store),
      );
      expect(result.enabled).toBe(true);
      expect(result.reason).toBe('Matched targeting rule');
    });

    it('no context -> flag default end-to-end', async () => {
      const flag: StoredFlag = {
        key: 'no-ctx',
        enabled: true,
        rules: [{ tenantId: 't1', enabled: false }],
      };
      const store = createMemoryFlagStore({ 'no-ctx': flag });
      const result = await evaluateFeatureFlag(
        { key: 'no-ctx' },
        makeConfig(store),
      );
      expect(result.enabled).toBe(true);
      expect(result.reason).toBe('Evaluated flag default state');
    });

    it('no rules -> flag default end-to-end', async () => {
      const flag: StoredFlag = { key: 'no-rules', enabled: true };
      const store = createMemoryFlagStore({ 'no-rules': flag });
      const result = await evaluateFeatureFlag(
        { key: 'no-rules', context: { tenantId: 't1' } },
        makeConfig(store),
      );
      expect(result.enabled).toBe(true);
      expect(result.reason).toBe('Evaluated flag default state');
    });
  });
});