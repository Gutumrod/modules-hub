import { describe, it, expect } from 'vitest';
import { requireRole, requirePermission, requireTenantMembership } from '../../core/guards.js';
import type { AuthContext } from '../../core/types.js';

describe('Auth Guards', () => {
  const context: AuthContext = {
    userId: 'user-123',
    roles: ['editor'],
    permissions: ['read', 'write'],
    tenantId: 'tenant-acme'
  };

  describe('requireRole', () => {
    it('should pass if user has the role', () => {
      expect(requireRole(context, 'editor')).toBe(context);
    });

    it('should pass if user has any of the roles in ANY mode', () => {
      expect(requireRole(context, ['admin', 'editor'])).toBe(context);
    });

    it('should fail if user lacks the role', () => {
      expect(() => requireRole(context, 'admin')).toThrow(/Required role\(s\) missing/);
    });

    it('should fail if user lacks all roles in ALL mode', () => {
      expect(() => requireRole(context, ['editor', 'admin'], { mode: 'ALL' })).toThrow();
    });
  });

  describe('requirePermission', () => {
    it('should pass if user has the permission', () => {
      expect(requirePermission(context, 'write')).toBe(context);
    });

    it('should fail if user lacks the permission', () => {
      expect(() => requirePermission(context, 'delete')).toThrow(/Required permission\(s\) missing/);
    });
  });

  describe('requireTenantMembership', () => {
    it('should pass if tenantId matches', () => {
      expect(requireTenantMembership(context, 'tenant-acme')).toBe(context);
    });

    it('should fail if tenantId mismatches', () => {
      expect(() => requireTenantMembership(context, 'tenant-other')).toThrow(/Access to tenant 'tenant-other' denied/);
    });

    it('should fail if context has no tenantId', () => {
      const noTenantContext = { ...context, tenantId: undefined };
      expect(() => requireTenantMembership(noTenantContext, 'tenant-acme')).toThrow();
    });
  });
});
