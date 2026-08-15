import { describe, expect, it } from 'vitest';
import { AuthError, getCurrentUser, requireUser, type IdentityProvider } from '../../index.js';

describe('context', () => {
  it('getCurrentUser returns null when unauthenticated', async () => {
    const provider: IdentityProvider<string, { id: string }> = {
      resolve: async () => null
    };

    await expect(getCurrentUser(provider, { credential: 'missing' })).resolves.toBeNull();
  });

  it('requireUser throws UNAUTHENTICATED on null', async () => {
    const provider: IdentityProvider<string, { id: string }> = {
      resolve: async () => null
    };

    await expect(requireUser(provider, { credential: 'missing' })).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
      status: 401
    });
  });

  it('custom normalizer mapping', async () => {
    const provider: IdentityProvider<string, { db_id: string; org_id: string; scopes: string[] }> = {
      resolve: async () => ({ db_id: 'usr_1', org_id: 'tenant_1', scopes: ['posts:write'] })
    };

    const context = await requireUser(provider, {
      credential: 'session_1',
      normalize: (raw) => ({
        userId: raw.db_id,
        tenantId: raw.org_id,
        permissions: raw.scopes
      })
    });

    expect(context).toEqual({
      userId: 'usr_1',
      tenantId: 'tenant_1',
      permissions: ['posts:write']
    });
  });

  it('custom role and tenant resolvers', async () => {
    const provider: IdentityProvider<string, { id: string; roles: string[]; tenantId: string }> = {
      resolve: async () => ({ id: 'usr_1', roles: ['user'], tenantId: 'tenant_raw' })
    };

    const context = await requireUser(provider, {
      credential: 'session_1',
      roleResolver: async () => ['admin'],
      tenantResolver: async () => 'tenant_override'
    });

    expect(context.roles).toEqual(['admin']);
    expect(context.tenantId).toBe('tenant_override');
  });

  it('wraps unexpected provider errors as INVALID_SESSION', async () => {
    const provider: IdentityProvider<string, { id: string }> = {
      resolve: async () => {
        throw new Error('store unavailable');
      }
    };

    await expect(getCurrentUser(provider, { credential: 'broken' })).rejects.toBeInstanceOf(AuthError);
    await expect(getCurrentUser(provider, { credential: 'broken' })).rejects.toMatchObject({
      code: 'INVALID_SESSION',
      status: 401
    });
  });
});
