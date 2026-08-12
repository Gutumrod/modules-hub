# File Storage Module

**Version:** 0.1.0 (P0, experimental)
**Status:** Reusable embedded module — core + R2 adapter implemented, docs stage.

## Architecture

This module is a **reusable embedded module** — not a standalone service or framework.
A Host project that needs validated, provider-agnostic file storage embeds this module
into its own codebase and calls the public API from its own code.

The module has one job: accept a `FileStorageConfig` that the Host constructs → validate
the file → generate a safe, module-controlled object key → delegate I/O to the injected
`StorageAdapter` → return a typed result object. It never throws on file-level failures;
it returns `{ success: false, error }` instead.

The module **never** reads env (`process.env` / `env` / `globalThis`). The Host reads its
own env and injects the adapter + config via `createFileStorage(config)`.

### Host vs. module responsibilities

| Host must do | Module does |
|---|---|
| Read env / secrets (R2 binding, public base URL, limits) | Accept config through `createFileStorage(config)` |
| Construct `StorageAdapter` via `createR2Adapter(binding, baseUrl)` | Validate config at construction time — throws `CONFIG_INVALID` if malformed |
| Build `FileStorageConfig` and call `createFileStorage` | Validate each upload (size, MIME, filename, path) |
| Call `storage.upload / delete / getUrl / getMetadata / exists` | Generate a safe, UUID-based object key — never uses the user filename as a path segment |
| Handle `{ success: false, error }` results in its own response layer | Delegate read/write I/O to the injected `StorageAdapter` |

## Public API

All exports come from `./core` (barrel). Do not import from sub-files directly.

```ts
import { createFileStorage, type FileStorageClient } from './core';
import { createR2Adapter } from './adapters/r2';
```

### `createFileStorage(config: FileStorageConfig): FileStorageClient`

Validates the config at construction time. Throws `StorageError` with code `CONFIG_INVALID`
if any field is malformed. On success returns a `FileStorageClient` bound to the given config.

**Config validation rules (all checked synchronously at construction):**
- `adapter` must be present.
- `bucket` must be a non-empty string.
- `defaultVisibility` must be `'public'` or `'private'`.
- `maxFileSize` must be a positive integer.
- `allowedMimeTypes` must be an array (can be empty; empty means no MIME restriction).
- Each string in `allowedMimeTypes` must be a valid MIME type (`type/subtype` format).
- `keyPrefix`, if present, must not contain path-traversal sequences.

### `FileStorageClient` methods

All methods are async and **never throw** on file-level or provider-level failures — they
return a typed result object with `success: boolean` and an optional `error: StorageError`.

#### `upload(request: UploadRequest): Promise<UploadResult>`

Validate → generate key → `adapter.put` → return result.

On **validation failure** returns `{ success: false, error }` (does NOT throw).
On **adapter failure** returns `{ success: false, error: { code: 'UPLOAD_FAILED' | 'PROVIDER_ERROR' } }`.
On **success** returns `{ success: true, key, url, size, contentType }`.

Object keys are **always module-generated**: `{keyPrefix?}/{directory?}/{year}/{month}/{uuid}.{ext}`.
The user-supplied `filename` is **never** used as a path segment. The extension is lowercased
and sanitized; a filename with no extension omits the `.ext` suffix. UUID is generated via
Web Crypto `crypto.randomUUID()`.

#### `delete(key: string): Promise<DeleteResult>`

Idempotent — deleting a missing key returns `{ success: true }`.
Adapter failure returns `{ success: false, error: { code: 'DELETE_FAILED' } }`.

#### `getUrl(key: string, options?: GetUrlOptions): Promise<GetUrlResult>`

- Public object → stable public URL built from `config.publicBaseUrl + key`, or `adapter.getPublicUrl(key)`.
- Private object → `adapter.getSignedUrl(key)` if the adapter supports it; otherwise `{ success: false, error: { code: 'PRIVATE_ACCESS' } }`.
- `options.public = true` forces public URL resolution for that call regardless of the object's stored visibility.

#### `getMetadata(key: string): Promise<GetMetadataResult>`

Missing key → `{ success: false, error: { code: 'NOT_FOUND' } }`.
Returns `FileMetadata` with `visibility` resolved from stored metadata, falling back to `config.defaultVisibility`.

#### `exists(key: string): Promise<ExistsResult>`

