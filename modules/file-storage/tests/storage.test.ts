/**
 * file-storage-module / tests/storage.test.ts
 * Stage 4 QA — verifies the implemented core/ + adapters/ against DESIGN.md.
 * Run with: npm test (vitest)
 *
 * Uses a fake in-memory StorageAdapter to exercise the FileStorageClient
 * (upload/delete/getUrl/getMetadata/exists) without a real provider, plus a
 * fake R2 bucket binding to exercise adapters/r2.ts directly.
 */

import { describe, it, expect } from 'vitest';
import { createFileStorage } from '../core';
import type {
  FileStorageConfig,
  HeadResult,
  PutOptions,
  PutResult,
  StorageAdapter,
  StorageError,
  UploadRequest,
} from '../core';
import { createR2Adapter } from '../adapters/r2';

// ──────────────────────────────────────────────
// Fake in-memory StorageAdapter
// ──────────────────────────────────────────────
type StoredObject = {
  key: string;
  size: number;
  contentType: string;
  etag?: string;
  lastModified?: string;
  metadata?: Record<string, string>;
};

class FakeAdapter implements StorageAdapter {
  store = new Map<string, StoredObject>();
  signedUrlSupported = true;
  publicBaseUrl = 'https://cdn.example.com';

  // Failure switches (provider-level errors)
  failPut = false;
  failDelete = false;
  failHead = false;
  failExists = false;
  putErrorCode?: string;
  deleteErrorCode?: string;
  headErrorCode?: string;
  existsErrorCode?: string;

  putCalls: { key: string; options: PutOptions }[] = [];

  async put(key: string, data: Blob | ArrayBuffer, options: PutOptions): Promise<PutResult> {
    this.putCalls.push({ key, options });
    if (this.failPut) {
      throw this.putErrorCode
        ? { code: this.putErrorCode, message: 'put failed' }
        : new Error('put failed');
    }
    if (key.includes('..')) {
      throw { code: 'INVALID_PATH', message: 'unsafe key' };
    }
    const size = data instanceof Blob ? data.size : data.byteLength;
    const obj: StoredObject = {
      key,
      size,
      contentType: options.contentType,
      etag: `etag-${key}`,
      lastModified: new Date().toISOString(),
      metadata: options.metadata,
    };
    this.store.set(key, obj);
    return { key, size, etag: obj.etag };
  }

  async delete(key: string): Promise<void> {
    if (this.failDelete) {
      throw this.deleteErrorCode
        ? { code: this.deleteErrorCode, message: 'delete failed' }
        : new Error('delete failed');
    }
    this.store.delete(key);
  }

  async getPublicUrl(key: string): Promise<string> {
    return `${this.publicBaseUrl}/${key}`;
  }

  async getSignedUrl(key: string, expiresInSeconds?: number): Promise<string> {
    if (!this.signedUrlSupported) {
      throw { code: 'PRIVATE_ACCESS', message: 'signed urls unsupported' };
    }
    return `${this.publicBaseUrl}/signed/${key}?expires=${expiresInSeconds ?? 3600}`;
  }

  async head(key: string): Promise<HeadResult> {
    if (this.failHead) {
      throw this.headErrorCode
        ? { code: this.headErrorCode, message: 'head failed' }
        : new Error('head failed');
    }
    const obj = this.store.get(key);
    if (!obj) {
      throw { code: 'NOT_FOUND', message: 'not found' };
    }
    return {
      key: obj.key,
      size: obj.size,
      contentType: obj.contentType,
      etag: obj.etag,
      lastModified: obj.lastModified,
      metadata: obj.metadata,
    };
  }

  async exists(key: string): Promise<boolean> {
    if (this.failExists) {
      throw this.existsErrorCode
        ? { code: this.existsErrorCode, message: 'exists failed' }
        : new Error('exists failed');
    }
    return this.store.has(key);
  }
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────
function makeHarness(overrides: Partial<FileStorageConfig> = {}) {
  const adapter = new FakeAdapter();
  const config: FileStorageConfig = {
    adapter,
    bucket: 'test-bucket',
    defaultVisibility: 'private',
    maxFileSize: 1024 * 1024,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'application/pdf', 'text/plain'],
    publicBaseUrl: 'https://cdn.example.com',
    keyPrefix: 'uploads',
    ...overrides,
  };
  const storage = createFileStorage(config);
  return { adapter, config, storage };
}

