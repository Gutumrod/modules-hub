import { TenantContextError } from '../core/error.js';
import { TenantContextManager, type TenantHeaderReader } from '../core/manager.js';
import type { TenantContext } from '../core/types.js';

export interface ExpressLikeRequest {
  headers?: Record<string, string | string[] | undefined>;
  tenantContext?: TenantContext;
}

export interface ExpressLikeResponse {
  status(code: number): ExpressLikeResponse;
  json(body: unknown): unknown;
}

function recordHeaderReader(headers: ExpressLikeRequest['headers']): TenantHeaderReader {
  return {
    get(name) {
      const value = headers?.[name.toLowerCase()];
      return Array.isArray(value) ? value[0] : value;
    },
  };
}

export function createExpressLikeTenantMiddleware(manager: TenantContextManager) {
  return async (request: ExpressLikeRequest, response: ExpressLikeResponse, next: () => void): Promise<void> => {
    try {
      request.tenantContext = await manager.resolve({ headers: recordHeaderReader(request.headers) });
      next();
    } catch (error) {
      if (error instanceof TenantContextError) {
        response.status(400).json({ error: { code: error.code, message: error.message } });
        return;
      }
      response.status(500).json({ error: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal Server Error' } });
    }
  };
}
