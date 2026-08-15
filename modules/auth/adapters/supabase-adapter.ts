import { AuthError } from '../core/error.js';
import { normalizeRawIdentitySync } from '../core/context.js';
import type { AuthContext, IdentityProvider, SupabaseAuthClient, SupabaseUser } from '../core/types.js';

export function createSupabaseAdapter(
  client: SupabaseAuthClient
): IdentityProvider<string | undefined, SupabaseUser> {
  return {
    async resolve(credential?: string): Promise<SupabaseUser | null> {
      try {
        const result = await client.auth.getUser(credential);

        if (result.error) {
          throw new AuthError({
            message: result.error.message,
            code: 'INVALID_SESSION',
            status: result.error.status ?? 401,
            cause: result.error
          });
        }

        return result.data.user;
      } catch (error) {
        if (error instanceof AuthError) {
          throw error;
        }

        throw new AuthError({
          message: 'Supabase session verification failed',
          code: 'INVALID_SESSION',
          status: 401,
          cause: error
        });
      }
    }
  };
}

export function defaultSupabaseNormalizer(user: SupabaseUser): AuthContext {
  return normalizeRawIdentitySync(user);
}
