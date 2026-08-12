import { sanitizePathSegment } from './path';
import type { FileStorageConfig, StorageError, UploadRequest } from './types';

type ValidationResult = { ok: true } | { ok: false; error: StorageError };

const EXTENSION_MIME_MAP: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  pdf: 'application/pdf',
  txt: 'text/plain',
  json: 'application/json',
  csv: 'text/csv',
  mp4: 'video/mp4',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  gif: 'image/gif',
  zip: 'application/zip',
};

const RESERVED_WINDOWS_NAMES = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;

function storageError(code: StorageError['code'], message: string): StorageError {
  return { code, message };
}

function fileSize(file: Blob | ArrayBuffer): number {
  return file instanceof Blob ? file.size : file.byteLength;
}

function getExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot <= 0 || lastDot === filename.length - 1) {
    return '';
  }

  return filename.slice(lastDot + 1).toLowerCase();
}

function validateFilename(filename: string): StorageError | undefined {
  if (typeof filename !== 'string' || filename.length === 0) {
    return storageError('INVALID_FILENAME', 'Filename is required.');
  }

  if (
    filename === '.' ||
    filename === '..' ||
    filename.includes('/') ||
    filename.includes('\\') ||
    filename.includes('\0') ||
    filename.startsWith('.') ||
    CONTROL_CHARS.test(filename)
  ) {
    return storageError('INVALID_FILENAME', 'Filename is unsafe.');
  }

  const baseName = filename.includes('.') ? filename.slice(0, filename.indexOf('.')) : filename;
  if (RESERVED_WINDOWS_NAMES.test(baseName)) {
    return storageError('INVALID_FILENAME', 'Filename is reserved.');
  }

  return undefined;
}

export function validateUpload(request: UploadRequest, config: FileStorageConfig): ValidationResult {
  const size = fileSize(request.file);

  if (size === 0) {
    return { ok: false, error: storageError('EMPTY_FILE', 'File is empty.') };
  }

  if (size > config.maxFileSize) {
    return { ok: false, error: storageError('FILE_TOO_LARGE', 'File exceeds the configured maximum size.') };
  }

  if (config.allowedMimeTypes.length > 0 && !config.allowedMimeTypes.includes(request.contentType)) {
    return { ok: false, error: storageError('INVALID_MIME', 'Content type is not allowed.') };
  }

  const filenameError = validateFilename(request.filename);
  if (filenameError) {
    return { ok: false, error: filenameError };
  }

  const extension = getExtension(request.filename);
  const expectedMime = extension ? EXTENSION_MIME_MAP[extension] : undefined;
  if (expectedMime && request.contentType !== expectedMime) {
    return { ok: false, error: storageError('INVALID_MIME', 'Filename extension does not match content type.') };
  }

  if (request.directory !== undefined) {
    try {
      sanitizePathSegment(request.directory);
    } catch {
      return { ok: false, error: storageError('INVALID_PATH', 'Directory path is unsafe.') };
    }
  }

  return { ok: true };
}
