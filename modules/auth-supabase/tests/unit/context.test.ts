import { describe, it, expect, vi } from 'vitest';
import { getCurrentUser, requireUser } from '../../core/context.js';
import { AuthError } from '../../core/error.js';
import type { SupabaseAuthClient } from '../../core/types.js';

describe('Auth Context', () => {
  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    app_metadata: { roles: ['admin'], tenant_id: 'tenant-1' },
    user_metadata: {}
  };

  it('should resolve AuthContext for authenticated user', async () => {
    const client = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null })
      }
    } as unknown as SupabaseAuthClient;

    const context = await getCurrentUser(client);

    expect(context).not.toBeNull();
    expect(context?.userId).toBe('user-123');
    expect(context?.roles).toContain('admin');
    expect(context?.tenantId).toBe('tenant-1');
  });

  it('should return null for unauthenticated user', async () => {
    const client = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null })
      }
    } as unknown as SupabaseAuthClient;

    const context = await getCurrentUser(client);
    expect(context).toBeNull();
  });

  it('should throw INVALID_SESSION for expired JWT', async () => {
    const client = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ 
          data: { user: null }, 
          error: { message: 'JWT expired', code: 'jwt_expired', status: 401 } 
        })
      }
    } as unknown as SupabaseAuthClient;

    await expect(getCurrentUser(client)).rejects.toThrow(AuthError);
    await expect(getCurrentUser(client)).rejects.toMatchObject({ code: 'INVALID_SESSION' });
  });

  it('should throw UNAUTHENTICATED in requireUser when no user', async () => {
    const client = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null })
      }
    } as unknown as SupabaseAuthClient;

    await expect(requireUser(client)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('should use custom resolvers if provided', async () => {
    const client = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null })
      }
    } as unknown as SupabaseAuthClient;

    const context = await getCurrentUser(client, {
      roleResolver: () => ['custom-role'],
      tenantResolver: () => 'custom-tenant'
    });

    expect(context?.roles).toEqual(['custom-role']);
    expect(context?.tenantId).toBe('custom-tenant');
  });

  it('must ignore user-editable authorization metadata and JWT database role', async () => {
    const client = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: {
          id: 'user-123', role: 'authenticated',
          app_metadata: { roles: ['editor'], tenant_id: 'trusted', permissions: ['read'] },
          user_metadata: { roles: ['admin'], tenant_id: 'victim', permissions: ['billing:write'] }
        } }, error: null })
      }
    } as unknown as SupabaseAuthClient;
    const context = await getCurrentUser(client);
    expect(context?.roles).toEqual(['editor']);
    expect(context?.tenantId).toBe('trusted');
    expect(context?.permissions).toEqual(['read']);
    expect(context?.metadata).toEqual({
      appMetadata: { roles: ['editor'], tenant_id: 'trusted', permissions: ['read'] },
      userMetadata: { roles: ['admin'], tenant_id: 'victim', permissions: ['billing:write'] }
    });
  });

  it.each(['authenticated', 'anon', 'service_role'])('must not treat %s as an app role', async (role) => {
    const client = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-123', role, app_metadata: {} } }, error: null }) }
    } as unknown as SupabaseAuthClient;
    const context = await getCurrentUser(client);
    expect(context?.roles).toEqual([]);
  });

  it('must not derive authorization claims from user_metadata when app_metadata has no claims', async () => {
    const client = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: {
        id: 'user-123', role: 'authenticated', app_metadata: { provider: 'email' },
        user_metadata: { roles: ['admin'], tenant_id: 'victim', permissions: ['billing:write'] }
      } }, error: null }) }
    } as unknown as SupabaseAuthClient;
    const context = await getCurrentUser(client);
    expect(context?.roles).toEqual([]);
    expect(context?.tenantId).toBeUndefined();
    expect(context?.permissions).toEqual([]);
  });

  it('filters reserved roles from explicit resolvers', async () => {
    const client = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }) }
    } as unknown as SupabaseAuthClient;
    const context = await getCurrentUser(client, { roleResolver: () => ['service_role', 'admin'] });
    expect(context?.roles).toEqual(['admin']);
  });
});
