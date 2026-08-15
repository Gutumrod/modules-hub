import { describe, expect, it } from 'vitest';
import {
  createSupabaseAdapter,
  defaultSupabaseNormalizer,
  type SupabaseAuthClient
} from '../../index.js';

describe('supabase adapter', () => {
  it('resolves valid Supabase session', async () => {
    const client: SupabaseAuthClient = {
      auth: {
        getUser: async () => ({
          data: {
            user: {
              id: 'usr_supabase',
              email: 'supa@example.com',
              app_metadata: {
                roles: ['admin'],
                tenant_id: 'tenant_supa',
                permissions: ['reports:read']
              }
            }
          },
          error: null
        })
      }
    };

    const user = await createSupabaseAdapter(client).resolve('valid');
    expect(user?.id).toBe('usr_supabase');
    expect(defaultSupabaseNormalizer(user!)).toMatchObject({
      userId: 'usr_supabase',
      roles: ['admin'],
      tenantId: 'tenant_supa',
      permissions: ['reports:read']
    });
  });

  it('handles Supabase token error', async () => {
    const client: SupabaseAuthClient = {
      auth: {
        getUser: async () => ({
          data: { user: null },
          error: { message: 'jwt expired', status: 401, code: 'jwt_expired' }
        })
      }
    };

    await expect(createSupabaseAdapter(client).resolve('expired')).rejects.toMatchObject({
      code: 'INVALID_SESSION',
      status: 401
    });
  });
});
