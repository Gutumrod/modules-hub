import { AuthError } from '../core/error.js';
import { normalizeRawIdentitySync } from '../core/context.js';
import type { AuthContext, IdentityProvider } from '../core/types.js';

/** Options for JWT Adapter */
export type JwtAdapterOptions<TPayload = Record<string, unknown>> = {
  /** Host-injected verification callback using host's preferred JWT library (jose, jsonwebtoken, etc.) */
  verifyToken: (token: string) => Promise<TPayload | null>;
};

export function createJwtAdapter<TPayload = Record<string, unknown>>(
  options: JwtAdapterOptions<TPayload>
): IdentityProvider<string, TPayload> {
  return {
    async resolve(token?: string): Promise<TPayload | null> {
      if (typeof token !== 'string' || token.trim().length === 0) {
        throw new AuthError({
          message: 'JWT token is required',
          code: 'INVALID_SESSION',
          status: 401
        });
      }

      try {
        const payload = await options.verifyToken(token);

        if (!payload) {
          throw new AuthError({
            message: 'JWT token verification failed',
            code: 'INVALID_SESSION',
            status: 401
          });
        }

        return payload;
      } catch (error) {
        if (error instanceof AuthError) {
          throw error;
        }

        throw new AuthError({
          message: 'JWT token verification failed',
          code: 'INVALID_SESSION',
          status: 401,
          cause: error
        });
      }
    }
  };
}

export function defaultJwtNormalizer(payload: Record<string, unknown>): AuthContext {
  return normalizeRawIdentitySync(payload);
}
