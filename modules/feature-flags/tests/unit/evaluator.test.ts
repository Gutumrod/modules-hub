import { describe, it, expect, vi } from 'vitest';
import { evaluateFeatureFlag } from '../../core/evaluator.js';
import { FeatureFlagError } from '../../core/error.js';
import { createMemoryFlagStore } from '../../index.js';
import type { FeatureFlagStore, StoredFlag } from '../../index.js';

// ---------------------------------------------------------------------------
// evaluateFeatureFlag — internal evaluation engine
// ---------------------------------------------------------------------------

function makeConfig(
  overrides: { store?: FeatureFlagStore; defaultFallback?: boolean; hooks?: { onEvaluation?: ReturnType<typeof vi.fn>; onError?: ReturnType<typeof vi.fn> } } = {},
) {
  const store = overrides.store ?? createMemoryFlagStore();
  return {
    store,
    defaultFallback: overrides.defaultFallback,
    hooks: overrides.hooks ?? {},
  };
}

/** Builds a fake store returning an arbitrary value typed loosely for invalid-value tests. */
function fakeStoreReturning(value: unknown): FeatureFlagStore {
  return {
    async getFlag(): Promise<StoredFlag | null> {
      return value as StoredFlag | null;
    },
  };
}

/** Builds a fake store that throws on getFlag. */
function fakeStoreThrowing(error: unknown): FeatureFlagStore {
  return {
    async getFlag(): Promise<StoredFlag | null> {
      throw error;
    },
  };
}

