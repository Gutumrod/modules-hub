import type { FetchTransportOptions, HttpTransport, TransportRequest, TransportResponse } from '../core/types.js';

export function createFetchTransport(options: FetchTransportOptions = {}): HttpTransport {
  const fetchImplementation = options.fetch ?? globalThis.fetch;

  return {
    async send(request: TransportRequest): Promise<TransportResponse> {
      const headers = new Headers(request.headers);
      const init: RequestInit = {
        method: request.method,
        headers,
        signal: request.signal,
      };

      if (request.body !== undefined) {
        if (typeof request.body === 'string' || request.body instanceof ArrayBuffer || request.body instanceof Blob) {
          init.body = request.body;
        } else {
          init.body = JSON.stringify(request.body);
          if (!headers.has('content-type')) {
            headers.set('content-type', 'application/json');
          }
        }
      }

      const response = await fetchImplementation(request.url, init);
      const responseHeaders: Record<string, string> = Object.create(null);
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      return {
        status: response.status,
        headers: responseHeaders,
        body: response.body,
        rawResponse: response,
      };
    },
  };
}
