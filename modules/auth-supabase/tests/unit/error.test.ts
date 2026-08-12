import { describe, it, expect } from 'vitest';
import { AuthError } from '../../core/error.js';

describe('AuthError', () => {
  it('should create an error with correct properties', () => {
    const error = new AuthError({
      message: 'Test error',
      code: 'FORBIDDEN',
      status: 403
    });

    expect(error.message).toBe('Test error');
    expect(error.code).toBe('FORBIDDEN');
    expect(error.status).toBe(403);
    expect(error.name).toBe('AuthError');
    expect(error).toBeInstanceOf(Error);
  });

  it('should set default status based on code', () => {
    const unauth = new AuthError({ message: 'Unauth', code: 'UNAUTHENTICATED' });
    expect(unauth.status).toBe(401);

    const forbidden = new AuthError({ message: 'Forbidden', code: 'FORBIDDEN' });
    expect(forbidden.status).toBe(403);
  });
});
