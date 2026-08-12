export { createHttpClient } from './core/client.js';
export { HttpError } from './core/error.js';
export { createFetchTransport } from './adapters/fetch-transport.js';
export type { HttpErrorCode } from './core/error.js';
export type {
  FetchTransportOptions,
  HttpClient,
  HttpClientConfig,
  HttpRequest,
  HttpResponse,
  HttpTransport,
  LoggingHooks,
  RetryPolicy,
  SanitizedRequestInfo,
  SanitizedResponseInfo,
  TransportRequest,
  TransportResponse,
  UrlPolicy,
} from './core/types.js';