function makeRequest(overrides: Partial<UploadRequest> = {}): UploadRequest {
  return {
    file: new Blob(['hello world'], { type: 'text/plain' }),
    filename: 'notes.txt',
    contentType: 'text/plain',
    ...overrides,
  };
}

// Catch a thrown value (StorageError is a plain object, not an Error instance).
function catchThrow(fn: () => unknown): StorageError {
  try {
    fn();
  } catch (e) {
    return e as StorageError;
  }
  throw new Error('Expected fn to throw, but it did not');
}

// ══════════════════════════════════════════════
// createFileStorage — config validation (construction-time throw)
// ══════════════════════════════════════════════
describe('createFileStorage — config validation', () => {
  it('throws CONFIG_INVALID when adapter is missing', () => {
    const err = catchThrow(() =>
      createFileStorage({
        adapter: undefined as unknown as StorageAdapter,
        bucket: 'b',
        defaultVisibility: 'private',
        maxFileSize: 100,
        allowedMimeTypes: [],
      }),
    );
    expect(err.code).toBe('CONFIG_INVALID');
  });

  it('throws CONFIG_INVALID when bucket is empty', () => {
    const { adapter } = makeHarness();
    const err = catchThrow(() =>
      createFileStorage({
        adapter,
        bucket: '   ',
        defaultVisibility: 'private',
        maxFileSize: 100,
        allowedMimeTypes: [],
      }),
    );
    expect(err.code).toBe('CONFIG_INVALID');
  });

  it('throws CONFIG_INVALID when defaultVisibility is invalid', () => {
    const { adapter } = makeHarness();
    const err = catchThrow(() =>
      createFileStorage({
        adapter,
        bucket: 'b',
        defaultVisibility: 'public-ish' as 'public',
        maxFileSize: 100,
        allowedMimeTypes: [],
      }),
    );
    expect(err.code).toBe('CONFIG_INVALID');
  });

  it('throws CONFIG_INVALID when maxFileSize is not a positive integer', () => {
    const { adapter } = makeHarness();
    for (const bad of [0, -5, 1.5, NaN]) {
      const err = catchThrow(() =>
        createFileStorage({
          adapter,
          bucket: 'b',
          defaultVisibility: 'private',
          maxFileSize: bad,
          allowedMimeTypes: [],
        }),
      );
      expect(err.code).toBe('CONFIG_INVALID');
    }
  });

  it('throws CONFIG_INVALID when allowedMimeTypes is not an array', () => {
    const { adapter } = makeHarness();
    const err = catchThrow(() =>
      createFileStorage({
        adapter,
        bucket: 'b',
        defaultVisibility: 'private',
        maxFileSize: 100,
        allowedMimeTypes: 'image/jpeg' as unknown as readonly string[],
      }),
    );
    expect(err.code).toBe('CONFIG_INVALID');
  });

  it('throws CONFIG_INVALID when an allowed MIME entry is malformed', () => {
    const { adapter } = makeHarness();
    const err = catchThrow(() =>
      createFileStorage({
        adapter,
        bucket: 'b',
        defaultVisibility: 'private',
        maxFileSize: 100,
        allowedMimeTypes: ['not-a-mime'],
      }),
    );
    expect(err.code).toBe('CONFIG_INVALID');
  });

  it('throws CONFIG_INVALID when keyPrefix is unsafe', () => {
    const { adapter } = makeHarness();
    const err = catchThrow(() =>
      createFileStorage({
        adapter,
        bucket: 'b',
        defaultVisibility: 'private',
        maxFileSize: 100,
        allowedMimeTypes: [],
        keyPrefix: '../escape',
      }),
    );
    expect(err.code).toBe('CONFIG_INVALID');
  });

  it('accepts a valid config and returns a client with the 5 public methods', () => {
    const { storage } = makeHarness();
    expect(typeof storage.upload).toBe('function');
    expect(typeof storage.delete).toBe('function');
    expect(typeof storage.getUrl).toBe('function');
    expect(typeof storage.getMetadata).toBe('function');
    expect(typeof storage.exists).toBe('function');
  });
});

