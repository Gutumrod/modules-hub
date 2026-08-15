import { describe, expect, it } from 'vitest';
import {
  requirePermission,
  requireRole,
  requireTenantMembership,
  type AuthContext
} from '../../index.js';

const context: AuthContext = {
  userId: 'usr_1',
  roles: ['admin', 'editor'],
  permissions: ['posts:write', 'billing:read'],
  tenantId: 'tenant-100'
};

describe('guards', () => {
  it('requireRole allows matching role', () => {
    expect(requireRole(context, 'admin')).toBe(context);
  });

  it('requireRole mode ANY vs ALL', () => {
    expect(requireRole(context, ['admin', 'missing'], { mode: 'ANY' })).toBe(context);
    expect(requireRole(context, ['admin', 'editor'], { mode: 'ALL' })).toBe(context);
    expect(() => requireRole(context, ['admin', 'missing'], { mode: 'ALL' })).toThrow();
  });

  it('requireRole throws FORBIDDEN on missing role', () => {
    expect(() => requireRole({ ...context, roles: ['user'] }, 'admin')).toThrowError(
      expect.objectContaining({ code: 'FORBIDDEN', status: 403 })
    );
  });

  it('requirePermission allows matching permission', () => {
    expect(requirePermission(context, 'posts:write')).toBe(context);
  });

  it('requirePermission throws FORBIDDEN', () => {
    expect(() => requirePermission(context, 'billing:admin')).toThrowError(
      expect.objectContaining({ code: 'FORBIDDEN', status: 403 })
    );
  });

  it('requireTenantMembership allows matching tenant', () => {
    expect(requireTenantMembership(context, 'tenant-100')).toBe(context);
  });

  it('requireTenantMembership throws TENANT_ACCESS_DENIED', () => {
    expect(() => requireTenantMembership(context, 'tenant-200')).toThrowError(
      expect.objectContaining({ code: 'TENANT_ACCESS_DENIED', status: 403 })
    );
  });
});
