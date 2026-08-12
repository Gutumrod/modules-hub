export type Role = 'owner' | 'admin' | 'member' | 'guest';

export type Permission = 'read' | 'write' | 'delete' | 'manage_billing';

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner: ['read', 'write', 'delete', 'manage_billing'],
  admin: ['read', 'write', 'delete'],
  member: ['read', 'write'],
  guest: ['read'],
};

export function hasPermission(userRole: Role, permission: Permission): boolean {
  const permissions = ROLE_PERMISSIONS[userRole] || [];
  return permissions.includes(permission);
}

export function buildRlsContext(tenantId: string, userId: string, role: Role) {
  return {
    'request.jwt.claim.sub': userId,
    'request.jwt.claim.tenant_id': tenantId,
    'request.jwt.claim.role': role,
  };
}