// ══════════════════════════════════════════════
// upload — success
// ══════════════════════════════════════════════
describe('upload — success', () => {
  it('returns success:true with key, url, size, contentType', async () => {
    const { storage } = makeHarness();
    const result = await storage.upload(makeRequest());
    expect(result.success).toBe(true);
    expect(result.key).toBeDefined();
    expect(result.url).toBeDefined();
    expect(result.size).toBe(11); // "hello world"
    expect(result.contentType).toBe('text/plain');
    expect(result.error).toBeUndefined();
  });

  it('accepts an ArrayBuffer file', async () => {
    const { storage } = makeHarness();
    const buf = new TextEncoder().encode('hello world').buffer;
    const result = await storage.upload(makeRequest({ file: buf }));
    expect(result.success).toBe(true);
    expect(result.size).toBe(11);
  });

  it('does not mutate the input UploadRequest object', async () => {
    const { storage } = makeHarness();
    const request = makeRequest();
    const snapshot = JSON.stringify(request);
    await storage.upload(request);
    expect(JSON.stringify(request)).toBe(snapshot);
  });

  it('applies per-request visibility override over the config default', async () => {
    const { adapter, storage } = makeHarness({ defaultVisibility: 'private' });
    const result = await storage.upload(makeRequest({ visibility: 'public' }));
    expect(result.success).toBe(true);
    // The stored visibility metadata should be 'public'.
    const head = await adapter.head(result.key!);
    expect(head.metadata?.['__file_storage_visibility']).toBe('public');
  });
});

// ══════════════════════════════════════════════
// upload — validation failures (returned, never thrown)
// ══════════════════════════════════════════════
describe('upload — validation failures', () => {
  it('empty file -> EMPTY_FILE', async () => {
    const { storage } = makeHarness();
    const result = await storage.upload(makeRequest({ file: new Blob([]) }));
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('EMPTY_FILE');
  });

  it('oversized file -> FILE_TOO_LARGE', async () => {
    const { storage } = makeHarness({ maxFileSize: 5 });
    const result = await storage.upload(makeRequest({ file: new Blob(['123456']) }));
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('FILE_TOO_LARGE');
  });

  it('contentType not in allowlist -> INVALID_MIME', async () => {
    const { storage } = makeHarness();
    const result = await storage.upload(makeRequest({ contentType: 'application/x-msdownload' }));
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INVALID_MIME');
  });

  it('spoofed known extension -> INVALID_MIME (photo.jpg declared as image/png)', async () => {
    const { storage } = makeHarness();
    const result = await storage.upload(
      makeRequest({ filename: 'photo.jpg', contentType: 'image/png' }),
    );
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INVALID_MIME');
  });

  it('matching extension + MIME -> ok (photo.jpg as image/jpeg)', async () => {
    const { storage } = makeHarness();
    const result = await storage.upload(
      makeRequest({ filename: 'photo.jpg', contentType: 'image/jpeg' }),
    );
    expect(result.success).toBe(true);
  });

  it('unknown extension + allowlisted MIME -> ok (no false reject)', async () => {
    const { storage } = makeHarness();
    const result = await storage.upload(
      makeRequest({ filename: 'archive.xyz', contentType: 'application/pdf' }),
    );
    expect(result.success).toBe(true);
  });

  it('validation failures do not throw', async () => {
    const { storage } = makeHarness();
    await expect(storage.upload(makeRequest({ file: new Blob([]) }))).resolves.toMatchObject({
      success: false,
    });
  });
});

