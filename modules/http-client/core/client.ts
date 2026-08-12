import { createFetchTransport } from '../adapters/fetch-transport.js';
import { executeRequest } from './pipeline.js';
import type { HttpClient, HttpClientConfig, HttpRequest, HttpResponse } from './types.js';

export function createHttpClient(config: HttpClientConfig = {}): HttpClient {
  const resolvedConfig = {
    ...config,
    transport: config.transport ?? createFetchTransport(),
  };

  const client: HttpClient = {
    request<T = unknown>(request: HttpRequest): Promise<HttpResponse<T>> {
      return executeRequest<T>(request, resolvedConfig);
    },

    get<T = unknown>(url: string, options?: Omit<HttpRequest, 'url' | 'method'>): Promise<HttpResponse<T>> {
      return client.request<T>({ ...options, url, method: 'GET' });
    },

    post<T = unknown>(
      url: string,
      body?: unknown,
      options?: Omit<HttpRequest, 'url' | 'method' | 'body'>
    ): Promise<HttpResponse<T>> {
      return client.request<T>({ ...options, url, method: 'POST', body });
    },

    put<T = unknown>(
      url: string,
      body?: unknown,
      options?: Omit<HttpRequest, 'url' | 'method' | 'body'>
    ): Promise<HttpResponse<T>> {
      return client.request<T>({ ...options, url, method: 'PUT', body });
    },

    patch<T = unknown>(
      url: string,
      body?: unknown,
      options?: Omit<HttpRequest, 'url' | 'method' | 'body'>
    ): Promise<HttpResponse<T>> {
      return client.request<T>({ ...options, url, method: 'PATCH', body });
    },

    delete<T = unknown>(url: string, options?: Omit<HttpRequest, 'url' | 'method'>): Promise<HttpResponse<T>> {
      return client.request<T>({ ...options, url, method: 'DELETE' });
    },
  };

  return client;
}
