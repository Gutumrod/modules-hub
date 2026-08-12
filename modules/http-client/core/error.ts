export type HttpErrorCode =
  | 'HTTP_TIMEOUT'
  | 'HTTP_NETWORK_ERROR'
  | 'HTTP_INVALID_RESPONSE'
  | 'HTTP_CLIENT_ERROR'
  | 'HTTP_SERVER_ERROR'
  | 'HTTP_RATE_LIMITED'
  | 'HTTP_ABORTED'
  | 'HTTP_RETRY_EXHAUSTED'
  | 'HTTP_INVALID_URL';

const DEFAULT_RETRYABLE: Record<HttpErrorCode, boolean> = {
  HTTP_TIMEOUT: true,
  HTTP_NETWORK_ERROR: true,
  HTTP_INVALID_RESPONSE: false,
  HTTP_CLIENT_ERROR: false,
  HTTP_SERVER_ERROR: true,
  HTTP_RATE_LIMITED: true,
  HTTP_ABORTED: false,
  HTTP_RETRY_EXHAUSTED: false,
  HTTP_INVALID_URL: false,
};

export class HttpError extends Error {
  readonly code: HttpErrorCode;
  readonly status?: number;
  readonly retryable: boolean;
  readonly requestId?: string;
  readonly providerRequestId?: string;
  readonly url: string;
  readonly method: string;
  override readonly cause?: unknown;

  constructor(options: {
    message: string;
    code: HttpErrorCode;
    status?: number;
    retryable?: boolean;
    requestId?: string;
    providerRequestId?: string;
    url: string;
    method: string;
    cause?: unknown;
  }) {
    super(options.message);
    this.name = 'HttpError';
    this.code = options.code;
    this.status = options.status;
    this.retryable = options.retryable ?? DEFAULT_RETRYABLE[options.code];
    this.requestId = options.requestId;
    this.providerRequestId = options.providerRequestId;
    this.url = options.url;
    this.method = options.method;
    this.cause = options.cause;
  }
}
