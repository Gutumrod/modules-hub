import { TenantContext, TenantContextConfig } from './types.js';
import { validateTenantContext } from './validation.js';
import { TenantContextError } from './error.js';

export class TenantContextManager {
  constructor(private config: TenantContextConfig = {}) {}

  async resolveFromRequest(req: any): Promise<TenantContext> {
    // 1. Try to resolve from headers
    const tenantId = req.headers?.['x-tenant-id'] || req.headers?.['x-organization-id'];
    
    if (!tenantId) {
      throw new TenantContextError('TENANT_ID_MISSING', 'Tenant ID is missing from request headers');
    }

    const context: TenantContext = {
      tenantId: String(tenantId),
      environment: (req.headers?.['x-environment'] as any) || 'production',
      metadata: {},
    };

    validateTenantContext(context);
    return context;
  }

  /**
   * Universal Middleware Wrapper for Express-like frameworks
   */
  createMiddleware() {
    return async (req: any, res: any, next: () => void) => {
      try {
        const context = await this.resolveFromRequest(req);
        req.tenantContext = context;
        next();
      } catch (error) {
        if (error instanceof TenantContextError) {
          res.status(400).json({
            error: {
              code: error.code,
              message: error.message,
            },
          });
        } else {
          res.status(500).json({ error: 'Internal Server Error' });
        }
      }
    };
  }
}
