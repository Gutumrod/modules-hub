import { generateKey, sanitizePathSegment } from './path';
import type {
  DeleteResult,
  ExistsResult,
  FileMetadata,
  FileStorageConfig,
  GetMetadataResult,
  GetUrlOptions,
  GetUrlResult,
  HeadResult,
  StorageError,
  StorageErrorCode,
  UploadRequest,
  UploadResult,
} from './types';
import { validateUpload } from './validate';

export interface FileStorageClient {
  upload(request: UploadRequest): Promise<UploadResult>;
  delete(key: string): Promise<DeleteResult>;
  getUrl(key: string, options?: GetUrlOptions): Promise<GetUrlResult>;
  getMetadata(key: string): Promise<GetMetadataResult>;
  exists(key: string): Promise<ExistsResult>;
}

const VISIBILITY_METADATA_KEY = '__file_storage_visibility';
const MIME_TYPE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*\/[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*$/;

function storageError(code: StorageErrorCode, message: string, cause?: unknown): StorageError {
  return cause === undefined ? { code, message } : { code, message, cause };
}

function isStorageError(value: unknown): value is StorageError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    typeof (value as { code: unknown }).code === 'string'
  );
}

function validateConfig(config: FileStorageConfig): void {
  if (!config.adapter) {
    throw storageError('CONFIG_INVALID', 'Storage adapter is required.');
  }

  if (typeof config.bucket !== 'string' || config.bucket.trim().length === 0) {
    throw storageError('CONFIG_INVALID', 'Bucket is required.');
  }

  if (config.defaultVisibility !== 'public' && config.defaultVisibility !== 'private') {
    throw storageError('CONFIG_INVALID', 'Default visibility is invalid.');
  }

  if (!Number.isInteger(config.maxFileSize) || config.maxFileSize <= 0) {
    throw storageError('CONFIG_INVALID', 'Maximum file size must be a positive integer.');
  }

  if (!Array.isArray(config.allowedMimeTypes)) {
    throw storageError('CONFIG_INVALID', 'Allowed MIME types must be an array.');
  }

  for (const mimeType of config.allowedMimeTypes) {
    if (typeof mimeType !== 'string' || !MIME_TYPE_PATTERN.test(mimeType)) {
      throw storageError('CONFIG_INVALID', 'Allowed MIME types must contain valid MIME strings.');
    }
  }

  if (config.keyPrefix !== undefined) {
    try {
      sanitizePathSegment(config.keyPrefix);
    } catch (cause) {
      throw storageError('CONFIG_INVALID', 'Key prefix is unsafe.', cause);
    }
  }
}

function publicUrlFromConfig(publicBaseUrl: string, key: string): string {
  return `${publicBaseUrl.replace(/\/+$/, '')}/${key.split('/').map(encodeURIComponent).join('/')}`;
}

function splitInternalMetadata(metadata: Record<string, string> | undefined): {
  visibility?: 'public' | 'private';
  metadata?: Record<string, string>;
} {
  if (!metadata) {
    return {};
  }

  const { [VISIBILITY_METADATA_KEY]: visibilityValue, ...userMetadata } = metadata;
  const visibility = visibilityValue === 'public' || visibilityValue === 'private' ? visibilityValue : undefined;

  return {
    visibility,
    metadata: Object.keys(userMetadata).length > 0 ? userMetadata : undefined,
  };
}

function mapMetadata(head: HeadResult, defaultVisibility: 'public' | 'private'): FileMetadata {
  const split = splitInternalMetadata(head.metadata);

  return {
    key: head.key,
    size: head.size,
    contentType: head.contentType,
    etag: head.etag,
    lastModified: head.lastModified,
    visibility: split.visibility ?? defaultVisibility,
    metadata: split.metadata,
  };
}

function mapProviderError(cause: unknown, fallbackCode: StorageErrorCode, fallbackMessage: string): StorageError {
  if (isStorageError(cause) && cause.code === 'NOT_FOUND') {
    return storageError('NOT_FOUND', 'Object was not found.', cause);
  }

  return storageError(fallbackCode, fallbackMessage, cause);
}

export function createFileStorage(config: FileStorageConfig): FileStorageClient {
  validateConfig(config);

  return {
    async upload(request: UploadRequest): Promise<UploadResult> {
      const validation = validateUpload(request, config);
      if (!validation.ok) {
        return { success: false, error: validation.error };
      }

      let key: string;
      try {
        key = generateKey(request, config);
      } catch (cause) {
        return { success: false, error: storageError('INVALID_PATH', 'Generated key is unsafe.', cause) };
      }

      const visibility = request.visibility ?? config.defaultVisibility;
      const metadata = {
        ...(request.metadata ?? {}),
        [VISIBILITY_METADATA_KEY]: visibility,
      };

      try {
        const putResult = await config.adapter.put(key, request.file, {
          contentType: request.contentType,
          visibility,
          metadata,
        });
        const urlResult = await this.getUrl(putResult.key, { public: visibility === 'public' });

        return {
          success: true,
          key: putResult.key,
          url: urlResult.success ? urlResult.url : undefined,
          size: putResult.size,
          contentType: request.contentType,
        };
      } catch (cause) {
        return { success: false, error: mapProviderError(cause, 'UPLOAD_FAILED', 'Upload failed.') };
      }
    },

    async delete(key: string): Promise<DeleteResult> {
      try {
        await config.adapter.delete(key);
        return { success: true };
      } catch (cause) {
        return { success: false, error: mapProviderError(cause, 'DELETE_FAILED', 'Delete failed.') };
      }
    },

    async getUrl(key: string, options?: GetUrlOptions): Promise<GetUrlResult> {
      try {
        const forcedPublic = options?.public;
        let isPublic = forcedPublic;

        if (isPublic === undefined) {
          const head = await config.adapter.head(key);
          const metadata = mapMetadata(head, config.defaultVisibility);
          isPublic = metadata.visibility === 'public';
        }

        if (isPublic) {
          const url = config.publicBaseUrl ? publicUrlFromConfig(config.publicBaseUrl, key) : await config.adapter.getPublicUrl(key);
          return { success: true, url };
        }

        try {
          const url = await config.adapter.getSignedUrl(key);
          return { success: true, url };
        } catch (cause) {
          return { success: false, error: storageError('PRIVATE_ACCESS', 'Private object URL is not available.', cause) };
        }
      } catch (cause) {
        return { success: false, error: mapProviderError(cause, 'PROVIDER_ERROR', 'Could not get object URL.') };
      }
    },

    async getMetadata(key: string): Promise<GetMetadataResult> {
      try {
        const head = await config.adapter.head(key);
        return { success: true, metadata: mapMetadata(head, config.defaultVisibility) };
      } catch (cause) {
        return { success: false, error: mapProviderError(cause, 'PROVIDER_ERROR', 'Could not get object metadata.') };
      }
    },

    async exists(key: string): Promise<ExistsResult> {
      try {
        return { success: true, exists: await config.adapter.exists(key) };
      } catch (cause) {
        return { success: false, exists: false, error: storageError('PROVIDER_ERROR', 'Could not check object existence.', cause) };
      }
    },
  };
}
