/**
 * modules/file-storage/integration.example.ts
 * Generic Cloudflare Worker Host Example — reference only when integrating into a real project.
 * Do NOT copy this file wholesale into production.
 *
 * The File Storage module NEVER reads env itself. The Host reads its own env
 * (R2 bucket binding, public base URL, max file size) and injects the adapter + config
 * via the public API. The module never touches process.env / env / globalThis.
 */

import { createFileStorage, type FileStorageConfig } from './core';
import { createR2Adapter } from './adapters/r2';

// Host declares its OWN env bindings — declared in wrangler.toml.
// R2_BUCKET is the Cloudflare R2 bucket binding; the others are plain vars/secrets.
interface Env {
  R2_BUCKET: R2Bucket;          // wrangler.toml [[r2_buckets]] binding
  R2_PUBLIC_BASE_URL?: string;  // e.g. "https://cdn.example.com" — required for public URLs
  MAX_FILE_SIZE?: string;       // bytes as an integer string; falls back to 10 MB
}

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;

const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // 1. Host reads its OWN env and constructs the StorageAdapter.
    //    createR2Adapter wraps the Cloudflare R2 binding; publicBaseUrl enables public URL
    //    generation. Without it, getPublicUrl throws PRIVATE_ACCESS.
    const adapter = createR2Adapter(env.R2_BUCKET, env.R2_PUBLIC_BASE_URL);

    // 2. Host builds a FileStorageConfig and calls createFileStorage.
    //    createFileStorage validates the config at construction time and throws StorageError
    //    (code: CONFIG_INVALID) for any malformed field — fail fast before handling requests.
    const maxFileSize = env.MAX_FILE_SIZE
      ? parseInt(env.MAX_FILE_SIZE, 10)
      : DEFAULT_MAX_FILE_SIZE;

    const config: FileStorageConfig = {
      adapter,
      bucket: 'my-uploads',
      defaultVisibility: 'private',
      maxFileSize,
      allowedMimeTypes: ALLOWED_MIME_TYPES,
      publicBaseUrl: env.R2_PUBLIC_BASE_URL,
      keyPrefix: 'uploads',
    };

    const storage = createFileStorage(config);

    const url = new URL(request.url);

    // --- upload ---
    // POST /upload  (multipart/form-data, field: "file")
    // The module generates the object key — the user filename is never used as a path segment.
    // Key format: {keyPrefix}/{directory}/{year}/{month}/{uuid}.{ext}
    // On validation failure the method returns { success: false, error } — it does NOT throw.
    if (request.method === 'POST' && url.pathname === '/upload') {
      const formData = await request.formData();
      const file = formData.get('file');
      if (!(file instanceof File)) {
        return new Response('missing file field', { status: 400 });
      }

      const result = await storage.upload({
        file: await file.arrayBuffer(),
        filename: file.name,
        contentType: file.type,
        directory: 'user-uploads',
        visibility: 'private',
      });

      if (!result.success) {
        const status =
          result.error?.code === 'FILE_TOO_LARGE' || result.error?.code === 'INVALID_MIME'
            ? 422
            : 500;
        return Response.json(
          { error: result.error?.code, message: result.error?.message },
          { status },
        );
      }

      return Response.json({
        key: result.key,
        size: result.size,
        contentType: result.contentType,
      });
    }

    // --- getUrl ---
    // GET /url/:key
    // Public objects return a stable URL built from publicBaseUrl + key.
    // Private objects use adapter.getSignedUrl; the R2 adapter in v0.1 does NOT support
    // signed URLs — it returns PRIVATE_ACCESS instead.
    if (request.method === 'GET' && url.pathname.startsWith('/url/')) {
      const key = decodeURIComponent(url.pathname.slice('/url/'.length));
      const isPublic = url.searchParams.get('public') === 'true';

      const result = await storage.getUrl(key, { public: isPublic });

      if (!result.success) {
        const status =
          result.error?.code === 'NOT_FOUND'
            ? 404
            : result.error?.code === 'PRIVATE_ACCESS'
              ? 403
              : 500;
        return Response.json({ error: result.error?.code }, { status });
      }

      return Response.json({ url: result.url });
    }

    // --- getMetadata ---
    // GET /metadata/:key
    // Returns FileMetadata for the object. Missing key → NOT_FOUND (404).
    // Visibility is resolved from stored metadata, falling back to config.defaultVisibility.
    if (request.method === 'GET' && url.pathname.startsWith('/metadata/')) {
      const key = decodeURIComponent(url.pathname.slice('/metadata/'.length));
      const result = await storage.getMetadata(key);

      if (!result.success) {
        const status = result.error?.code === 'NOT_FOUND' ? 404 : 500;
        return Response.json({ error: result.error?.code }, { status });
      }

      return Response.json(result.metadata);
    }

    // --- exists ---
    // HEAD /file/:key
    // Returns 200 if the object exists, 404 if absent, 500 on provider failure.
    // exists() never throws — provider failure surfaces as { success: false, exists: false }.
    if (request.method === 'HEAD' && url.pathname.startsWith('/file/')) {
      const key = decodeURIComponent(url.pathname.slice('/file/'.length));
      const result = await storage.exists(key);

      if (!result.success) {
        return new Response(null, { status: 500 });
      }

      return new Response(null, { status: result.exists ? 200 : 404 });
    }

    // --- delete ---
    // DELETE /file/:key
    // Idempotent: deleting a missing key returns { success: true }.
    // Adapter failure returns { success: false, error: DELETE_FAILED }.
    if (request.method === 'DELETE' && url.pathname.startsWith('/file/')) {
      const key = decodeURIComponent(url.pathname.slice('/file/'.length));
      const result = await storage.delete(key);

      if (!result.success) {
        return Response.json({ error: result.error?.code }, { status: 500 });
      }

      return new Response(null, { status: 204 });
    }

    return new Response('not found', { status: 404 });
  },
};
