import { describe, expect, it, vi } from 'vitest';
import {
  AuthError,
  createAuthHelpers,
  createCredentialStoreAdapter,
  type AuthContext
} from '../../index.js';

type DbUser = {
  id: string;
  role: string;
  orgId: string;
  perms: string[];
};

const mockUser: DbUser = {
  id: 'usr_test',
  role: 'admin',
  orgId: 'tenant_test',
  perms: ['billing:read']
};

function makeAuth(overrides: { onAuthFailure?: (e: AuthError) => void } = {}) {
  const provider = createCredentialStoreAdapter<string, DbUser>({
    verify: async (cred) => (cred === 'valid' ? mockUser : null)
  });

  return createAuthHelpers<string, DbUser>({
    provider,
    normalize: (u): AuthContext => ({
      userId: u.id,
      roles: [u.role],
      tenantId: u.orgId,
      permissions: u.perms
    }),
    ...overrides
  });
}

describe('createAuthHelpers factory', () => {
  it('requireUser caches context for subsequent guard calls', async () => {
    const auth = makeAuth();
    const context = await auth.requireUser({ credential: 'valid' });

    // Guards called without options reuse the cached context
    await expect(auth.requireRole('admin')).resolves.toEqual(context);
    await expect(auth.requirePermission('billing:read')).resolves.toEqual(context);
    await expect(auth.requireTenantMembership('tenant_test')).resolves.toEqual(context);
  });

  it('onAuthFailure is called on authentication failure', async () => {
    const onFailure = vi.fn();
    const auth = makeAuth({ onAuthFailure: onFailure });

    await expect(auth.requireUser({ credential: 'bad' })).rejects.toThrow(AuthError);
    expect(onFailure).toHaveBeenCalledOnce();
    expect(onFailure.mock.calls[0][0]).toBeInstanceOf(AuthError);
    expect(onFailure.mock.calls[0][0].code).toBe('UNAUTHENTICATED');
  });

  it('onAuthFailure is called on authorization failure', async () => {
    const onFailure = vi.fn();
    const auth = makeAuth({ onAuthFailure: onFailure });

    await auth.requireUser({ credential: 'valid' });
    await expect(auth.requireRole('superadmin')).rejects.toThrow(AuthError);
    expect(onFailure).toHaveBeenCalledOnce();
    expect(onFailure.mock.calls[0][0].code).toBe('FORBIDDEN');
  });

  it('onAuthFailure is called on tenant access denied', async () => {
    const onFailure = vi.fn();
    const auth = makeAuth({ onAuthFailure: onFailure });

    await auth.requireUser({ credential: 'valid' });
    await expect(auth.requireTenantMembership('wrong_tenant')).rejects.toThrow(AuthError);
    expect(onFailure).toHaveBeenCalledOnce();
    expect(onFailure.mock.calls[0][0].code).toBe('TENANT_ACCESS_DENIED');
  });

  it('guard without prior requireUser resolves with credential option', async () => {
    const auth = makeAuth();

    // No prior requireUser — guard resolves internally when given a credential
    await expect(
      auth.requireTenantMembership('tenant_test', { credential: 'valid' })
    ).resolves.toBeDefined();
  });

  it('guard without prior requireUser and bad credential throws UNAUTHENTICATED', async () => {
    const auth = makeAuth();

    await expect(
      auth.requireTenantMembership('tenant_test', { credential: 'bad' })
    ).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
      status: 401
    });
  });

  it('requirePermission mode ALL requires all permissions', async () => {
    const auth = makeAuth();

    await auth.requireUser({ credential: 'valid' });
    await expect(
      auth.requirePermission(['billing:read', 'billing:write'], { mode: 'ALL' })
    ).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
  });

  it('requireRole mode ANY passes with at least one match', async () => {
    const auth = makeAuth();

    await auth.requireUser({ credential: 'valid' });
    await expect(
      auth.requireRole(['admin', 'superadmin'], { mode: 'ANY' })
    ).resolves.toBeDefined();
  });
});