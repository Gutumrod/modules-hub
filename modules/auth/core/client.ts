import { getCurrentUser, requireUser } from './context.js';
import { AuthError } from './error.js';
import {
  requirePermission as requirePermissionGuard,
  requireRole as requireRoleGuard,
  requireTenantMembership as requireTenantMembershipGuard
} from './guards.js';
import type {
  AuthConfig,
  AuthContext,
  PermissionGuardOptions,
  ResolveUserOptions,
  RoleGuardOptions
} from './types.js';

export function createAuthHelpers<TCredential = unknown, TRawIdentity = unknown>(
  config: AuthConfig<TCredential, TRawIdentity>
): AuthHelpers<TCredential, TRawIdentity> {
  let cachedContext: AuthContext | null = null;

  const notifyFailure = (error: unknown): never => {
    if (error instanceof AuthError) {
      config.onAuthFailure?.(error);
    }

    throw error;
  };

  const mergeOptions = (
    options?: ResolveUserOptions<TCredential, TRawIdentity>
  ): ResolveUserOptions<TCredential, TRawIdentity> => ({
    normalize: options?.normalize ?? config.normalize,
    roleResolver: options?.roleResolver ?? config.roleResolver,
    tenantResolver: options?.tenantResolver ?? config.tenantResolver,
    permissionResolver: options?.permissionResolver ?? config.permissionResolver,
    ...(Object.prototype.hasOwnProperty.call(options ?? {}, 'credential')
      ? { credential: options?.credential }
      : {})
  });

  const resolveRequiredContext = async (
    options?: ResolveUserOptions<TCredential, TRawIdentity>
  ): Promise<AuthContext> => {
    if (!options && cachedContext) {
      return cachedContext;
    }

    const context = await requireUser(config.provider, mergeOptions(options));
    cachedContext = context;
    return context;
  };

  return {
    async getCurrentUser(options?: ResolveUserOptions<TCredential, TRawIdentity>) {
      try {
        const context = await getCurrentUser(config.provider, mergeOptions(options));
        cachedContext = context;
        return context;
      } catch (error) {
        return notifyFailure(error);
      }
    },

    async requireUser(options?: ResolveUserOptions<TCredential, TRawIdentity>) {
      try {
        const context = await requireUser(config.provider, mergeOptions(options));
        cachedContext = context;
        return context;
      } catch (error) {
        return notifyFailure(error);
      }
    },

    async requireRole(requiredRole: string | string[], options?: RoleGuardOptions) {
      try {
        return requireRoleGuard(await resolveRequiredContext(), requiredRole, options);
      } catch (error) {
        return notifyFailure(error);
      }
    },

    async requirePermission(
      requiredPermission: string | string[],
      options?: PermissionGuardOptions
    ) {
      try {
        return requirePermissionGuard(await resolveRequiredContext(), requiredPermission, options);
      } catch (error) {
        return notifyFailure(error);
      }
    },

    async requireTenantMembership(
      tenantId: string,
      options?: ResolveUserOptions<TCredential, TRawIdentity>
    ) {
      try {
        return requireTenantMembershipGuard(await resolveRequiredContext(options), tenantId);
      } catch (error) {
        return notifyFailure(error);
      }
    }
  };
}

export interface AuthHelpers<TCredential = unknown, TRawIdentity = unknown> {
  getCurrentUser(options?: ResolveUserOptions<TCredential, TRawIdentity>): Promise<AuthContext | null>;
  requireUser(options?: ResolveUserOptions<TCredential, TRawIdentity>): Promise<AuthContext>;
  requireRole(requiredRole: string | string[], options?: RoleGuardOptions): Promise<AuthContext>;
  requirePermission(requiredPermission: string | string[], options?: PermissionGuardOptions): Promise<AuthContext>;
  requireTenantMembership(tenantId: string, options?: ResolveUserOptions<TCredential, TRawIdentity>): Promise<AuthContext>;
}
