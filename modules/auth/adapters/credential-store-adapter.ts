import type {
  CredentialStoreAdapterOptions,
  IdentityProvider
} from '../core/types.js';

export function createCredentialStoreAdapter<TCredential = unknown, TRawIdentity = unknown>(
  options: CredentialStoreAdapterOptions<TCredential, TRawIdentity>
): IdentityProvider<TCredential, TRawIdentity> {
  return {
    resolve(credential?: TCredential): Promise<TRawIdentity | null> {
      return options.verify(credential as TCredential);
    }
  };
}
