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
});
