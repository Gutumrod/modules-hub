import type { Event } from './types.js';

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function isUnsafeObjectKey(key: string): boolean {
  return UNSAFE_KEYS.has(key);
}

export function hasOwnKey(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

export function sanitizeMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const sanitized = Object.create(null) as Record<string, unknown>;

  for (const key of Object.keys(metadata)) {
    if (!isUnsafeObjectKey(key)) {
      sanitized[key] = metadata[key];
    }
  }

  return sanitized;
}

export function sanitizeEvent<T = unknown>(
  input: Record<string, unknown>,
  defaults: { id?: string; timestamp?: string },
): Event<T> {
  const sanitized = Object.create(null) as Record<string, unknown>;
  const allowedKeys = ['id', 'type', 'payload', 'timestamp', 'source', 'subject', 'correlationId', 'metadata'];

  for (const key of allowedKeys) {
    if (!hasOwnKey(input, key) || isUnsafeObjectKey(key)) {
      continue;
    }

    const value = input[key];
    if (key === 'metadata' && typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeMetadata(value as Record<string, unknown>);
      continue;
    }

    sanitized[key] = value;
  }

  if (!hasOwnKey(sanitized, 'id') && defaults.id !== undefined) {
    sanitized['id'] = defaults.id;
  }

  if (!hasOwnKey(sanitized, 'timestamp') && defaults.timestamp !== undefined) {
    sanitized['timestamp'] = defaults.timestamp;
  }

  return sanitized as Event<T>;
}
