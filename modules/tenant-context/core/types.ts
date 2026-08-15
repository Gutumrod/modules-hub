/** Canonical Tenant Context contract carried across business logic layers */
export type TenantContext = {
  /** Canonical tenant identifier (Required, non-empty string) */
  readonly tenantId: string;
  /** Optional authenticated actor / user identifier */
  readonly actorId?: string;
  /** Optional edge/gateway request identifier for log correlation */
  readonly requestId?: string;
  /** Optional distributed tracing correlation identifier */
  readonly correlationId?: string;
  /** Optional target environment marker (e.g. 'production' | 'staging' | 'development') */
  readonly environment?: string;
  /** Optional arbitrary untrusted metadata dictionary (Frozen key-value map) */
  readonly metadata?: Readonly<Record<string, unknown>>;
};

/** Input payload for creating a new TenantContext */
export type CreateTenantContextInput = {
  tenantId: string;
  actorId?: string;
  requestId?: string;
  correlationId?: string;
  environment?: string;
  metadata?: Record<string, unknown>;
};

/** Validation result envelope returned by validateTenantContext() */
export type TenantContextValidationResult =
  | { readonly success: true; readonly context: TenantContext }
  | { readonly success: false; readonly error: import('./error.js').TenantContextError };

/** Tenant Context module configuration injected by Host */
export type TenantContextConfig = {
  /** Optional regex pattern or validator for tenantId format validation */
  tenantIdPattern?: RegExp | string;
  /** Optional list of allowed environments */
  allowedEnvironments?: string[];
  /** Maximum allowed keys in metadata dictionary (Default: 50) */
  maxMetadataKeys?: number;
};

/** Interface for optional tenant resolution adapters implemented by Host/Adapters */
export interface TenantContextResolver<TInput = unknown> {
  resolve(input: TInput): Promise<TenantContext | null>;
}

export type TenantInfo = {
  id: string;
  slug: string;
  name: string;
  tier: 'free' | 'pro' | 'enterprise';
  metadata?: Record<string, unknown>;
};

export interface TenantResolver {
  resolveFromHeader(headerValue?: string): Promise<TenantInfo | null>;
  resolveFromHostname(hostname: string): Promise<TenantInfo | null>;
}
