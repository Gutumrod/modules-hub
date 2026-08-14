import { describe, it, expect } from 'vitest';
import { createTenantContext } from '../../core/context.js';

describe('Tenant Context Security & Concurrency Stress', () => {
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

  it('should strictly isolate 100 concurrent async tenant contexts without race conditions', async () => {
    const promises = Array.from({ length: 100 }, async (_, index) => {
      const tenantId = `tenant-concurrency-${index}`;
      const ctx = createTenantContext({ tenantId, environment: 'production' });
      await new Promise((resolve) => setTimeout(resolve, index % 10));
      expect(ctx.tenantId).toBe(tenantId);
    });
    await Promise.all(promises);
  });
});
