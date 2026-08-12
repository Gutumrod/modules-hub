import { TenantContextError } from './error.js';
import type { 
  TenantContext, 
  CreateTenantContextInput, 
  TenantContextConfig 
} from './types.js';

/**
 * Creates a frozen, validated TenantContext.
 */
export function createTenantContext(
  input: CreateTenantContextInput,
  config?: TenantContextConfig
): TenantContext {
  // 1. Basic Validation
  if (!input.tenantId || typeof input.tenantId !== 'string' || input.tenantId.trim() === '') {
    throw new TenantContextError({
      message: 'Canonical tenantId is required and must be a non-empty string',
      code: 'TENANT_ID_INVALID'
    });
  }

  // 2. Pattern Validation
  if (config?.tenantIdPattern) {
    const pattern = typeof config.tenantIdPattern === 'string' 
      ? new RegExp(config.tenantIdPattern) 
      : config.tenantIdPattern;
    
    if (!pattern.test(input.tenantId)) {
      throw new TenantContextError({
        message: `tenantId '${input.tenantId}' does not match required pattern`,
        code: 'TENANT_ID_INVALID'
      });
    }
  }

  // 3. Environment Validation
  if (input.environment && config?.allowedEnvironments) {
    if (!config.allowedEnvironments.includes(input.environment)) {
      throw new TenantContextError({
        message: `Environment '${input.environment}' is not allowed`,
        code: 'TENANT_CONTEXT_INVALID'
      });
    }
  }

  // 4. Metadata Sanitization & Validation
  const maxKeys = config?.maxMetadataKeys ?? 50;
  const rawMetadata = input.metadata || {};
  const metadataKeys = Object.keys(rawMetadata);

  if (metadataKeys.length > maxKeys) {
    throw new TenantContextError({
      message: `Metadata exceeds maximum allowed keys (${maxKeys})`,
      code: 'TENANT_CONTEXT_INVALID'
    });
  }

  // Canonical Field Protection: Metadata can't override top-level fields
  const reservedKeys = ['tenantId', 'actorId', 'requestId', 'correlationId', 'environment'];
  const sanitizedMetadata = Object.create(null);
  for (const key of metadataKeys) {
    if (!reservedKeys.includes(key)) {
      sanitizedMetadata[key] = rawMetadata[key];
    }
  }

  // 5. Context Assembly (Frozen)
  const context: TenantContext = Object.freeze({
    tenantId: input.tenantId,
    actorId: input.actorId,
    requestId: input.requestId,
    correlationId: input.correlationId,
    environment: input.environment,
    metadata: Object.freeze(sanitizedMetadata)
  });

  return context;
}
