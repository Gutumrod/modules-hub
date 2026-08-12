import { describe, it, expect } from 'vitest';
import { createTenantContext } from '../../core/context.js';

describe('Tenant Context Creation', () => {
  it('should create a valid frozen context', () => {
    const ctx = createTenantContext({
      tenantId: 'tenant-1',
      actorId: 'user-1'
    });

    expect(ctx.tenantId).toBe('tenant-1');
    expect(ctx.actorId).toBe('user-1');
    expect(Object.isFrozen(ctx)).toBe(true);
    expect(Object.isFrozen(ctx.metadata)).toBe(true);
  });

  it('should throw if tenantId is missing or empty', () => {
    expect(() => createTenantContext({ tenantId: '' })).toThrow(/tenantId is required/);
    expect(() => createTenantContext({ tenantId: '  ' })).toThrow();
  });

  it('should validate environment if allowedEnvironments is set', () => {
    const config = { allowedEnvironments: ['prod', 'stage'] };
    
    expect(() => createTenantContext({ tenantId: 't1', environment: 'dev' }, config)).toThrow();
    expect(createTenantContext({ tenantId: 't1', environment: 'prod' }, config).environment).toBe('prod');
  });

  it('should validate tenantId pattern', () => {
    const config = { tenantIdPattern: /^[a-z0-9-]+$/ };
    
    expect(() => createTenantContext({ tenantId: 'Tenant_1' }, config)).toThrow();
    expect(createTenantContext({ tenantId: 'tenant-1' }, config).tenantId).toBe('tenant-1');
  });
});
