import { HttpError } from './error.js';
import type { HttpRequest, TransportResponse } from './types.js';
import { extractProviderRequestId } from './security.js';

const ERROR_BODY_LIMIT = 2048;

export async function parseResponseData<T>(
  response: TransportResponse,
  request: Pick<HttpRequest, 'url' | 'method' | 'responseType'>
): Promise<T | undefined> {
  const responseType = request.responseType ?? 'json';

  if (responseType === 'raw') {
    return response.body as T;
  }

  const text = await bodyToText(response.body);

  if (responseType === 'text') {
    return text as T;
  }

  if (response.status === 204 || text.length === 0) {
    return undefined;
  }

  try {
    return JSON.parse(text) as T;
  } catch (error) {
    if (response.status >= 200 && response.status < 300) {
      throw new HttpError({
        message: 'HTTP response body is not valid JSON.',
        code: 'HTTP_INVALID_RESPONSE',
        status: response.status,
        providerRequestId: extractProviderRequestId(response.headers),
        url: request.url,
        method: request.method,
        cause: error,
      });
    }

    return undefined;
  }
}

export async function errorBodyText(response: TransportResponse): Promise<string> {
  const text = await bodyToText(response.body);
  return text.length > ERROR_BODY_LIMIT ? `${text.slice(0, ERROR_BODY_LIMIT)}...` : text;
}

async function bodyToText(body: TransportResponse['body']): Promise<string> {
  if (body === null) {
    return '';
  }

  if (typeof body === 'string') {
    return body;
  }

  if (body instanceof ArrayBuffer) {
    return new TextDecoder().decode(body);
  }

  const response = new Response(body);
  return response.text();
}
