export type AuthErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'TENANT_ACCESS_DENIED'
  | 'INVALID_SESSION';

export class AuthError extends Error {
  readonly code: AuthErrorCode;
  readonly status: number;
  override readonly cause?: unknown;

  constructor(options: {
    message: string;
    code: AuthErrorCode;
    status?: number;
    cause?: unknown;
  }) {
    super(options.message);
    this.name = 'AuthError';
    this.code = options.code;
    this.status = options.status ?? (options.code === 'UNAUTHENTICATED' || options.code === 'INVALID_SESSION' ? 401 : 403);
    this.cause = options.cause;
    
    // Maintain standard stack trace in V8 environments
    if ((Error as any).captureStackTrace) {
      (Error as any).captureStackTrace(this, AuthError);
    }
  }
}
