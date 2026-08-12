import { describe, it, expect, vi } from 'vitest';
import { FeatureFlagError } from '../../index.js';
import { evaluateFeatureFlag } from '../../core/evaluator.js';
import { createMemoryFlagStore } from '../../index.js';
import type { FeatureFlagStore, StoredFlag } from '../../index.js';

// ---------------------------------------------------------------------------
// Error handling and FeatureFlagError class shape
// ---------------------------------------------------------------------------

function makeConfig(
  overrides: { store?: FeatureFlagStore; hooks?: { onEvaluation?: ReturnType<typeof vi.fn>; onError?: ReturnType<typeof vi.fn> } } = {},
) {
  const store = overrides.store ?? createMemoryFlagStore();
  return { store, hooks: overrides.hooks ?? {} };
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

describe('error handling', () => {
  describe('FLAG_VALUE_INVALID — invalid stored flag value', () => {
    it('non-boolean enabled triggers error_fallback + onError', async () => {
      const onError = vi.fn();
      const store = fakeStoreReturning({ key: 'bad', enabled: 'true' });
      const result = await evaluateFeatureFlag(
        { key: 'bad' },
        makeConfig({ store, hooks: { onError } }),
      );
      expect(result).toEqual({
        key: 'bad',
        enabled: false,
        source: 'error_fallback',
        reason: 'Invalid flag value',
      });
      expect(onError).toHaveBeenCalledTimes(1);
      const error = onError.mock.calls[0][0] as FeatureFlagError;
      expect(error.code).toBe('FLAG_VALUE_INVALID');
      expect(error.key).toBe('bad');
    });

    it('enabled as number triggers error_fallback', async () => {
      const onError = vi.fn();
      const store = fakeStoreReturning({ key: 'num', enabled: 1 });
      const result = await evaluateFeatureFlag(
        { key: 'num' },
        makeConfig({ store, hooks: { onError } }),
      );
      expect(result.source).toBe('error_fallback');
      expect(result.reason).toBe('Invalid flag value');
      expect((onError.mock.calls[0][0] as FeatureFlagError).code).toBe('FLAG_VALUE_INVALID');
    });

    it('enabled as null triggers error_fallback', async () => {
      const onError = vi.fn();
      const store = fakeStoreReturning({ key: 'nullish', enabled: null });
      const result = await evaluateFeatureFlag(
        { key: 'nullish' },
        makeConfig({ store, hooks: { onError } }),
      );
      expect(result.source).toBe('error_fallback');
      expect(result.reason).toBe('Invalid flag value');
    });

    it('enabled undefined triggers error_fallback', async () => {
      const onError = vi.fn();
      const store = fakeStoreReturning({ key: 'undef' });
      const result = await evaluateFeatureFlag(
        { key: 'undef' },
        makeConfig({ store, hooks: { onError } }),
      );
      expect(result.source).toBe('error_fallback');
      expect(result.reason).toBe('Invalid flag value');
    });

    it('malformed structure (string instead of object) triggers error_fallback', async () => {
      const onError = vi.fn();
      const store = fakeStoreReturning('totally-broken');
      const result = await evaluateFeatureFlag(
        { key: 'broken' },
        makeConfig({ store, hooks: { onError } }),
      );
      expect(result.source).toBe('error_fallback');
      expect(result.reason).toBe('Invalid flag value');
      expect((onError.mock.calls[0][0] as FeatureFlagError).code).toBe('FLAG_VALUE_INVALID');
    });

    it('malformed structure (array instead of object) triggers error_fallback', async () => {
      const onError = vi.fn();
      const store = fakeStoreReturning([1, 2, 3]);
      const result = await evaluateFeatureFlag(
        { key: 'arr' },
        makeConfig({ store, hooks: { onError } }),
      );
      expect(result.source).toBe('error_fallback');
      expect(result.reason).toBe('Invalid flag value');
    });

    it('malformed structure (null) is treated as missing flag -> default_fallback', async () => {
      const onError = vi.fn();
      const store = fakeStoreReturning(null);
      // Note: null is treated as "missing flag" -> default_fallback, not invalid value.
      // This test confirms the distinction: null returns default_fallback.
      const result = await evaluateFeatureFlag(
        { key: 'null-store' },
        makeConfig({ store, hooks: { onError } }),
      );
      expect(result.source).toBe('default_fallback');
      expect(result.reason).toBe('Flag not found in store');
      expect(onError).not.toHaveBeenCalled();
    });

    it('non-boolean rule.enabled triggers error_fallback', async () => {
      const onError = vi.fn();
      const store = fakeStoreReturning({ key: 'badrule', enabled: true, rules: [{ tenantId: 't1', enabled: 'yes' }] });
      const result = await evaluateFeatureFlag(
        { key: 'badrule' },
        makeConfig({ store, hooks: { onError } }),
      );
      expect(result.source).toBe('error_fallback');
      expect(result.reason).toBe('Invalid flag value');
      expect((onError.mock.calls[0][0] as FeatureFlagError).code).toBe('FLAG_VALUE_INVALID');
    });

    it('rules not an array triggers error_fallback', async () => {
      const onError = vi.fn();
      const store = fakeStoreReturning({ key: 'badrules', enabled: true, rules: 'not-array' });
      const result = await evaluateFeatureFlag(
        { key: 'badrules' },
        makeConfig({ store, hooks: { onError } }),
      );
      expect(result.source).toBe('error_fallback');
      expect(result.reason).toBe('Invalid flag value');
    });

    it('missing key on stored flag triggers error_fallback', async () => {
      const onError = vi.fn();
      const store = fakeStoreReturning({ enabled: true });
      const result = await evaluateFeatureFlag(
        { key: 'nokey' },
        makeConfig({ store, hooks: { onError } }),
      );
      expect(result.source).toBe('error_fallback');
      expect(result.reason).toBe('Invalid flag value');
    });

    it('uses defaultValue on invalid value path', async () => {
      const store = fakeStoreReturning({ key: 'bad', enabled: 'no' });
      const result = await evaluateFeatureFlag(
        { key: 'bad', defaultValue: true },
        makeConfig({ store }),
      );
      expect(result.enabled).toBe(true);
      expect(result.source).toBe('error_fallback');
    });
  });

  describe('FLAG_KEY_INVALID — invalid key', () => {
    it('empty string key triggers error_fallback + onError', async () => {
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

    it('whitespace-only key triggers error_fallback + onError', async () => {
      const onError = vi.fn();
      const result = await evaluateFeatureFlag(
        { key: '   ' },
        makeConfig({ hooks: { onError } }),
      );
      expect(result.source).toBe('error_fallback');
      expect(result.reason).toBe('Invalid flag key');
      expect((onError.mock.calls[0][0] as FeatureFlagError).code).toBe('FLAG_KEY_INVALID');
    });

    it('tab-only key triggers error_fallback', async () => {
      const onError = vi.fn();
      const result = await evaluateFeatureFlag(
        { key: '\t\t' },
        makeConfig({ hooks: { onError } }),
      );
      expect(result.source).toBe('error_fallback');
      expect(result.reason).toBe('Invalid flag key');
      expect((onError.mock.calls[0][0] as FeatureFlagError).code).toBe('FLAG_KEY_INVALID');
    });

    it('does not call store.getFlag for an invalid key', async () => {
      const getFlag = vi.fn().mockResolvedValue(null);
      const store: FeatureFlagStore = { getFlag };
      await evaluateFeatureFlag({ key: '' }, makeConfig({ store }));
      expect(getFlag).not.toHaveBeenCalled();
    });

    it('uses defaultValue on invalid key path', async () => {
      const result = await evaluateFeatureFlag(
        { key: '', defaultValue: true },
        makeConfig(),
      );
      expect(result.enabled).toBe(true);
      expect(result.source).toBe('error_fallback');
    });
  });

  describe('FLAG_PROVIDER_ERROR — store throws', () => {
    it('store throwing Error triggers error_fallback + onError', async () => {
      const onError = vi.fn();
      const store = fakeStoreThrowing(new Error('connection refused'));
      const result = await evaluateFeatureFlag(
        { key: 'p' },
        makeConfig({ store, hooks: { onError } }),
      );
      expect(result).toEqual({
        key: 'p',
        enabled: false,
        source: 'error_fallback',
        reason: 'Provider error: storage lookup failed',
      });
      expect(onError).toHaveBeenCalledTimes(1);
      const error = onError.mock.calls[0][0] as FeatureFlagError;
      expect(error.code).toBe('FLAG_PROVIDER_ERROR');
      expect(error.key).toBe('p');
      expect(error.cause).toBeInstanceOf(Error);
    });

    it('store throwing non-Error triggers error_fallback + onError', async () => {
      const onError = vi.fn();
      const store = fakeStoreThrowing('string error');
      const result = await evaluateFeatureFlag(
        { key: 'p2' },
        makeConfig({ store, hooks: { onError } }),
      );
      expect(result.source).toBe('error_fallback');
      expect(result.reason).toBe('Provider error: storage lookup failed');
      expect((onError.mock.calls[0][0] as FeatureFlagError).code).toBe('FLAG_PROVIDER_ERROR');
      expect((onError.mock.calls[0][0] as FeatureFlagError).cause).toBe('string error');
    });
  });
});

// ---------------------------------------------------------------------------
// FeatureFlagError class shape
// ---------------------------------------------------------------------------

describe('FeatureFlagError class', () => {
  it('is an instance of Error', () => {
    const err = new FeatureFlagError({
      message: 'test',
      code: 'FLAG_KEY_INVALID',
    });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(FeatureFlagError);
  });

  it('has the correct name', () => {
    const err = new FeatureFlagError({
      message: 'test',
      code: 'FLAG_VALUE_INVALID',
    });
    expect(err.name).toBe('FeatureFlagError');
  });

  it('has the correct code', () => {
    const err = new FeatureFlagError({
      message: 'test',
      code: 'FLAG_PROVIDER_ERROR',
    });
    expect(err.code).toBe('FLAG_PROVIDER_ERROR');
  });

  it('carries the key when provided', () => {
    const err = new FeatureFlagError({
      message: 'test',
      code: 'FLAG_KEY_INVALID',
      key: 'my-flag',
    });
    expect(err.key).toBe('my-flag');
  });

  it('key is undefined when not provided', () => {
    const err = new FeatureFlagError({
      message: 'test',
      code: 'FLAG_KEY_INVALID',
    });
    expect(err.key).toBeUndefined();
  });

  it('carries the cause when provided', () => {
    const cause = new Error('root cause');
    const err = new FeatureFlagError({
      message: 'wrapped',
      code: 'FLAG_PROVIDER_ERROR',
      cause,
    });
    expect(err.cause).toBe(cause);
  });

  it('cause is undefined when not provided', () => {
    const err = new FeatureFlagError({
      message: 'test',
      code: 'FLAG_KEY_INVALID',
    });
    expect(err.cause).toBeUndefined();
  });

  it('has the provided message', () => {
    const err = new FeatureFlagError({
      message: 'something went wrong',
      code: 'FLAG_KEY_INVALID',
    });
    expect(err.message).toBe('something went wrong');
  });

  it('all three error codes are assignable', () => {
    const codes: string[] = [
      new FeatureFlagError({ message: 'a', code: 'FLAG_KEY_INVALID' }).code,
      new FeatureFlagError({ message: 'b', code: 'FLAG_PROVIDER_ERROR' }).code,
      new FeatureFlagError({ message: 'c', code: 'FLAG_VALUE_INVALID' }).code,
    ];
    expect(codes).toEqual(['FLAG_KEY_INVALID', 'FLAG_PROVIDER_ERROR', 'FLAG_VALUE_INVALID']);
  });
});