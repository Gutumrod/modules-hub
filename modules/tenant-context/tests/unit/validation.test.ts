import { describe, it, expect } from 'vitest';
import { validateTenantContext, requireTenantContext } from '../../core/validation.js';

describe('Tenant Context Validation', () => {
  it('should validate valid context', () => {
    const result = validateTenantContext({ tenantId: 't1' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.context.tenantId).toBe('t1');
    }
  });

  it('should return failure for invalid context', () => {
    const result = validateTenantContext({ tenantId: '' });
    expect(result.success).toBe(false);
  });

  it('should throw in requireTenantContext if missing', () => {
    expect(() => requireTenantContext(null)).toThrow(/is required/);
  });

  it('should throw in requireTenantContext if invalid', () => {
    expect(() => requireTenantContext({ tenantId: '' })).toThrow();
  });
});