// ══════════════════════════════════════════════
// upload — filename sanitization
// ══════════════════════════════════════════════
describe('upload — filename sanitization', () => {
  it('empty filename -> INVALID_FILENAME', async () => {
    const { storage } = makeHarness();
    const result = await storage.upload(makeRequest({ filename: '' }));
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INVALID_FILENAME');
  });

  it('filename with "/" -> INVALID_FILENAME', async () => {
    const { storage } = makeHarness();
    const result = await storage.upload(makeRequest({ filename: 'a/b.txt' }));
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INVALID_FILENAME');
  });

  it('filename with "\\" -> INVALID_FILENAME', async () => {
    const { storage } = makeHarness();
    const result = await storage.upload(makeRequest({ filename: 'a\\b.txt' }));
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INVALID_FILENAME');
  });

  it('filename "." or ".." -> INVALID_FILENAME', async () => {
    const { storage } = makeHarness();
    for (const name of ['.', '..']) {
      const result = await storage.upload(makeRequest({ filename: name }));
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INVALID_FILENAME');
    }
  });

  it('hidden filename (starts with ".") -> INVALID_FILENAME', async () => {
    const { storage } = makeHarness();
    const result = await storage.upload(makeRequest({ filename: '.hidden.txt' }));
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INVALID_FILENAME');
  });

  it('reserved Windows name (CON, NUL, COM1) -> INVALID_FILENAME', async () => {
    const { storage } = makeHarness();
    for (const name of ['CON.txt', 'NUL', 'COM1.txt', 'lpt3.log']) {
      const result = await storage.upload(makeRequest({ filename: name }));
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INVALID_FILENAME');
    }
  });

  it('filename with NUL char -> INVALID_FILENAME', async () => {
    const { storage } = makeHarness();
    const result = await storage.upload(makeRequest({ filename: 'bad\u0000name.txt' }));
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INVALID_FILENAME');
  });
});

