import type { HeadResult, PutOptions, PutResult, StorageAdapter, StorageError } from '../core/types';

type R2ObjectBody = {
  size: number;
  etag?: string;
  uploaded?: Date;
  httpMetadata?: {
    contentType?: string;
  };
  customMetadata?: Record<string, string>;
};

type R2BucketBinding = {
  put(
    key: string,
    value: Blob | ArrayBuffer,
    options?: {
      httpMetadata?: {
        contentType?: string;
      };
      customMetadata?: Record<string, string>;
    }
  ): Promise<R2ObjectBody>;
  delete(key: string): Promise<void>;
  head(key: string): Promise<R2ObjectBody | null>;
};

function storageError(code: StorageError['code'], message: string, cause?: unknown): StorageError {
  return cause === undefined ? { code, message } : { code, message, cause };
}

function assertSafeKey(key: string): void {
  if (key.includes('..')) {
    throw storageError('INVALID_PATH', 'Object key is unsafe.');
  }
}

export function createR2Adapter(bucket: R2BucketBinding, publicBaseUrl?: string): StorageAdapter {
  return {
    async put(key: string, data: Blob | ArrayBuffer, options: PutOptions): Promise<PutResult> {
      assertSafeKey(key);

      const object = await bucket.put(key, data, {
        httpMetadata: {
          contentType: options.contentType,
        },
        customMetadata: options.metadata,
      });

      return {
        key,
        size: object.size,
        etag: object.etag,
      };
    },

    async delete(key: string): Promise<void> {
      await bucket.delete(key);
    },

    async getPublicUrl(key: string): Promise<string> {
      if (!publicBaseUrl) {
        throw storageError('PRIVATE_ACCESS', 'Public base URL is not configured.');
      }

      return `${publicBaseUrl.replace(/\/+$/, '')}/${key.split('/').map(encodeURIComponent).join('/')}`;
    },

    async getSignedUrl(): Promise<string> {
      throw storageError('PRIVATE_ACCESS', 'Signed URLs are not supported by this adapter.');
    },

    async head(key: string): Promise<HeadResult> {
      const object = await bucket.head(key);

      if (!object) {
        throw storageError('NOT_FOUND', 'Object was not found.');
      }

      return {
        key,
        size: object.size,
        contentType: object.httpMetadata?.contentType ?? 'application/octet-stream',
        etag: object.etag,
        lastModified: object.uploaded?.toISOString(),
        metadata: object.customMetadata,
      };
    },

    async exists(key: string): Promise<boolean> {
      return (await bucket.head(key)) !== null;
    },
  };
}
