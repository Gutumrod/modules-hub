export type UploadRequest = {
  file: Blob | ArrayBuffer;
  filename: string;
  contentType: string;
  directory?: string;
  metadata?: Record<string, string>;
  /** Override the config default visibility for this upload. */
  visibility?: 'public' | 'private';
};

export type UploadResult = {
  success: boolean;
  key?: string;
  url?: string;
  size?: number;
  contentType?: string;
  error?: StorageError;
};

export type DeleteResult = {
  success: boolean;
  error?: StorageError;
};

export type GetUrlOptions = {
  public?: boolean;
};

export type GetUrlResult = {
  success: boolean;
  url?: string;
  error?: StorageError;
};

export type GetMetadataResult = {
  success: boolean;
  metadata?: FileMetadata;
  error?: StorageError;
};

export type ExistsResult = {
  success: boolean;
  exists: boolean;
  error?: StorageError;
};

export type FileMetadata = {
  key: string;
  size: number;
  contentType: string;
  etag?: string;
  lastModified?: string;
  visibility: 'public' | 'private';
  metadata?: Record<string, string>;
};

export interface FileStorageConfig {
  /** The storage adapter (e.g. R2). Core never knows the concrete provider. */
  adapter: StorageAdapter;
  /** Bucket / container name. */
  bucket: string;
  /** Default visibility applied when an upload omits `visibility`. */
  defaultVisibility: 'public' | 'private';
  /** Maximum accepted file size in bytes. */
  maxFileSize: number;
  /** MIME allowlist. Empty array = allow all (not recommended). */
  allowedMimeTypes: readonly string[];
  /** Optional base URL for public objects (e.g. a custom domain). */
  publicBaseUrl?: string;
  /** Optional prefix applied to every generated key (e.g. "uploads"). */
  keyPrefix?: string;
}

export interface StorageError {
  code: StorageErrorCode;
  message: string;
  cause?: unknown;
}

export type StorageErrorCode =
  | 'INVALID_MIME'
  | 'FILE_TOO_LARGE'
  | 'EMPTY_FILE'
  | 'INVALID_FILENAME'
  | 'INVALID_PATH'
  | 'CONFIG_INVALID'
  | 'UPLOAD_FAILED'
  | 'DELETE_FAILED'
  | 'NOT_FOUND'
  | 'PRIVATE_ACCESS'
  | 'PROVIDER_ERROR';

export interface StorageAdapter {
  /** Write an object. Returns the stored object's metadata. */
  put(
    key: string,
    data: Blob | ArrayBuffer,
    options: PutOptions
  ): Promise<PutResult>;

  /** Delete an object. Idempotent — deleting a missing key is not an error. */
  delete(key: string): Promise<void>;

  /** Get a public URL for a public object. */
  getPublicUrl(key: string): Promise<string>;

  /** Get a signed/temporary URL for a private object. Throws if unsupported. */
  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string>;

  /** Fetch object metadata. Throws NOT_FOUND if the object is absent. */
  head(key: string): Promise<HeadResult>;

  /** Check existence without fetching metadata. */
  exists(key: string): Promise<boolean>;
}

export type PutOptions = {
  contentType: string;
  visibility: 'public' | 'private';
  metadata?: Record<string, string>;
};

export type PutResult = {
  key: string;
  size: number;
  etag?: string;
};

export type HeadResult = {
  key: string;
  size: number;
  contentType: string;
  etag?: string;
  lastModified?: string;
  metadata?: Record<string, string>;
};
