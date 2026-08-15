import { describe, expect, it } from 'vitest';
import {
  createAuthHelpers,
  createJwtAdapter
} from '../../index.js';

describe('jwt flow', () => {
  it('end-to-end generic JWT bearer flow', async () => {
    const auth = createAuthHelpers({
      provider: createJwtAdapter({
        verifyToken: async (token) => token === 'valid.jwt'
          ? {
              sub: 'usr_jwt',
              roles: ['admin'],
              tenant_id: 'tenant_jwt',
              permissions: ['reports:read']
            }
          : null
      })
    });

    const context = await auth.requireUser({ credential: 'valid.jwt' });

    await expect(auth.requireRole(['admin', 'auditor'], { mode: 'ANY' })).resolves.toBe(context);
    await expect(auth.requirePermission('reports:read')).resolves.toBe(context);
    await expect(auth.requireTenantMembership('tenant_other')).rejects.toMatchObject({
      code: 'TENANT_ACCESS_DENIED',
      status: 403
    });
  });
});
