import { describe, expect, it } from 'vitest';
import { AuthError } from '../../index.js';

describe('AuthError', () => {
  it('AuthError properties and inheritance', () => {
    const cause = new Error('expired');
    const unauthenticated = new AuthError({
      message: 'login required',
      code: 'UNAUTHENTICATED',
      cause
    });
    const forbidden = new AuthError({
      message: 'admin required',
      code: 'FORBIDDEN'
    });

    expect(unauthenticated).toBeInstanceOf(Error);
    expect(unauthenticated.name).toBe('AuthError');
    expect(unauthenticated.code).toBe('UNAUTHENTICATED');
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.cause).toBe(cause);
    expect(forbidden.status).toBe(403);
  });
});
