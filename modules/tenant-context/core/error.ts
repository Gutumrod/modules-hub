export type TenantContextErrorCode =
  | 'TENANT_CONTEXT_REQUIRED'
  | 'TENANT_CONTEXT_INVALID'
  | 'TENANT_ID_INVALID'
  | 'TENANT_RESOLUTION_FAILED';

export class TenantContextError extends Error {
  readonly code: TenantContextErrorCode;
  readonly details?: Record<string, unknown>;
  override readonly cause?: unknown;

  constructor(options: {
    message: string;
    code: TenantContextErrorCode;
    details?: Record<string, unknown>;
    cause?: unknown;
  }) {
    super(options.message);
    this.name = 'TenantContextError';
    this.code = options.code;
    this.details = options.details;
    this.cause = options.cause;
    
    // Maintain standard stack trace in V8 environments
    if ((Error as any).captureStackTrace) {
      (Error as any).captureStackTrace(this, TenantContextError);
    }
  }
}