describe('evaluateFeatureFlag', () => {
  describe('valid key -> store result', () => {
    it('returns the stored flag enabled state', async () => {
      const store = createMemoryFlagStore({ 'flag-true': true });
      const result = await evaluateFeatureFlag({ key: 'flag-true' }, makeConfig({ store }));
      expect(result).toEqual({
        key: 'flag-true',
        enabled: true,
        source: 'store',
        reason: 'Evaluated flag default state',
      });
    });

    it('returns false for a stored false flag', async () => {
      const store = createMemoryFlagStore({ 'flag-false': false });
      const result = await evaluateFeatureFlag({ key: 'flag-false' }, makeConfig({ store }));
      expect(result.enabled).toBe(false);
      expect(result.source).toBe('store');
    });

    it('returns matched targeting rule value when context matches', async () => {
      const flag: StoredFlag = {
        key: 'targeted',
        enabled: false,
        rules: [{ tenantId: 't1', enabled: true }],
      };
      const store = createMemoryFlagStore({ targeted: flag });
      const result = await evaluateFeatureFlag(
        { key: 'targeted', context: { tenantId: 't1' } },
        makeConfig({ store }),
      );
      expect(result.enabled).toBe(true);
      expect(result.source).toBe('store');
      expect(result.reason).toBe('Matched targeting rule');
    });
  });

  describe('missing flag -> default_fallback', () => {
    it('returns default_fallback with reason "Flag not found in store"', async () => {
      const store = createMemoryFlagStore();
      const result = await evaluateFeatureFlag({ key: 'nope' }, makeConfig({ store }));
      expect(result).toEqual({
        key: 'nope',
        enabled: false,
        source: 'default_fallback',
        reason: 'Flag not found in store',
      });
    });

    it('does not fire onError for a missing flag', async () => {
      const onError = vi.fn();
      const store = createMemoryFlagStore();
      await evaluateFeatureFlag(
        { key: 'nope' },
        makeConfig({ store, hooks: { onError } }),
      );
      expect(onError).not.toHaveBeenCalled();
    });
  });

  describe('provider error -> error_fallback + onError', () => {
    it('wraps provider errors into FLAG_PROVIDER_ERROR and returns error_fallback', async () => {
      const onError = vi.fn();
      const store = fakeStoreThrowing(new Error('storage exploded'));
      const result = await evaluateFeatureFlag(
        { key: 'fail' },
        makeConfig({ store, hooks: { onError } }),
      );
      expect(result).toEqual({
        key: 'fail',
        enabled: false,
        source: 'error_fallback',
        reason: 'Provider error: storage lookup failed',
      });
      expect(onError).toHaveBeenCalledTimes(1);
      const error = onError.mock.calls[0][0] as FeatureFlagError;
      expect(error).toBeInstanceOf(FeatureFlagError);
      expect(error.code).toBe('FLAG_PROVIDER_ERROR');
      expect(error.key).toBe('fail');
      expect(error.cause).toBeInstanceOf(Error);
    });

    it('uses query.defaultValue over false on provider error', async () => {
      const store = fakeStoreThrowing(new Error('fail'));
      const result = await evaluateFeatureFlag(
        { key: 'fail', defaultValue: true },
        makeConfig({ store }),
      );
      expect(result.enabled).toBe(true);
      expect(result.source).toBe('error_fallback');
    });
  });

  describe('invalid value -> error_fallback + onError', () => {
    it('triggers FLAG_VALUE_INVALID when stored flag has non-boolean enabled', async () => {
      const onError = vi.fn();
      const store = fakeStoreReturning({ key: 'bad', enabled: 'true' });
      const result = await evaluateFeatureFlag(
        { key: 'bad' },
        makeConfig({ store, hooks: { onError } }),
      );
      expect(result.source).toBe('error_fallback');
      expect(result.reason).toBe('Invalid flag value');
      expect(onError).toHaveBeenCalledTimes(1);
      const error = onError.mock.calls[0][0] as FeatureFlagError;
      expect(error.code).toBe('FLAG_VALUE_INVALID');
    });

    it('triggers FLAG_VALUE_INVALID when stored flag is malformed (not an object)', async () => {
      const onError = vi.fn();
      const store = fakeStoreReturning('not-a-flag');
      const result = await evaluateFeatureFlag(
        { key: 'malformed' },
        makeConfig({ store, hooks: { onError } }),
      );
      expect(result.source).toBe('error_fallback');
      expect(result.reason).toBe('Invalid flag value');
      expect(onError).toHaveBeenCalledTimes(1);
    });

    it('triggers FLAG_VALUE_INVALID when rules is not an array', async () => {
      const onError = vi.fn();
      const store = fakeStoreReturning({ key: 'badrules', enabled: true, rules: { tenantId: 'x' } });
      const result = await evaluateFeatureFlag(
        { key: 'badrules' },
        makeConfig({ store, hooks: { onError } }),
      );
      expect(result.source).toBe('error_fallback');
      expect(result.reason).toBe('Invalid flag value');
      expect(onError).toHaveBeenCalledTimes(1);
      expect((onError.mock.calls[0][0] as FeatureFlagError).code).toBe('FLAG_VALUE_INVALID');
    });
  });

  describe('invalid key -> error_fallback + onError', () => {
    it('returns error_fallback for an empty key', async () => {
      const onError = vi.fn();
      const result = await evaluateFeatureFlag(
        { key: '' },
        makeConfig({ hooks: { onError } }),
      );
      expect(result).toEqual({
        key: '',
        enabled: false,
        source: 'error_fallback',
        reason: 'Invalid flag key',
      });
      expect(onError).toHaveBeenCalledTimes(1);
      const error = onError.mock.calls[0][0] as FeatureFlagError;
      expect(error.code).toBe('FLAG_KEY_INVALID');
      expect(error.key).toBe('');
    });

    it('returns error_fallback for a whitespace-only key', async () => {
      const onError = vi.fn();
      const result = await evaluateFeatureFlag(
        { key: '   ' },
        makeConfig({ hooks: { onError } }),
      );
      expect(result.source).toBe('error_fallback');
      expect(result.reason).toBe('Invalid flag key');
      expect(onError).toHaveBeenCalledTimes(1);
      expect((onError.mock.calls[0][0] as FeatureFlagError).code).toBe('FLAG_KEY_INVALID');
    });

    it('does not call the store for an invalid key', async () => {
      const getFlag = vi.fn().mockResolvedValue(null);
      const store: FeatureFlagStore = { getFlag };
      await evaluateFeatureFlag({ key: '' }, makeConfig({ store }));
      expect(getFlag).not.toHaveBeenCalled();
    });
  });

  describe('fallback precedence: defaultValue > defaultFallback > false', () => {
    it('uses query.defaultValue when it is a boolean', async () => {
      const store = createMemoryFlagStore();
      const result = await evaluateFeatureFlag(
        { key: 'missing', defaultValue: true },
        makeConfig({ store, defaultFallback: false }),
      );
      expect(result.enabled).toBe(true);
    });

    it('uses config.defaultFallback when defaultValue is not a boolean', async () => {
      const store = createMemoryFlagStore();
      const result = await evaluateFeatureFlag(
        { key: 'missing' },
        makeConfig({ store, defaultFallback: true }),
      );
      expect(result.enabled).toBe(true);
    });

    it('falls back to false when neither defaultValue nor defaultFallback is boolean', async () => {
      const store = createMemoryFlagStore();
      const result = await evaluateFeatureFlag(
        { key: 'missing' },
        makeConfig({ store }),
      );
      expect(result.enabled).toBe(false);
    });

    it('defaultValue=false wins over defaultFallback=true', async () => {
      const store = createMemoryFlagStore();
      const result = await evaluateFeatureFlag(
        { key: 'missing', defaultValue: false },
        makeConfig({ store, defaultFallback: true }),
      );
      expect(result.enabled).toBe(false);
    });

    it('non-boolean defaultValue is ignored in favor of defaultFallback', async () => {
      const store = createMemoryFlagStore();
      const result = await evaluateFeatureFlag(
        { key: 'missing', defaultValue: undefined },
        makeConfig({ store, defaultFallback: true }),
      );
      expect(result.enabled).toBe(true);
    });

    it('precedence holds on error_fallback path too', async () => {
      const store = fakeStoreThrowing(new Error('fail'));
      const result = await evaluateFeatureFlag(
        { key: 'fail', defaultValue: true },
        makeConfig({ store, defaultFallback: false }),
      );
      expect(result.enabled).toBe(true);
      expect(result.source).toBe('error_fallback');
    });
  });

  describe('onEvaluation fires on all paths', () => {
    it('fires onEvaluation on store hit', async () => {
      const onEvaluation = vi.fn();
      const store = createMemoryFlagStore({ hit: true });
      await evaluateFeatureFlag(
        { key: 'hit' },
        makeConfig({ store, hooks: { onEvaluation } }),
      );
      expect(onEvaluation).toHaveBeenCalledTimes(1);
    });

    it('fires onEvaluation on default_fallback', async () => {
      const onEvaluation = vi.fn();
      const store = createMemoryFlagStore();
      await evaluateFeatureFlag(
        { key: 'missing' },
        makeConfig({ store, hooks: { onEvaluation } }),
      );
      expect(onEvaluation).toHaveBeenCalledTimes(1);
      expect(onEvaluation.mock.calls[0][0].result.source).toBe('default_fallback');
    });

    it('fires onEvaluation on error_fallback (provider error)', async () => {
      const onEvaluation = vi.fn();
      const store = fakeStoreThrowing(new Error('fail'));
      await evaluateFeatureFlag(
        { key: 'fail' },
        makeConfig({ store, hooks: { onEvaluation } }),
      );
      expect(onEvaluation).toHaveBeenCalledTimes(1);
      expect(onEvaluation.mock.calls[0][0].result.source).toBe('error_fallback');
    });

    it('fires onEvaluation on error_fallback (invalid key)', async () => {
      const onEvaluation = vi.fn();
      await evaluateFeatureFlag(
        { key: '' },
        makeConfig({ hooks: { onEvaluation } }),
      );
      expect(onEvaluation).toHaveBeenCalledTimes(1);
      expect(onEvaluation.mock.calls[0][0].result.source).toBe('error_fallback');
    });

    it('fires onEvaluation on error_fallback (invalid value)', async () => {
      const onEvaluation = vi.fn();
      const store = fakeStoreReturning({ key: 'bad', enabled: 'no' });
      await evaluateFeatureFlag(
        { key: 'bad' },
        makeConfig({ store, hooks: { onEvaluation } }),
      );
      expect(onEvaluation).toHaveBeenCalledTimes(1);
      expect(onEvaluation.mock.calls[0][0].result.source).toBe('error_fallback');
    });

    it('sanitizes context in onEvaluation info (drops attributes)', async () => {
      const onEvaluation = vi.fn();
      const store = createMemoryFlagStore({ ctx: true });
      await evaluateFeatureFlag(
        { key: 'ctx', context: { tenantId: 't1', attributes: { secret: 'leak' } } },
        makeConfig({ store, hooks: { onEvaluation } }),
      );
      const info = onEvaluation.mock.calls[0][0];
      expect(info.context.tenantId).toBe('t1');
      expect(info.context.attributes).toBeUndefined();
    });
  });

  describe('hook exception isolation', () => {
    it('onEvaluation throwing does not affect the result', async () => {
      const onEvaluation = vi.fn(() => {
        throw new Error('eval hook boom');
      });
      const store = createMemoryFlagStore({ safe: true });
      const result = await evaluateFeatureFlag(
        { key: 'safe' },
        makeConfig({ store, hooks: { onEvaluation } }),
      );
      expect(result.enabled).toBe(true);
      expect(result.source).toBe('store');
    });

    it('onError throwing does not affect the result', async () => {
      const onError = vi.fn(() => {
        throw new Error('error hook boom');
      });
      const store = fakeStoreThrowing(new Error('store fail'));
      const result = await evaluateFeatureFlag(
        { key: 'fail' },
        makeConfig({ store, hooks: { onError } }),
      );
      expect(result.source).toBe('error_fallback');
    });
  });
});