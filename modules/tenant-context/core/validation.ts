import { TenantContextError } from './error.js';
import { createTenantContext } from './context.js';
import type { 
  TenantContext, 
  TenantContextValidationResult, 
  TenantContextConfig 
} from './types.js';

/**
 * Structurally validates an unknown input against the TenantContext contract.
 */
export function validateTenantContext(
  input: unknown,
  config?: TenantContextConfig
): TenantContextValidationResult {
  if (!input || typeof input !== 'object') {
    return {
      success: false,
      error: new TenantContextError({
        message: 'Tenant context must be a non-null object',
        code: 'TENANT_CONTEXT_INVALID'
      })
    };
  }

  try {
    const context = createTenantContext(input as any, config);
    return { success: true, context };
  } catch (error) {
    return {
      success: false,
      error: error instanceof TenantContextError 
        ? error 
        : new TenantContextError({
            message: 'Validation failed',
            code: 'TENANT_CONTEXT_INVALID',
            cause: error
          })
    };
  }
}

/**
 * Asserts that the input is a valid TenantContext, otherwise throws.
 */
export function requireTenantContext(
  input: unknown,
  config?: TenantContextConfig
): TenantContext {
  if (input === null || input === undefined) {
    throw new TenantContextError({
      message: 'Tenant context is required but was not provided',
      code: 'TENANT_CONTEXT_REQUIRED'
    });
  }

  const result = validateTenantContext(input, config);
  if (!result.success) {
    throw result.error;
  }

  return result.context;
}