Present → `{ success: true, exists: true }`.
Absent → `{ success: true, exists: false }`.
Provider failure → `{ success: false, exists: false, error: { code: 'PROVIDER_ERROR' } }`.

## Config contract

### `FileStorageConfig`

```ts
interface FileStorageConfig {
  adapter: StorageAdapter;               // required — injected by Host
  bucket: string;                        // required, non-empty
  defaultVisibility: 'public' | 'private'; // required
  maxFileSize: number;                   // required, positive integer (bytes)
  allowedMimeTypes: readonly string[];   // required array; empty = no MIME restriction
  publicBaseUrl?: string;                // base URL for public object links
  keyPrefix?: string;                    // safe prefix prepended to generated keys
}
```

| Field | Required | Validation rule |
|---|---|---|
| `adapter` | yes | must be present |
| `bucket` | yes | non-empty string |
| `defaultVisibility` | yes | `'public'` or `'private'` |
| `maxFileSize` | yes | positive integer |
| `allowedMimeTypes` | yes | array; each entry must be a valid `type/subtype` MIME string |
| `publicBaseUrl` | no | any string; required for public URL generation with R2 adapter |
| `keyPrefix` | no | must not contain `..`, absolute path separators, or other traversal sequences |

### `UploadRequest`

```ts
interface UploadRequest {
  file: Blob | ArrayBuffer;
  filename: string;
  contentType: string;
  directory?: string;
  metadata?: Record<string, string>;
  visibility?: 'public' | 'private';
}
```

- `visibility` overrides `config.defaultVisibility` for this object only.
- `directory` is used as a safe subdirectory segment in the generated key; path traversal is rejected.
- `metadata` is stored alongside the object and returned in `FileMetadata`.

### `StorageAdapter` (interface for custom adapters)

```ts
interface StorageAdapter {
  put(key: string, data: Blob | ArrayBuffer, options: PutOptions): Promise<PutResult>;
  delete(key: string): Promise<void>;
  getPublicUrl(key: string): Promise<string>;
  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string>;
  head(key: string): Promise<HeadResult>;
  exists(key: string): Promise<boolean>;
}
```

The module ships the `R2Adapter` (see below). Custom adapters must implement this interface.

### R2 Adapter — `createR2Adapter`

```ts
import { createR2Adapter } from './adapters/r2';

const adapter = createR2Adapter(env.R2_BUCKET, env.R2_PUBLIC_BASE_URL);
```

| Behaviour | Detail |
|---|---|
| `getPublicUrl` | Requires `publicBaseUrl`; throws `PRIVATE_ACCESS` if omitted |
| `getSignedUrl` | Not supported in v0.1 — always throws `PRIVATE_ACCESS` |
| `delete` | Idempotent; missing key is a no-op (not an error) |

## Error codes

All errors surface as `StorageError`:

```ts
interface StorageError {
  code: StorageErrorCode;
  message: string;  // human-readable; MUST NOT contain secrets, credentials, or signed URLs
  cause?: unknown;  // internal only; never serialized to the Host
}
```

| Code | When it occurs |
|---|---|
| `INVALID_MIME` | `contentType` not in `allowedMimeTypes` (when allowlist is non-empty), or extension maps to a known MIME that doesn't match `contentType` (spoofed extension) |
| `FILE_TOO_LARGE` | File size exceeds `config.maxFileSize` |
| `EMPTY_FILE` | File has zero bytes |
| `INVALID_FILENAME` | Filename is empty, contains path separators, is `.` or `..`, is a hidden file, or matches a reserved Windows name (`CON`, `PRN`, `AUX`, `NUL`, `COM1`–`COM9`, `LPT1`–`LPT9`) or contains control characters |
| `INVALID_PATH` | `directory` contains path traversal sequences or other unsafe segments |
| `CONFIG_INVALID` | `createFileStorage` called with a malformed `FileStorageConfig` |
| `UPLOAD_FAILED` | Adapter `put` returned an error |
| `DELETE_FAILED` | Adapter `delete` returned an error (missing key is NOT a failure) |
| `NOT_FOUND` | `getMetadata` called for a key that does not exist in the adapter |
| `PRIVATE_ACCESS` | `getUrl` attempted to fetch a signed or public URL for a private object when the adapter does not support it |
| `PROVIDER_ERROR` | Unclassified adapter/provider failure (surfaced by `exists` or other methods) |

## Security

1. **Path traversal prevention.** Object keys are always module-generated. User-supplied
   `filename`, `directory`, and `keyPrefix` are validated and sanitized; traversal sequences
   (`../`, absolute separators, hidden names, reserved names, control chars) are rejected
   before any key is constructed.

