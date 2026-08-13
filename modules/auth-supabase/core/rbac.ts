/**
 * modules/auth-supabase/core/rbac.ts
 * RBAC role→permission mapping + Supabase RLS context builder.
 *
 * Merged from `supa-auth/core/rbac-rls.ts` (origin: unified module hub init, 2026-08-12).
 * Provides:
 *  - `hasPermission(userRole, permission)` — static role→permission check
 *  - `buildRlsContext(tenantId, userId, role)` — build JWT claim context for Supabase RLS policies
 *
 * NOTE: This is a lightweight static RBAC helper. For dynamic RBAC driven by a
 * database / resolver, use the guards in `./guards.ts` (requireRole / requirePermission)
 * which work against the normalized AuthContext.
 */

/** Canonical application roles. */
export type Role = 'owner' | 'admin' | 'member' | 'guest';

/** Canonical coarse-grained permissions. */
export type Permission = 'read' | 'write' | 'delete' | 'manage_billing';

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner: ['read', 'write', 'delete', 'manage_billing'],
  admin: ['read', 'write', 'delete'],
  member: ['read', 'write'],
  guest: ['read'],
};

/**
 * Returns true if the given role holds the requested permission.
 * Unknown roles are treated as having no permissions (fail closed).
 */
export function hasPermission(userRole: Role, permission: Permission): boolean {
  const permissions = ROLE_PERMISSIONS[userRole] || [];
  return permissions.includes(permission);
}

/**
 * Builds a Supabase RLS `request.jwt.claim.*` context object from the
 * resolved tenant / user / role. Injected by the Host into a Supabase client
 * (e.g. via `setSession`/`rpc` options) so RLS policies can evaluate tenant & role.
 */
export function buildRlsContext(tenantId: string, userId: string, role: Role) {
  return {
    'request.jwt.claim.sub': userId,
    'request.jwt.claim.tenant_id': tenantId,
    'request.jwt.claim.role': role,
  };
}
