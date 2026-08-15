import type { TenantContext, TenantContextConfig } from './types.js';
import { validateTenantContext } from './validation.js';
import { TenantContextError } from './error.js';

export interface TenantHeaderReader {
  get(name: string): string | null | undefined;
}

export interface TenantResolutionInput {
  readonly headers: TenantHeaderReader;
  readonly defaultEnvironment?: string;
}

export class TenantContextManager {
  constructor(private readonly config: TenantContextConfig = {}) {}

  async resolve(input: TenantResolutionInput): Promise<TenantContext> {
    const tenantId = input.headers.get('x-tenant-id') ?? input.headers.get('x-organization-id');
    if (!tenantId || tenantId.trim().length === 0) {
      throw new TenantContextError({
        code: 'TENANT_CONTEXT_REQUIRED',
        message: 'Tenant ID is missing from request headers',
      });
    }

    const result = validateTenantContext({
      tenantId,
      environment: input.headers.get('x-environment') ?? input.defaultEnvironment ?? 'production',
      metadata: {},
    }, this.config);

    if (!result.success) throw result.error;
    return result.context;
  }
}
