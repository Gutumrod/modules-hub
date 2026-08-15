import { describe, expect, it, vi } from 'vitest';
import { createExpressLikeTenantMiddleware } from '../../adapters/express-like-middleware.js';
import { TenantContextManager } from '../../core/manager.js';

function response() {
  const result = { status: vi.fn(), json: vi.fn() };
  result.status.mockReturnValue(result);
  return result;
}

describe('Express-like tenant middleware adapter', () => {
  it('attaches context and calls next for valid headers', async () => {
    const request = { headers: { 'x-tenant-id': 'tenant-1' } };
    const next = vi.fn();
    await createExpressLikeTenantMiddleware(new TenantContextManager())(request, response(), next);
    expect(request).toHaveProperty('tenantContext.tenantId', 'tenant-1');
    expect(next).toHaveBeenCalledOnce();
  });

  it('maps known tenant errors to 400', async () => {
    const res = response();
    await createExpressLikeTenantMiddleware(new TenantContextManager())({ headers: {} }, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.objectContaining({ code: 'TENANT_CONTEXT_REQUIRED' }) }));
  });

  it('maps unknown errors to 500', async () => {
    const manager = { resolve: vi.fn().mockRejectedValue(new Error('unexpected')) } as unknown as TenantContextManager;
    const res = response();
    await createExpressLikeTenantMiddleware(manager)({ headers: {} }, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
