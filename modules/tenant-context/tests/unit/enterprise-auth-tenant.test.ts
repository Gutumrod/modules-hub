import { describe, it, expect } from 'vitest';
import { DynamicTenantResolver } from '../../adapters/dynamic-resolver';
import { hasPermission, buildRlsContext } from '../../../supa-auth/core/rbac-rls';

describe('Enterprise Auth & Tenant Isolation (v0.2.0)', () => {
  it('should resolve tenant dynamically from header and hostname', async () => {
    const resolver = new DynamicTenantResolver();
    const tenant = {
      id: 'tenant-123',
      slug: 'acme',
      name: 'Acme Corp',
      tier: 'enterprise' as const,
    };

    resolver.registerTenant(tenant, ['app.acmecorp.com']);

    const resolvedByHeader = await resolver.resolveFromHeader('tenant-123');
    expect(resolvedByHeader?.name).toBe('Acme Corp');

    const resolvedByHost = await resolver.resolveFromHostname('app.acmecorp.com');
    expect(resolvedByHost?.id).toBe('tenant-123');

    const resolvedBySubdomain = await resolver.resolveFromHostname('acme.example.com');
    expect(resolvedBySubdomain?.tier).toBe('enterprise');
  });

  it('should evaluate RBAC permissions correctly', () => {
    expect(hasPermission('owner', 'manage_billing')).toBe(true);
    expect(hasPermission('guest', 'write')).toBe(false);
    expect(hasPermission('member', 'read')).toBe(true);
  });

  it('should build proper RLS context claims', () => {
    const rls = buildRlsContext('tenant-123', 'user-456', 'admin');
    expect(rls['request.jwt.claim.tenant_id']).toBe('tenant-123');
    expect(rls['request.jwt.claim.role']).toBe('admin');
  });
});
