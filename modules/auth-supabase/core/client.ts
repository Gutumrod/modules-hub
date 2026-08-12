import { getCurrentUser, requireUser } from './context.js';
import { requireRole, requirePermission, requireTenantMembership } from './guards.js';
import { AuthError } from './error.js';
import type { 
  SupabaseAuthConfig, 
  GetCurrentUserOptions,
  RoleGuardOptions,
  PermissionGuardOptions,
  AuthContext
} from './types.js';

/**
 * Factory to create Auth Helpers instance.
 */
export function createSupabaseAuthHelpers(
  config: SupabaseAuthConfig
): SupabaseAuthHelpers {
  const { supabaseClient, onAuthFailure, ...defaultResolvers } = config;

  const wrapGuard = async <T>(fn: () => T | Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof AuthError && onAuthFailure) {
        onAuthFailure(error);
      }
      throw error;
    }
  };

  return {
    async getCurrentUser(options?: GetCurrentUserOptions): Promise<AuthContext | null> {
      return wrapGuard(() => getCurrentUser(supabaseClient, { ...defaultResolvers, ...options }));
    },

    async requireUser(options?: GetCurrentUserOptions): Promise<AuthContext> {
      return wrapGuard(() => requireUser(supabaseClient, { ...defaultResolvers, ...options }));
    },

    async requireRole(
      requiredRole: string | string[], 
      options?: RoleGuardOptions & GetCurrentUserOptions
    ): Promise<AuthContext> {
      return wrapGuard(async () => {
        const context = await requireUser(supabaseClient, { ...defaultResolvers, ...options });
        return requireRole(context, requiredRole, options);
      });
    },

    async requirePermission(
      requiredPermission: string | string[], 
      options?: PermissionGuardOptions & GetCurrentUserOptions
    ): Promise<AuthContext> {
      return wrapGuard(async () => {
        const context = await requireUser(supabaseClient, { ...defaultResolvers, ...options });
        return requirePermission(context, requiredPermission, options);
      });
    },

    async requireTenantMembership(
      tenantId: string, 
      options?: GetCurrentUserOptions
    ): Promise<AuthContext> {
      return wrapGuard(async () => {
        const context = await requireUser(supabaseClient, { ...defaultResolvers, ...options });
        return requireTenantMembership(context, tenantId);
      });
    }
  };
}

/**
 * High-level interface for Host ergonomics.
 */
export interface SupabaseAuthHelpers {
  getCurrentUser(options?: GetCurrentUserOptions): Promise<AuthContext | null>;
  requireUser(options?: GetCurrentUserOptions): Promise<AuthContext>;
  requireRole(
    requiredRole: string | string[], 
    options?: RoleGuardOptions & GetCurrentUserOptions
  ): Promise<AuthContext>;
  requirePermission(
    requiredPermission: string | string[], 
    options?: PermissionGuardOptions & GetCurrentUserOptions
  ): Promise<AuthContext>;
  requireTenantMembership(
    tenantId: string, 
    options?: GetCurrentUserOptions
  ): Promise<AuthContext>;
}
