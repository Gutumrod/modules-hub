import type { IdentityProvider } from '../core/types.js';

/** Options for Credential Store Adapter */
export type CredentialStoreAdapterOptions<TCredential = unknown, TRawIdentity = unknown> = {
  /** Host-injected verification function against any data store */
  verify: (credential: TCredential) => Promise<TRawIdentity | null>;
};

export function createCredentialStoreAdapter<TCredential = unknown, TRawIdentity = unknown>(
  options: CredentialStoreAdapterOptions<TCredential, TRawIdentity>
): IdentityProvider<TCredential, TRawIdentity> {
  return {
    resolve(credential?: TCredential): Promise<TRawIdentity | null> {
      return options.verify(credential as TCredential);
    }
  };
}
