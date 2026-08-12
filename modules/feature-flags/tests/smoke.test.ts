import { describe, expect, it, vi } from 'vitest';
import { createFeatureFlagClient, createMemoryFlagStore } from '../index.js';
import type { FeatureFlagStore } from '../index.js';

describe('feature flags smoke', () => {
  it('evaluates true and false flags from the store', async () => {
    const store = createMemoryFlagStore({
      enabled: true,
      disabled: false,
    });
    const client = createFeatureFlagClient({ store });

    await expect(client.isEnabled({ key: 'enabled' })).resolves.toBe(true);
    await expect(client.isEnabled({ key: 'disabled' })).resolves.toBe(false);
  });

  it('uses default fallback for missing flags', async () => {
    const client = createFeatureFlagClient({
      store: createMemoryFlagStore(),
      defaultFallback: true,
    });

    await expect(client.getFlag({ key: 'missing' })).resolves.toEqual({
      key: 'missing',
      enabled: true,
      source: 'default_fallback',
      reason: 'Flag not found in store',
    });
  });

  it('uses error fallback when the provider fails', async () => {
    const store: FeatureFlagStore = {
      async getFlag(): Promise<never> {
        throw new Error('database password leaked in raw provider error');
      },
    };
    const onError = vi.fn();
    const client = createFeatureFlagClient({
      store,
      defaultFallback: false,
      hooks: { onError },
    });

    await expect(client.getFlag({ key: 'provider-failure', defaultValue: true })).resolves.toEqual({
      key: 'provider-failure',
      enabled: true,
      source: 'error_fallback',
      reason: 'Provider error: storage lookup failed',
    });
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('makes memory runtime updates visible immediately', async () => {
    const store = createMemoryFlagStore({ mutable: false });
    const client = createFeatureFlagClient({ store });

    await expect(client.isEnabled({ key: 'mutable' })).resolves.toBe(false);

    store.setFlag('mutable', true);

    await expect(client.isEnabled({ key: 'mutable' })).resolves.toBe(true);
  });
});
