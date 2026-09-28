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

  it('does not grant authorization from Supabase user_metadata or JWT role claims', async () => {
    const provider: IdentityProvider<string, Record<string, unknown>> = {
      resolve: async () => ({
        id: 'usr_1',
        role: 'authenticated',
        app_metadata: { roles: ['editor'], tenant_id: 'trusted', permissions: ['read'] },
        user_metadata: { roles: ['admin'], tenant_id: 'victim', permissions: ['billing:write'] }
      })
    };
    const context = await requireUser(provider);

    expect(context.roles).toEqual(['editor']);
    expect(context.tenantId).toBe('trusted');
    expect(context.permissions).toEqual(['read']);
    expect(context.metadata).toEqual({
      appMetadata: { roles: ['editor'], tenant_id: 'trusted', permissions: ['read'] },
      userMetadata: { roles: ['admin'], tenant_id: 'victim', permissions: ['billing:write'] }
    });
  });

  it('does not read Supabase authorization claims from user_metadata when app_metadata has none', async () => {
    const provider: IdentityProvider<string, Record<string, unknown>> = {
      resolve: async () => ({
        id: 'usr_1', role: 'authenticated', app_metadata: { provider: 'email' },
        user_metadata: { roles: ['admin'], tenant_id: 'victim', permissions: ['billing:write'] }
      })
    };
    const context = await requireUser(provider);
    expect(context.roles).toBeUndefined();
    expect(context.tenantId).toBeUndefined();
    expect(context.permissions).toBeUndefined();
  });

  it.each(['authenticated', 'anon', 'service_role'])('does not expose JWT role %s as an app role', async (role) => {
    const provider: IdentityProvider<string, Record<string, unknown>> = {
      resolve: async () => ({ id: 'usr_1', role, app_metadata: {} })
    };
    const context = await requireUser(provider);
    expect(context.roles).toBeUndefined();
  });

  it.each(['authenticated', 'anon', 'service_role'])('filters reserved role %s from generic role claims', async (role) => {
    const provider: IdentityProvider<string, Record<string, unknown>> = {
      resolve: async () => ({ id: 'usr_1', roles: [role, 'editor'] })
    };
    const context = await requireUser(provider);
    expect(context.roles).toEqual(['editor']);
  });

  it('keeps generic normalized authorization claims available', async () => {
    const provider: IdentityProvider<string, Record<string, unknown>> = {
      resolve: async () => ({ id: 'usr_1', roles: ['admin'], tenantId: 'tenant_1', permissions: ['read'] })
    };
    const context = await requireUser(provider);
    expect(context).toMatchObject({ roles: ['admin'], tenantId: 'tenant_1', permissions: ['read'] });
  });
});
