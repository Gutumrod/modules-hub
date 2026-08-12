import { describe, it, expect } from 'vitest';
import { createTenantContext } from '../../core/context.js';

describe('Tenant Context Security', () => {
  it('should prevent metadata from overriding canonical fields', () => {
    const ctx = createTenantContext({
      tenantId: 'real-tenant',
      metadata: {
        tenantId: 'evil-tenant',
        actorId: 'hacker'
      }
    } as any);

    expect(ctx.tenantId).toBe('real-tenant');
    expect(ctx.metadata?.tenantId).toBeUndefined();
    expect(ctx.metadata?.actorId).toBeUndefined();
  });

  it('should prevent prototype pollution', () => {
    const payload = JSON.parse('{"tenantId": "t1", "metadata": {"__proto__": {"polluted": true}}}');
    const ctx = createTenantContext(payload);
    
    expect((ctx.metadata as any).polluted).toBeUndefined();
  });
});
