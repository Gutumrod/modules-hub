import { describe, expect, it } from 'vitest';
import { TenantContextManager, type TenantHeaderReader } from '../../core/manager.js';

function headers(values: Record<string, string | undefined>): TenantHeaderReader {
  return { get: (name) => values[name.toLowerCase()] };
}

describe('TenantContextManager', () => {
  it('resolves a tenant header into the normalized frozen context', async () => {
    const context = await new TenantContextManager().resolve({ headers: headers({ 'x-tenant-id': 'tenant-1' }) });
    expect(context.tenantId).toBe('tenant-1');
    expect(Object.isFrozen(context)).toBe(true);
  });

  it('falls back to the organization header', async () => {
    const context = await new TenantContextManager().resolve({ headers: headers({ 'x-organization-id': 'org-1' }) });
    expect(context.tenantId).toBe('org-1');
  });

  it('rejects missing and invalid tenants with the module error contract', async () => {
    const manager = new TenantContextManager({ tenantIdPattern: /^tenant-/ });
    await expect(manager.resolve({ headers: headers({}) })).rejects.toMatchObject({ code: 'TENANT_CONTEXT_REQUIRED' });
    await expect(manager.resolve({ headers: headers({ 'x-tenant-id': 'invalid' }) })).rejects.toMatchObject({ code: 'TENANT_ID_INVALID' });
  });

  it('respects allowed environments from manager configuration', async () => {
    const manager = new TenantContextManager({ allowedEnvironments: ['staging'] });
    await expect(manager.resolve({ headers: headers({ 'x-tenant-id': 'tenant-1', 'x-environment': 'production' }) })).rejects.toMatchObject({ code: 'TENANT_CONTEXT_INVALID' });
    await expect(manager.resolve({ headers: headers({ 'x-tenant-id': 'tenant-1', 'x-environment': 'staging' }) })).resolves.toMatchObject({ environment: 'staging' });
  });

  it('accepts any framework-neutral header reader implementation', async () => {
    const reader = new Headers({ 'x-tenant-id': 'fetch-tenant' });
    await expect(new TenantContextManager().resolve({ headers: reader })).resolves.toMatchObject({ tenantId: 'fetch-tenant' });
  });
});
