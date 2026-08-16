import { describe, expect, it } from 'vitest';
import {
  createAuthHelpers,
  createCredentialStoreAdapter,
  type AuthContext
} from '../../index.js';

type DbUser = {
  id: string;
  email: string;
  role: string;
  organizationId: string;
  permissions: string[];
};

describe('credential store flow', () => {
  it('end-to-end custom DB store flow', async () => {
    const users = new Map<string, DbUser>([
      [
        'session_alice',
        {
          id: 'usr_alice',
          email: 'alice@example.com',
          role: 'admin',
          organizationId: 'org_acme',
          permissions: ['billing:admin']
        }
      ]
    ]);
    const auth = createAuthHelpers({
      provider: createCredentialStoreAdapter<string, DbUser>({
        verify: async (credential) => users.get(credential) ?? null
      }),
      normalize: (user): AuthContext => ({
        userId: user.id,
        email: user.email,
        roles: [user.role],
        tenantId: user.organizationId,
        permissions: user.permissions
      })
    });

    const context = await auth.requireUser({ credential: 'session_alice' });
    await expect(auth.requireRole('admin')).resolves.toBe(context);
    await expect(auth.requirePermission('billing:admin')).resolves.toBe(context);
    await expect(auth.requireTenantMembership('org_acme')).resolves.toBe(context);
  });
});
