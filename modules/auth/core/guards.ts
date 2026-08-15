import { AuthError } from './error.js';
import type { AuthContext, PermissionGuardOptions, RoleGuardOptions } from './types.js';

export function requireRole(
  context: AuthContext,
  requiredRole: string | string[],
  options?: RoleGuardOptions
): AuthContext {
  assertContext(context);

  const requiredRoles = normalizeRequiredList(requiredRole);
  const roles = context.roles ?? [];
  const isAuthorized =
    options?.mode === 'ALL'
      ? requiredRoles.every((role) => roles.includes(role))
      : requiredRoles.some((role) => roles.includes(role));

  if (!isAuthorized) {
    throw new AuthError({
      message: `Required role(s) missing: ${requiredRoles.join(', ')}`,
      code: 'FORBIDDEN',
      status: 403
    });
  }

  return context;
}

export function requirePermission(
  context: AuthContext,
  requiredPermission: string | string[],
  options?: PermissionGuardOptions
): AuthContext {
  assertContext(context);

  const requiredPermissions = normalizeRequiredList(requiredPermission);
  const permissions = context.permissions ?? [];
  const isAuthorized =
    options?.mode === 'ALL'
      ? requiredPermissions.every((permission) => permissions.includes(permission))
      : requiredPermissions.some((permission) => permissions.includes(permission));

  if (!isAuthorized) {
    throw new AuthError({
      message: `Required permission(s) missing: ${requiredPermissions.join(', ')}`,
      code: 'FORBIDDEN',
      status: 403
    });
  }

  return context;
}

export function requireTenantMembership(
  context: AuthContext,
  tenantId: string
): AuthContext {
  assertContext(context);

  if (typeof tenantId !== 'string' || tenantId.trim().length === 0) {
    throw new AuthError({
      message: 'Tenant ID is required for isolation check',
      code: 'TENANT_ACCESS_DENIED',
      status: 403
    });
  }

  if (!context.tenantId || context.tenantId !== tenantId) {
    throw new AuthError({
      message: `Access to tenant '${tenantId}' denied for current user context`,
      code: 'TENANT_ACCESS_DENIED',
      status: 403
    });
  }

  return context;
}

function assertContext(context: AuthContext): void {
  if (!context || typeof context.userId !== 'string' || context.userId.trim().length === 0) {
    throw new AuthError({
      message: 'Authentication context required',
      code: 'UNAUTHENTICATED',
      status: 401
    });
  }
}

function normalizeRequiredList(value: string | string[]): string[] {
  const values = Array.isArray(value) ? value : [value];
  return values.filter((item) => typeof item === 'string' && item.trim().length > 0);
}
