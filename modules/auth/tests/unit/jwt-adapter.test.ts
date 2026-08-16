import { describe, expect, it } from 'vitest';
import {
  createJwtAdapter,
  defaultJwtNormalizer
} from '../../index.js';

describe('jwt adapter', () => {
  it('resolves JWT payload via verifyToken', async () => {
    const adapter = createJwtAdapter({
      verifyToken: async () => ({
        sub: 'usr_jwt',
        email: 'jwt@example.com',
        roles: ['editor'],
        tenant_id: 'tenant_jwt',
        permissions: ['articles:publish']
      })
    });

    const payload = await adapter.resolve('valid.jwt');
    expect(defaultJwtNormalizer(payload!)).toMatchObject({
      userId: 'usr_jwt',
      email: 'jwt@example.com',
      roles: ['editor'],
      tenantId: 'tenant_jwt',
      permissions: ['articles:publish']
    });
  });

  it('throws INVALID_SESSION on rejected JWT', async () => {
    const nullAdapter = createJwtAdapter({
      verifyToken: async () => null
    });
    const throwingAdapter = createJwtAdapter({
      verifyToken: async () => {
        throw new Error('bad signature');
      }
    });

    await expect(nullAdapter.resolve('bad.jwt')).rejects.toMatchObject({
      code: 'INVALID_SESSION',
      status: 401
    });
    await expect(throwingAdapter.resolve('bad.jwt')).rejects.toMatchObject({
      code: 'INVALID_SESSION',
      status: 401
    });
  });
});
