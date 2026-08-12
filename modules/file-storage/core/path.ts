import type { FileStorageConfig, StorageError, UploadRequest } from './types';

const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;

function storageError(code: StorageError['code'], message: string): StorageError {
  return { code, message };
}

export function sanitizePathSegment(input: string): string {
  const normalized = input.replace(/\\/g, '/');
  const rawSegments = normalized.split('/');
  const segments: string[] = [];

  for (const segment of rawSegments) {
    if (segment === '') {
      continue;
    }

    if (segment === '.' || segment === '..') {
      throw storageError('INVALID_PATH', 'Path contains an unsafe segment.');
    }

    if (segment.includes('/') || segment.includes('\\') || segment.includes('\0') || CONTROL_CHARS.test(segment)) {
      throw storageError('INVALID_PATH', 'Path contains invalid characters.');
    }

    if (segment.startsWith('.')) {
      throw storageError('INVALID_PATH', 'Hidden path segments are not allowed.');
    }

    segments.push(segment);
  }

  return segments.join('/');
}

function getSanitizedExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot <= 0 || lastDot === filename.length - 1) {
    return '';
  }

  return filename
    .slice(lastDot + 1)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function generateKey(request: UploadRequest, config: FileStorageConfig): string {
  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const uuid = crypto.randomUUID();
  const ext = getSanitizedExtension(request.filename);
  const filename = ext ? `${uuid}.${ext}` : uuid;

  const parts = [
    config.keyPrefix ? sanitizePathSegment(config.keyPrefix) : '',
    request.directory ? sanitizePathSegment(request.directory) : '',
    year,
    month,
    filename,
  ].filter((part) => part.length > 0);

  const key = parts.join('/');
  const keySegments = key.split('/');

  if (key.startsWith('/') || keySegments.includes('..')) {
    throw storageError('INVALID_PATH', 'Generated key is unsafe.');
  }

  return key;
}
