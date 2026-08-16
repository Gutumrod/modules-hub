import { describe, expect, it } from 'vitest';
import {
  createAuthHelpers,
  createSupabaseAdapter,
  type SupabaseAuthClient
} from '../../index.js';

describe('supabase flow', () => {
  it('end-to-end Supabase migration flow', async () => {
    const client: SupabaseAuthClient = {
      auth: {
        getUser: async (jwt?: string) => ({
          data: {
            user: jwt === 'valid'
              ? {
                  id: 'usr_supabase',
                  email: 'bob@example.com',
                  app_metadata: {
                    roles: ['editor'],
                    tenant_id: 'tenant_globex',
                    permissions: ['articles:publish']
                  }
                }
              : null
          },
          error: jwt === 'valid' ? null : { message: 'invalid', status: 401 }
        })
      }
    };

    const auth = createAuthHelpers({ provider: createSupabaseAdapter(client) });
    const context = await auth.requireUser({ credential: 'valid' });

    expect(context.userId).toBe('usr_supabase');
    await expect(auth.requirePermission('articles:publish')).resolves.toBe(context);
    await expect(auth.requireTenantMembership('tenant_globex')).resolves.toBe(context);
    await expect(auth.requireTenantMembership('tenant_acme')).rejects.toMatchObject({
      code: 'TENANT_ACCESS_DENIED',
      status: 403
    });
  });
});
