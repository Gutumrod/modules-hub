import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFeatureFlagClient, createMemoryFlagStore } from '../../index.js';
import type { FeatureFlagStore, StoredFlag } from '../../index.js';

// ---------------------------------------------------------------------------
// createFeatureFlagClient — public client surface
// ---------------------------------------------------------------------------

describe('createFeatureFlagClient', () => {
  describe('basic flag evaluation', () => {
    it('returns enabled=true for a stored flag with enabled=true', async () => {
      const store = createMemoryFlagStore({ 'feature-a': true });
      const client = createFeatureFlagClient({ store });

      const result = await client.getFlag({ key: 'feature-a' });
      expect(result).toEqual({
        key: 'feature-a',
        enabled: true,
        source: 'store',
        reason: 'Evaluated flag default state',
      });
    });

    it('returns enabled=false for a stored flag with enabled=false', async () => {
      const store = createMemoryFlagStore({ 'feature-b': false });
      const client = createFeatureFlagClient({ store });

      const result = await client.getFlag({ key: 'feature-b' });
      expect(result).toEqual({
        key: 'feature-b',
        enabled: false,
        source: 'store',
        reason: 'Evaluated flag default state',
      });
    });

    it('returns default_fallback for a missing flag', async () => {
      const store = createMemoryFlagStore();
      const client = createFeatureFlagClient({ store });

      const result = await client.getFlag({ key: 'missing' });
      expect(result.source).toBe('default_fallback');
      expect(result.reason).toBe('Flag not found in store');
      expect(result.enabled).toBe(false);
    });

    it('uses query.defaultValue=true for a missing flag', async () => {
      const store = createMemoryFlagStore();
      const client = createFeatureFlagClient({ store });

      const result = await client.getFlag({ key: 'missing', defaultValue: true });
      expect(result.enabled).toBe(true);
      expect(result.source).toBe('default_fallback');
    });

    it('uses query.defaultValue=false for a missing flag', async () => {
      const store = createMemoryFlagStore();
      const client = createFeatureFlagClient({ store });

      const result = await client.getFlag({ key: 'missing', defaultValue: false });
      expect(result.enabled).toBe(false);
      expect(result.source).toBe('default_fallback');
    });

    it('returns error_fallback when the store throws', async () => {
      const store: FeatureFlagStore = {
        async getFlag(): Promise<never> {
          throw new Error('db down');
        },
      };
      const client = createFeatureFlagClient({ store });

      const result = await client.getFlag({ key: 'fail' });
      expect(result.source).toBe('error_fallback');
      expect(result.reason).toBe('Provider error: storage lookup failed');
      expect(result.enabled).toBe(false);
    });

    it('uses empty store default (false) when no store is configured', async () => {
      const client = createFeatureFlagClient();

      const result = await client.getFlag({ key: 'any' });
      expect(result.source).toBe('default_fallback');
      expect(result.enabled).toBe(false);
    });
  });

  describe('defaultFallback config', () => {
    it('honors config.defaultFallback=true for missing flags', async () => {
      const store = createMemoryFlagStore();
      const client = createFeatureFlagClient({ store, defaultFallback: true });

      const result = await client.getFlag({ key: 'missing' });
      expect(result.enabled).toBe(true);
      expect(result.source).toBe('default_fallback');
    });

    it('honors config.defaultFallback=false for missing flags', async () => {
      const store = createMemoryFlagStore();
      const client = createFeatureFlagClient({ store, defaultFallback: false });

      const result = await client.getFlag({ key: 'missing' });
      expect(result.enabled).toBe(false);
      expect(result.source).toBe('default_fallback');
    });

    it('query.defaultValue takes precedence over config.defaultFallback', async () => {
      const store = createMemoryFlagStore();
      const client = createFeatureFlagClient({ store, defaultFallback: true });

      const result = await client.getFlag({ key: 'missing', defaultValue: false });
      expect(result.enabled).toBe(false);
    });
  });

  describe('independent contexts', () => {
    it('evaluates the same flag independently for different tenant contexts in parallel', async () => {
      const store = createMemoryFlagStore({
        multi: {
          key: 'multi',
          enabled: false,
          rules: [
            { tenantId: 'tenant-a', enabled: true },
            { tenantId: 'tenant-b', enabled: false },
          ],
        },
      });
      const client = createFeatureFlagClient({ store });

      const [a, b] = await Promise.all([
        client.isEnabled({ key: 'multi', context: { tenantId: 'tenant-a' } }),
        client.isEnabled({ key: 'multi', context: { tenantId: 'tenant-b' } }),
      ]);

      expect(a).toBe(true);
      expect(b).toBe(false);
    });

    it('evaluates independently for different user contexts in parallel', async () => {
      const store = createMemoryFlagStore({
        userFlag: {
          key: 'userFlag',
          enabled: false,
          rules: [
            { userId: 'user-1', enabled: true },
            { userId: 'user-2', enabled: false },
          ],
        },
      });
      const client = createFeatureFlagClient({ store });

      const [u1, u2, u3] = await Promise.all([
        client.isEnabled({ key: 'userFlag', context: { userId: 'user-1' } }),
        client.isEnabled({ key: 'userFlag', context: { userId: 'user-2' } }),
        client.isEnabled({ key: 'userFlag', context: { userId: 'user-3' } }),
      ]);

      expect(u1).toBe(true);
      expect(u2).toBe(false);
      expect(u3).toBe(false);
    });
  });

  describe('isEnabled routes through getFlag', () => {
    it('isEnabled returns the enabled field from getFlag', async () => {
      const store = createMemoryFlagStore({ 'flag-x': true });
      const client = createFeatureFlagClient({ store });

      // Spy on getFlag to confirm isEnabled delegates
      const getFlagSpy = vi.spyOn(client, 'getFlag');

      const enabled = await client.isEnabled({ key: 'flag-x' });

      expect(enabled).toBe(true);
      expect(getFlagSpy).toHaveBeenCalledTimes(1);
      expect(getFlagSpy).toHaveBeenCalledWith({ key: 'flag-x' });

      getFlagSpy.mockRestore();
    });

    it('isEnabled returns false when getFlag returns enabled=false', async () => {
      const store = createMemoryFlagStore({ 'flag-y': false });
      const client = createFeatureFlagClient({ store });

      const enabled = await client.isEnabled({ key: 'flag-y' });
      expect(enabled).toBe(false);
    });

    it('isEnabled returns fallback value for missing flag', async () => {
      const store = createMemoryFlagStore();
      const client = createFeatureFlagClient({ store, defaultFallback: true });

      const enabled = await client.isEnabled({ key: 'missing' });
      expect(enabled).toBe(true);
    });
  });

  describe('onEvaluation hook', () => {
    it('fires onEvaluation on a successful store evaluation', async () => {
      const onEvaluation = vi.fn();
      const store = createMemoryFlagStore({ 'hooked': true });
      const client = createFeatureFlagClient({ store, hooks: { onEvaluation } });

      await client.getFlag({ key: 'hooked' });

      expect(onEvaluation).toHaveBeenCalledTimes(1);
      const info = onEvaluation.mock.calls[0][0];
      expect(info.key).toBe('hooked');
      expect(info.result.enabled).toBe(true);
      expect(info.result.source).toBe('store');
      expect(typeof info.durationMs).toBe('number');
    });

    it('fires onEvaluation on a default_fallback path', async () => {
      const onEvaluation = vi.fn();
      const store = createMemoryFlagStore();
      const client = createFeatureFlagClient({ store, hooks: { onEvaluation } });

      await client.getFlag({ key: 'missing' });

      expect(onEvaluation).toHaveBeenCalledTimes(1);
      const info = onEvaluation.mock.calls[0][0];
      expect(info.result.source).toBe('default_fallback');
    });

    it('fires onEvaluation on an error_fallback path', async () => {
      const onEvaluation = vi.fn();
      const store: FeatureFlagStore = {
        async getFlag(): Promise<never> {
          throw new Error('fail');
        },
      };
      const client = createFeatureFlagClient({ store, hooks: { onEvaluation } });

      await client.getFlag({ key: 'fail' });

      expect(onEvaluation).toHaveBeenCalledTimes(1);
      const info = onEvaluation.mock.calls[0][0];
      expect(info.result.source).toBe('error_fallback');
    });

    it('fires onEvaluation on an invalid key path', async () => {
      const onEvaluation = vi.fn();
      const store = createMemoryFlagStore();
      const client = createFeatureFlagClient({ store, hooks: { onEvaluation } });

      await client.getFlag({ key: '' });

      expect(onEvaluation).toHaveBeenCalledTimes(1);
      const info = onEvaluation.mock.calls[0][0];
      expect(info.result.source).toBe('error_fallback');
    });

    it('swallows onEvaluation hook exceptions without affecting the result', async () => {
      const onEvaluation = vi.fn(() => {
        throw new Error('hook boom');
      });
      const store = createMemoryFlagStore({ 'safe': true });
      const client = createFeatureFlagClient({ store, hooks: { onEvaluation } });

      const result = await client.getFlag({ key: 'safe' });

      expect(result.enabled).toBe(true);
      expect(result.source).toBe('store');
      expect(onEvaluation).toHaveBeenCalledTimes(1);
    });
  });

  describe('onError hook', () => {
    it('fires onError on provider failure', async () => {
      const onError = vi.fn();
      const store: FeatureFlagStore = {
        async getFlag(): Promise<never> {
          throw new Error('db down');
        },
      };
      const client = createFeatureFlagClient({ store, hooks: { onError } });

      await client.getFlag({ key: 'fail' });

      expect(onError).toHaveBeenCalledTimes(1);
    });

    it('swallows onError hook exceptions without affecting the result', async () => {
      const onError = vi.fn(() => {
        throw new Error('hook boom');
      });
      const store: FeatureFlagStore = {
        async getFlag(): Promise<never> {
          throw new Error('db down');
        },
      };
      const client = createFeatureFlagClient({ store, hooks: { onError } });

      const result = await client.getFlag({ key: 'fail' });

      expect(result.source).toBe('error_fallback');
      expect(onError).toHaveBeenCalledTimes(1);
    });
  });

  describe('no caching — runtime updates', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('store.setFlag false->true is visible on the next query', async () => {
      const store = createMemoryFlagStore({ mutable: false });
      const client = createFeatureFlagClient({ store });

      expect(await client.isEnabled({ key: 'mutable' })).toBe(false);

      store.setFlag('mutable', true);

      expect(await client.isEnabled({ key: 'mutable' })).toBe(true);
    });

    it('store.setFlag true->false is visible on the next query', async () => {
      const store = createMemoryFlagStore({ mutable: true });
      const client = createFeatureFlagClient({ store });

      expect(await client.isEnabled({ key: 'mutable' })).toBe(true);

      store.setFlag('mutable', false);

      expect(await client.isEnabled({ key: 'mutable' })).toBe(false);
    });

    it('store.removeFlag makes a previously-true flag fall back', async () => {
      const store = createMemoryFlagStore({ gone: true });
      const client = createFeatureFlagClient({ store });

      expect(await client.isEnabled({ key: 'gone' })).toBe(true);

      store.removeFlag('gone');

      const result = await client.getFlag({ key: 'gone' });
      expect(result.source).toBe('default_fallback');
      expect(result.enabled).toBe(false);
    });
  });

  describe('StoredFlag shape in client', () => {
    it('evaluates a stored flag with rules but no context -> flag default', async () => {
      const flag: StoredFlag = {
        key: 'ruled',
        enabled: true,
        rules: [{ tenantId: 't1', enabled: false }],
      };
      const store = createMemoryFlagStore({ ruled: flag });
      const client = createFeatureFlagClient({ store });

      const result = await client.getFlag({ key: 'ruled' });
      expect(result.enabled).toBe(true);
      expect(result.reason).toBe('Evaluated flag default state');
    });
  });
});