2. **No env access.** The module never references `process.env`, `env`, or `globalThis`.
   All config enters through `createFileStorage(config)`. This makes the module safe to
   embed in any runtime (Cloudflare Workers, Node, Bun, Deno) without side-effect risks.

3. **No secret leak.** `StorageError.message` must never contain credentials, signed URLs,
   or internal state. `cause` is internal only and must not be serialized or forwarded to
   the Host's response layer.

4. **Public/private visibility.** Each object carries visibility metadata. Private objects
   cannot be accessed via public URLs; the module enforces this at the `getUrl` level and
   returns `PRIVATE_ACCESS` when the adapter cannot produce a signed URL.

5. **No `node:*` imports.** The module uses Web Crypto (`crypto.randomUUID()`) only —
   no `node:crypto`, `node:fs`, or other Node-specific APIs. Runs on Cloudflare Workers.

6. **No mutation of Host input.** `createFileStorage` does not mutate the `config` object
   passed in. Upload requests are consumed (file data read), not stored or mutated.

## How to integrate

### Steps

1. Copy the module folder into your repo.
2. In your wrangler.toml, declare an `[[r2_buckets]]` binding (e.g. `R2_BUCKET`).
3. Import `createR2Adapter` and `createFileStorage` from the module.
4. In your Worker `fetch` handler, construct the adapter from your **own** env:
   ```ts
   const adapter = createR2Adapter(env.R2_BUCKET, env.R2_PUBLIC_BASE_URL);
   ```
5. Build a `FileStorageConfig` and call `createFileStorage`. Wrap in try/catch to handle
   `CONFIG_INVALID` at startup:
   ```ts
   const storage = createFileStorage({
     adapter,
     bucket: 'my-bucket',
     defaultVisibility: 'private',
     maxFileSize: 10 * 1024 * 1024,
     allowedMimeTypes: ['image/jpeg', 'image/png', 'application/pdf'],
     publicBaseUrl: env.R2_PUBLIC_BASE_URL,
     keyPrefix: 'uploads',
   });
   ```
6. Call `storage.upload(...)`, `storage.delete(key)`, `storage.getUrl(key, opts)`,
   `storage.getMetadata(key)`, `storage.exists(key)` as needed.
7. Always check `result.success` before using the result payload.

### Quick reference

```ts
// upload
const up = await storage.upload({ file: buffer, filename: 'photo.jpg', contentType: 'image/jpeg' });
if (up.success) console.log(up.key, up.url, up.size);

// delete (idempotent)
const del = await storage.delete(up.key!);
if (!del.success) console.error(del.error?.code);

// getUrl
const urlResult = await storage.getUrl(key, { public: false });
if (urlResult.success) console.log(urlResult.url);

// getMetadata
const meta = await storage.getMetadata(key);
if (meta.success) console.log(meta.metadata?.size, meta.metadata?.visibility);

// exists
const ex = await storage.exists(key);
if (ex.success) console.log(ex.exists ? 'found' : 'missing');
```

See `integration.example.ts` for the full Cloudflare Worker example.

### Integration checklist

- [ ] Copy the module folder into the target repo
- [ ] Declare the R2 bucket binding in `wrangler.toml` (`[[r2_buckets]]`)
- [ ] Set `R2_PUBLIC_BASE_URL` via `wrangler secret put` (if serving public files)
- [ ] Construct the adapter from your own env: `createR2Adapter(env.R2_BUCKET, env.R2_PUBLIC_BASE_URL)`
- [ ] Validate `config.maxFileSize` and `config.allowedMimeTypes` match your product requirements
- [ ] Wrap `createFileStorage(config)` in try/catch at startup — `CONFIG_INVALID` means a misconfigured deploy
- [ ] Check `result.success` on every method call before accessing the payload
- [ ] Never forward `result.error?.cause` to external callers — it is internal state
- [ ] Run `npm run typecheck` before deploy
- [ ] Smoke-test upload → getMetadata → exists → delete after first deploy

## Versioning

Standard semver — bump the version in `VERSION` on every change. No CHANGELOG or migration
guide until the module has been embedded in ≥ 2 real projects and the contract has stabilized.

## Promote to shared package when

The module has been embedded in ≥ 2–3 projects without changes to `core/` contract
(only config/adapter changes on the Host side) — then extract to an npm package.
