import { describe, expect, it } from 'vitest';
import { createCredentialStoreAdapter } from '../../index.js';

type StoreUser = {
  id: string;
};

describe('credential store adapter', () => {
  it('resolves credential via verify callback', async () => {
    const adapter = createCredentialStoreAdapter<string, StoreUser>({
      verify: async (credential) => credential === 'valid' ? { id: 'usr_store' } : null
    });

    await expect(adapter.resolve('valid')).resolves.toEqual({ id: 'usr_store' });
  });

  it('returns null on invalid credential', async () => {
    const adapter = createCredentialStoreAdapter<string, StoreUser>({
      verify: async () => null
    });

    await expect(adapter.resolve('invalid')).resolves.toBeNull();
  });
});