// ══════════════════════════════════════════════
// upload — path traversal (directory)
// ══════════════════════════════════════════════
describe('upload — path traversal', () => {
  it('directory with ".." -> INVALID_PATH', async () => {
    const { storage } = makeHarness();
    for (const dir of ['../etc', 'a/../b', '..']) {
      const result = await storage.upload(makeRequest({ directory: dir }));
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INVALID_PATH');
    }
  });

  it('hidden directory segment -> INVALID_PATH', async () => {
    const { storage } = makeHarness();
    for (const dir of ['.hidden', 'a/.hidden']) {
      const result = await storage.upload(makeRequest({ directory: dir }));
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INVALID_PATH');
    }
  });

  it('backslash and repeated separators are normalized, not rejected', async () => {
    // DESIGN §5.2 rules 3 & 5: separators are normalized to "/" and empty
    // segments are collapsed. So "a\\b" and "a//b" are valid -> "a/b".
    const { storage } = makeHarness();
    for (const dir of ['a\\b', 'a//b']) {
      const result = await storage.upload(makeRequest({ directory: dir }));
      expect(result.success).toBe(true);
      expect(result.key).toMatch(/^uploads\/a\/b\/\d{4}\/\d{2}\//);
    }
  });

  it('safe directory is accepted and prepended to the key', async () => {
    const { storage } = makeHarness();
    const result = await storage.upload(makeRequest({ directory: 'avatars' }));
    expect(result.success).toBe(true);
    expect(result.key).toMatch(/^uploads\/avatars\/\d{4}\/\d{2}\//);
  });
});

// ══════════════════════════════════════════════
// upload — provider failure
// ══════════════════════════════════════════════
describe('upload — provider failure', () => {
  it('adapter put throws -> UPLOAD_FAILED', async () => {
    const { adapter, storage } = makeHarness();
    adapter.failPut = true;
    const result = await storage.upload(makeRequest());
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('UPLOAD_FAILED');
  });

  it('adapter put throws a StorageError -> still maps to UPLOAD_FAILED', async () => {
    // DESIGN §7.1: the core maps adapter throws to its own codes. A put failure
    // is always surfaced as UPLOAD_FAILED (only NOT_FOUND is passed through).
    const { adapter, storage } = makeHarness();
    adapter.failPut = true;
    adapter.putErrorCode = 'PROVIDER_ERROR';
    const result = await storage.upload(makeRequest());
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('UPLOAD_FAILED');
  });

  it('error object does not leak secrets or signed URLs', async () => {
    const { adapter, storage } = makeHarness();
    adapter.failPut = true;
    const result = await storage.upload(makeRequest());
    expect(result.error?.message).not.toMatch(/secret|token|signed|credential/i);
    expect(JSON.stringify(result.error)).not.toMatch(/secret|token|signed|credential/i);
  });
});

// ══════════════════════════════════════════════
// Safe object key generation
// ══════════════════════════════════════════════
describe('safe object key generation', () => {
  it('generated key matches {prefix}/{year}/{month}/{uuid}.{ext} and never uses the user filename', async () => {
    const { storage } = makeHarness();
    const result = await storage.upload(makeRequest({ filename: 'notes.txt' }));
    expect(result.success).toBe(true);
    const key = result.key!;
    expect(key).toMatch(/^uploads\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.txt$/);
    expect(key).not.toContain('notes');
  });

  it('no-extension filename -> key has no .ext suffix', async () => {
    const { storage } = makeHarness();
    const result = await storage.upload(makeRequest({ filename: 'README' }));
    expect(result.success).toBe(true);
    expect(result.key).toMatch(/^uploads\/\d{4}\/\d{2}\/[0-9a-f-]{36}$/);
  });

  it('extension is lowercased and sanitized', async () => {
    const { storage } = makeHarness();
    // contentType must match the mapped type for .JPG (image/jpeg) to pass the
    // spoofed-extension check; the generated key extension is lowercased.
    const result = await storage.upload(
      makeRequest({ filename: 'Photo.JPG', contentType: 'image/jpeg' }),
    );
    expect(result.success).toBe(true);
    expect(result.key).toMatch(/\.jpg$/);
  });

  it('key never starts with "/" and never contains ".."', async () => {
    const { storage } = makeHarness();
    const result = await storage.upload(makeRequest({ directory: 'avatars' }));
    expect(result.success).toBe(true);
    expect(result.key!.startsWith('/')).toBe(false);
    expect(result.key!.split('/')).not.toContain('..');
  });

  it('keyPrefix is applied and sanitized', async () => {
    const { storage } = makeHarness({ keyPrefix: 'user-files' });
    const result = await storage.upload(makeRequest());
    expect(result.success).toBe(true);
    expect(result.key).toMatch(/^user-files\//);
  });

  it('uuid is a valid v4 UUID', async () => {
    const { storage } = makeHarness();
    const result = await storage.upload(makeRequest());
    const uuid = result.key!.split('/').pop()!.split('.')[0];
    expect(uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});

// ══════════════════════════════════════════════
// delete
// ══════════════════════════════════════════════
describe('delete', () => {
  it('delete success -> success:true', async () => {
    const { storage } = makeHarness();
    const up = await storage.upload(makeRequest());
    const result = await storage.delete(up.key!);
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('delete missing file is idempotent -> success:true', async () => {
    const { storage } = makeHarness();
    const result = await storage.delete('uploads/2026/08/does-not-exist.txt');
    expect(result.success).toBe(true);
  });

  it('adapter delete failure -> DELETE_FAILED', async () => {
    const { adapter, storage } = makeHarness();
    adapter.failDelete = true;
    const result = await storage.delete('some-key');
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('DELETE_FAILED');
  });
});

// ══════════════════════════════════════════════
// getUrl — public/private concept
// ══════════════════════════════════════════════
describe('getUrl — public/private concept', () => {
  it('public object -> stable public URL from publicBaseUrl', async () => {
    const { storage } = makeHarness({ defaultVisibility: 'public' });
    const up = await storage.upload(makeRequest());
    const result = await storage.getUrl(up.key!);
    expect(result.success).toBe(true);
    expect(result.url).toBe(`https://cdn.example.com/${up.key}`);
  });

  it('private object with signed-URL adapter -> signed URL', async () => {
    const { storage } = makeHarness({ defaultVisibility: 'private' });
    const up = await storage.upload(makeRequest());
    const result = await storage.getUrl(up.key!);
    expect(result.success).toBe(true);
    expect(result.url).toContain('/signed/');
  });

  it('private object without signed-URL support -> PRIVATE_ACCESS', async () => {
    const { adapter, storage } = makeHarness({ defaultVisibility: 'private' });
    adapter.signedUrlSupported = false;
    const up = await storage.upload(makeRequest());
    const result = await storage.getUrl(up.key!);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('PRIVATE_ACCESS');
  });

  it('getUrl public option overrides stored visibility for that call', async () => {
    const { adapter, storage } = makeHarness({ defaultVisibility: 'private' });
    adapter.signedUrlSupported = false;
    const up = await storage.upload(makeRequest());
    // Force a public URL even though the object is private.
    const result = await storage.getUrl(up.key!, { public: true });
    expect(result.success).toBe(true);
    expect(result.url).toBe(`https://cdn.example.com/${up.key}`);
  });

  it('getUrl on a missing key -> NOT_FOUND', async () => {
    const { storage } = makeHarness();
    const result = await storage.getUrl('uploads/2026/08/missing.txt');
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('NOT_FOUND');
  });
});

// ══════════════════════════════════════════════
// getMetadata
// ══════════════════════════════════════════════
describe('getMetadata', () => {
  it('returns FileMetadata for an existing object', async () => {
    const { storage } = makeHarness();
    const up = await storage.upload(makeRequest({ metadata: { owner: 'alice' } }));
    const result = await storage.getMetadata(up.key!);
    expect(result.success).toBe(true);
    expect(result.metadata?.key).toBe(up.key);
    expect(result.metadata?.size).toBe(11);
    expect(result.metadata?.contentType).toBe('text/plain');
    expect(result.metadata?.visibility).toBe('private');
    expect(result.metadata?.metadata?.owner).toBe('alice');
  });

  it('missing key -> NOT_FOUND', async () => {
    const { storage } = makeHarness();
    const result = await storage.getMetadata('uploads/2026/08/missing.txt');
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('NOT_FOUND');
  });

  it('provider failure -> PROVIDER_ERROR', async () => {
    const { adapter, storage } = makeHarness();
    adapter.failHead = true;
    const result = await storage.getMetadata('some-key');
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('PROVIDER_ERROR');
  });
});

// ══════════════════════════════════════════════
// exists
// ══════════════════════════════════════════════
describe('exists', () => {
  it('present object -> exists:true', async () => {
    const { storage } = makeHarness();
    const up = await storage.upload(makeRequest());
    const result = await storage.exists(up.key!);
    expect(result.success).toBe(true);
    expect(result.exists).toBe(true);
  });

  it('absent object -> exists:false', async () => {
    const { storage } = makeHarness();
    const result = await storage.exists('uploads/2026/08/missing.txt');
    expect(result.success).toBe(true);
    expect(result.exists).toBe(false);
  });

  it('provider failure -> success:false with PROVIDER_ERROR', async () => {
    const { adapter, storage } = makeHarness();
    adapter.failExists = true;
    const result = await storage.exists('some-key');
    expect(result.success).toBe(false);
    expect(result.exists).toBe(false);
    expect(result.error?.code).toBe('PROVIDER_ERROR');
  });
});

// ══════════════════════════════════════════════
// adapters/r2.ts — R2 adapter contract
// ══════════════════════════════════════════════
type FakeR2Object = {
  size: number;
  etag?: string;
  uploaded?: Date;
  httpMetadata?: { contentType?: string };
  customMetadata?: Record<string, string>;
};

function makeFakeBucket() {
  const store = new Map<string, FakeR2Object>();
  return {
    store,
    async put(
      key: string,
      value: Blob | ArrayBuffer,
      options?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> },
    ): Promise<FakeR2Object> {
      const size = value instanceof Blob ? value.size : value.byteLength;
      const obj: FakeR2Object = {
        size,
        etag: `etag-${key}`,
        uploaded: new Date(),
        httpMetadata: options?.httpMetadata,
        customMetadata: options?.customMetadata,
      };
      store.set(key, obj);
      return obj;
    },
    async delete(key: string): Promise<void> {
      store.delete(key);
    },
    async head(key: string): Promise<FakeR2Object | null> {
      return store.get(key) ?? null;
    },
  };
}

describe('adapters/r2.ts', () => {
  it('put stores the object and returns key/size/etag', async () => {
    const bucket = makeFakeBucket();
    const adapter = createR2Adapter(bucket, 'https://cdn.example.com');
    const result = await adapter.put('uploads/2026/08/abc.txt', new Blob(['hi']), {
      contentType: 'text/plain',
      visibility: 'public',
    });
    expect(result.key).toBe('uploads/2026/08/abc.txt');
    expect(result.size).toBe(2);
    expect(result.etag).toBeDefined();
    expect(bucket.store.has('uploads/2026/08/abc.txt')).toBe(true);
  });

  it('put rejects a key containing ".." (defense-in-depth)', async () => {
    const bucket = makeFakeBucket();
    const adapter = createR2Adapter(bucket, 'https://cdn.example.com');
    await expect(
      adapter.put('../escape.txt', new Blob(['x']), {
        contentType: 'text/plain',
        visibility: 'public',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_PATH' });
  });

  it('delete is idempotent for a missing key', async () => {
    const bucket = makeFakeBucket();
    const adapter = createR2Adapter(bucket, 'https://cdn.example.com');
    await expect(adapter.delete('missing-key')).resolves.toBeUndefined();
  });

  it('getPublicUrl builds a URL from publicBaseUrl', async () => {
    const bucket = makeFakeBucket();
    const adapter = createR2Adapter(bucket, 'https://cdn.example.com');
    await expect(adapter.getPublicUrl('uploads/a.txt')).resolves.toBe(
      'https://cdn.example.com/uploads/a.txt',
    );
  });

  it('getPublicUrl without publicBaseUrl -> PRIVATE_ACCESS', async () => {
    const bucket = makeFakeBucket();
    const adapter = createR2Adapter(bucket);
    await expect(adapter.getPublicUrl('uploads/a.txt')).rejects.toMatchObject({
      code: 'PRIVATE_ACCESS',
    });
  });

  it('getSignedUrl is unsupported -> PRIVATE_ACCESS', async () => {
    const bucket = makeFakeBucket();
    const adapter = createR2Adapter(bucket, 'https://cdn.example.com');
    await expect(adapter.getSignedUrl('uploads/a.txt')).rejects.toMatchObject({
      code: 'PRIVATE_ACCESS',
    });
  });

  it('head returns HeadResult for an existing object', async () => {
    const bucket = makeFakeBucket();
    const adapter = createR2Adapter(bucket, 'https://cdn.example.com');
    await adapter.put('uploads/a.txt', new Blob(['hi']), {
      contentType: 'text/plain',
      visibility: 'public',
      metadata: { owner: 'alice' },
    });
    const head = await adapter.head('uploads/a.txt');
    expect(head.key).toBe('uploads/a.txt');
    expect(head.size).toBe(2);
    expect(head.contentType).toBe('text/plain');
    expect(head.metadata?.owner).toBe('alice');
  });

  it('head for a missing object -> NOT_FOUND', async () => {
    const bucket = makeFakeBucket();
    const adapter = createR2Adapter(bucket, 'https://cdn.example.com');
    await expect(adapter.head('missing-key')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('exists reflects object presence', async () => {
    const bucket = makeFakeBucket();
    const adapter = createR2Adapter(bucket, 'https://cdn.example.com');
    await adapter.put('uploads/a.txt', new Blob(['hi']), {
      contentType: 'text/plain',
      visibility: 'public',
    });
    await expect(adapter.exists('uploads/a.txt')).resolves.toBe(true);
    await expect(adapter.exists('missing-key')).resolves.toBe(false);
  });
});
