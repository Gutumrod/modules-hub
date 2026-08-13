import { describe, it, expect } from 'vitest';
import { hasPermission, buildRlsContext } from '../../core/rbac.js';
import type { Role, Permission } from '../../core/rbac.js';

describe('hasPermission — RBAC role→permission mapping', () => {
  it('owner has all permissions', () => {
    const role: Role = 'owner';
    const perms: Permission[] = ['read', 'write', 'delete', 'manage_billing'];
    perms.forEach((p) => expect(hasPermission(role, p)).toBe(true));
  });

  it('admin has read/write/delete but NOT manage_billing', () => {
    expect(hasPermission('admin', 'read')).toBe(true);
    expect(hasPermission('admin', 'write')).toBe(true);
    expect(hasPermission('admin', 'delete')).toBe(true);
    expect(hasPermission('admin', 'manage_billing')).toBe(false);
  });

  it('member has read/write but NOT delete/manage_billing', () => {
    expect(hasPermission('member', 'read')).toBe(true);
    expect(hasPermission('member', 'write')).toBe(true);
    expect(hasPermission('member', 'delete')).toBe(false);
    expect(hasPermission('member', 'manage_billing')).toBe(false);
  });

  it('guest has read only', () => {
    expect(hasPermission('guest', 'read')).toBe(true);
    expect(hasPermission('guest', 'write')).toBe(false);
    expect(hasPermission('guest', 'delete')).toBe(false);
    expect(hasPermission('guest', 'manage_billing')).toBe(false);
  });

  it('unknown role fails closed (no permissions)', () => {
    // cast unknown string to Role — fail closed
    expect(hasPermission('nonexistent' as Role, 'read')).toBe(false);
  });
});

describe('buildRlsContext — Supabase RLS claim context', () => {
  it('builds JWT claim object with sub/tenant_id/role', () => {
    const ctx = buildRlsContext('tenant-1', 'user-1', 'admin');
    expect(ctx).toEqual({
      'request.jwt.claim.sub': 'user-1',
      'request.jwt.claim.tenant_id': 'tenant-1',
      'request.jwt.claim.role': 'admin',
    });
  });

  it('reflects guest role correctly', () => {
    const ctx = buildRlsContext('tenant-2', 'user-2', 'guest');
    expect(ctx['request.jwt.claim.role']).toBe('guest');
    expect(ctx['request.jwt.claim.tenant_id']).toBe('tenant-2');
    expect(ctx['request.jwt.claim.sub']).toBe('user-2');
  });
});
