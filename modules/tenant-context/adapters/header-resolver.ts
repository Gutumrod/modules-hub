import { createTenantContext } from '../core/context.js';
import type { TenantContext, TenantContextResolver } from '../core/types.js';

/**
 * Resolves tenant ID from HTTP headers.
 */
export class HeaderTenantResolver implements TenantContextResolver<Record<string, string | string[] | undefined>> {
  constructor(private headerName: string = 'x-tenant-id') {}

  async resolve(headers: Record<string, string | string[] | undefined>): Promise<TenantContext | null> {
    const value = headers[this.headerName.toLowerCase()];
    const tenantId = Array.isArray(value) ? value[0] : value;

    if (!tenantId || typeof tenantId !== 'string') {
      return null;
    }

    return createTenantContext({
      tenantId,
      metadata: {
        resolvedVia: 'header',
        headerName: this.headerName
      }
    });
  }
}
