import type { TenantContext } from './types.js';

/**
 * Executes a callback with an explicit TenantContext.
 * v0.1: This is a simple wrapper for explicit passing.
 */
export async function withTenantContext<T>(
  context: TenantContext,
  fn: (ctx: TenantContext) => Promise<T> | T
): Promise<T> {
  // Ensure context is valid/frozen if not already
  return await fn(context);
}
