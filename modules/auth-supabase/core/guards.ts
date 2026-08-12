import { AuthError } from './error.js';
import type { AuthContext, RoleGuardOptions, PermissionGuardOptions } from './types.js';

/**
 * Enforces role-based access control (RBAC).
 */
export function requireRole(
  context: AuthContext,
  requiredRole: string | string[],
  options: RoleGuardOptions = { mode: 'ANY' }
): AuthContext {
  if (!context) {
    throw new AuthError({
      message: 'Authentication context required',
      code: 'UNAUTHENTICATED',
      status: 401
    });
  }

  const roles = context.roles || [];
  const requiredRoles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];

  let isAuthorized = false;
  if (options.mode === 'ALL') {
    isAuthorized = requiredRoles.every(r => roles.includes(r));
  } else {
    isAuthorized = requiredRoles.some(r => roles.includes(r));
  }

  if (!isAuthorized) {
    throw new AuthError({
      message: `Required role(s) missing: ${requiredRoles.join(', ')}`,
      code: 'FORBIDDEN',
      status: 403
    });
  }

  return context;
}

/**
 * Enforces permission-based access control (PBAC).
 */
export function requirePermission(
  context: AuthContext,
  requiredPermission: string | string[],
  options: PermissionGuardOptions = { mode: 'ANY' }
): AuthContext {
  if (!context) {
    throw new AuthError({
      message: 'Authentication context required',
      code: 'UNAUTHENTICATED',
      status: 401
    });
  }

  const permissions = context.permissions || [];
  const requiredPermissions = Array.isArray(requiredPermission) ? requiredPermission : [requiredPermission];

  let isAuthorized = false;
  if (options.mode === 'ALL') {
    isAuthorized = requiredPermissions.every(p => permissions.includes(p));
  } else {
    isAuthorized = requiredPermissions.some(p => permissions.includes(p));
  }

  if (!isAuthorized) {
    throw new AuthError({
      message: `Required permission(s) missing: ${requiredPermissions.join(', ')}`,
      code: 'FORBIDDEN',
      status: 403
    });
  }

  return context;
}

/**
 * Enforces multi-tenant isolation.
 */
export function requireTenantMembership(
  context: AuthContext,
  tenantId: string
): AuthContext {
  if (!context) {
    throw new AuthError({
      message: 'Authentication context required',
      code: 'UNAUTHENTICATED',
      status: 401
    });
  }

  if (!tenantId) {
    throw new AuthError({
      message: 'Tenant ID is required for isolation check',
      code: 'TENANT_ACCESS_DENIED',
      status: 403
    });
  }

  // Isolation Rule: User's tenantId must match the requested tenantId
  if (context.tenantId !== tenantId) {
    throw new AuthError({
      message: `Access to tenant '${tenantId}' denied for current user context`,
      code: 'TENANT_ACCESS_DENIED',
      status: 403
    });
  }

  return context;
}
