import { HttpError } from './error.js';
import type { UrlPolicy } from './types.js';

const STANDARD_SENSITIVE_HEADERS = ['authorization', 'cookie', 'set-cookie', 'x-api-key', 'proxy-authorization'];
const PROVIDER_REQUEST_ID_HEADERS = ['x-request-id', 'x-correlation-id', 'cf-ray', 'x-amzn-requestid', 'x-github-request-id'];

export function cleanRecord<T>(input?: Record<string, T>): Record<string, T> {
  const output: Record<string, T> = Object.create(null);
  if (!input) {
    return output;
  }

  for (const key of Object.keys(input)) {
    if (isUnsafeKey(key) || !Object.prototype.hasOwnProperty.call(input, key)) {
      continue;
    }
    output[key] = input[key] as T;
  }

  return output;
}

export function redactHeaders(
  headers?: Record<string, string>,
  sensitiveHeaders: string[] = []
): Record<string, string> {
  const sensitive = new Set([...STANDARD_SENSITIVE_HEADERS, ...sensitiveHeaders.map((header) => header.toLowerCase())]);
  const output: Record<string, string> = Object.create(null);
  const cleanHeaders = cleanRecord(headers);

  for (const [key, value] of Object.entries(cleanHeaders)) {
    output[key] = sensitive.has(key.toLowerCase()) ? '[REDACTED]' : value;
  }

  return output;
}

export function validateUrlPolicy(url: string, policy: UrlPolicy | undefined, method: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch (error) {
    throw new HttpError({
      message: 'HTTP request URL is invalid.',
      code: 'HTTP_INVALID_URL',
      url,
      method,
      cause: error,
    });
  }

  if (policy?.allowedProtocols && !policy.allowedProtocols.includes(parsed.protocol)) {
    throw invalidUrl(url, method, `Protocol ${parsed.protocol} is not allowed.`);
  }

  if (policy?.allowedHosts && !matchesHostPolicy(parsed.hostname, policy.allowedHosts)) {
    throw invalidUrl(url, method, `Host ${parsed.hostname} is not allowed.`);
  }

  if (policy?.blockedHosts && matchesHostPolicy(parsed.hostname, policy.blockedHosts)) {
    throw invalidUrl(url, method, `Host ${parsed.hostname} is blocked.`);
  }

  return parsed;
}

export function extractProviderRequestId(headers: Record<string, string>): string | undefined {
  const cleanHeaders = cleanRecord(headers);
  for (const expected of PROVIDER_REQUEST_ID_HEADERS) {
    for (const [key, value] of Object.entries(cleanHeaders)) {
      if (key.toLowerCase() === expected) {
        return value;
      }
    }
  }
  return undefined;
}

function invalidUrl(url: string, method: string, message: string): HttpError {
  return new HttpError({
    message,
    code: 'HTTP_INVALID_URL',
    url,
    method,
  });
}

function matchesHostPolicy(hostname: string, policyHosts: string[]): boolean {
  const normalized = hostname.toLowerCase();
  return policyHosts.some((host) => normalized === host.toLowerCase());
}

function isUnsafeKey(key: string): boolean {
  return key === '__proto__' || key === 'constructor' || key === 'prototype';
}
