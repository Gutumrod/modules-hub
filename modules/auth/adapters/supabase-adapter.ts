import { AuthError } from '../core/error.js';
import { normalizeRawIdentitySync } from '../core/context.js';
import type { AuthContext, IdentityProvider } from '../core/types.js';

/**
 * Structural interface for Supabase Auth client.
 * Decouples module from direct @supabase/supabase-js runtime dependency.
 */
export interface SupabaseAuthClient {
  auth: {
    getUser(jwt?: string): Promise<{
      data: { user: SupabaseUser | null };
      error: { message: string; status?: number; code?: string } | null;
    }>;
  };
}

/** Normalized user shape from Supabase Auth responses */
export type SupabaseUser = {
  id: string;
  email?: string;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
  role?: string;
};

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
