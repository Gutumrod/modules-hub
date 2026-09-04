# File Storage Module — DESIGN.md

**Version:** 0.1.0
**Status:** ✅ Completed
**Documentation Authority:** Current version/status follow `../REGISTRY.md`; this document describes the module contract/design for that registered version.

**Language / runtime:** TypeScript, ES2022, strict mode, `moduleResolution: Bundler`. Must run on Cloudflare Workers (no `node:*` imports; Web Crypto API only if crypto is needed).

---

## 1. Purpose

A reusable **File Storage module** that abstracts file management so a Host Project uses one API without being tied to a storage provider. It defines a single pipeline:

```
Host → FileStorageCore → StorageAdapter (Cloudflare R2 for v0.1)
```

The module **must NOT read global env itself**. The Host reads env and injects config via the public API. The module has **no business-specific logic** (no booking/ticket/shop/order).

### Host responsibilities vs module responsibilities

| Host does | Module does |
|---|---|
| Reads `process.env` / `env` / `globalThis` | Never touches env — receives config as an argument |
| Reads bucket name, credentials, public/private default from its own env | Receives a fully-formed `FileStorageConfig` object |
| Constructs the `StorageAdapter` (e.g. R2) and passes it in | Talks only to the `StorageAdapter` interface — never to R2 specifics |
| Calls `createFileStorage(config)` | Returns a `FileStorageClient` with the 5 public methods |
| Decides whether a given upload is public or private | Enforces the `public`/`private` concept per the config default + per-request override |

---

## 2. Public API (exact signatures)

All methods are async. All are exposed on the `FileStorageClient` returned by `createFileStorage(config)`, exported from the module's public entry point (`core/index.ts`).

```ts
// core/storage.ts
export function createFileStorage(config: FileStorageConfig): FileStorageClient;

// FileStorageClient (all methods async)
export interface FileStorageClient {
  upload(request: UploadRequest): Promise<UploadResult>;
  delete(key: string): Promise<DeleteResult>;
  getUrl(key: string, options?: GetUrlOptions): Promise<GetUrlResult>;
  getMetadata(key: string): Promise<GetMetadataResult>;
  exists(key: string): Promise<ExistsResult>;
}
```

### 2.1 `createFileStorage(config)`

- Input: a `FileStorageConfig` (see §4) that the Host built from its own env.
- Returns a `FileStorageClient` bound to the injected adapter and config.
- **Never reads `process.env`, `env`, or `globalThis`.** It only reads the `config` argument.
- Throws a `StorageError` (`CONFIG_INVALID`) at **construction time** if the config is malformed (e.g. missing adapter, missing bucket, invalid maxFileSize). This catches config bugs early, before any upload.

### 2.2 `upload(request)`

- Input: an `UploadRequest` (see §3).
- Pipeline: **validate → generate safe key → write via adapter → return result**.
- Returns an `UploadResult` (see §3). On success `success: true` with `key`, `url`, `size`, `contentType`. On failure `success: false` with a structured `error` (see §6).
- **Never throws** for validation or provider failures — it returns an `UploadResult` with `success: false` and a structured `error`. (The only throw is at construction time for a malformed config.)
- Does **not** mutate the `request` input object.

### 2.3 `delete(key)`

- Input: a string object key.
- Returns a `DeleteResult` (`{ success: boolean; error?: StorageError }`).
- Deleting a non-existent key is **not** an error — it returns `success: true` (idempotent delete). A provider-level failure returns `success: false` with `DELETE_FAILED` / `PROVIDER_ERROR`.

### 2.4 `getUrl(key)`

- Input: a string object key, plus optional `GetUrlOptions` (`{ public?: boolean }`).
- Returns a `GetUrlResult` (`{ success: boolean; url?: string; error?: StorageError }`).
- For a **public** object, returns a stable public URL. For a **private** object, returns a signed/temporary URL if the adapter supports it, otherwise returns `success: false` with `PRIVATE_ACCESS` (see §5.4).
- The `public` option overrides the object's stored visibility for this call only.

### 2.5 `getMetadata(key)`

- Input: a string object key.
- Returns a `GetMetadataResult` (`{ success: boolean; metadata?: FileMetadata; error?: StorageError }`).
- `FileMetadata` includes `key`, `size`, `contentType`, `etag`, `lastModified`, `visibility`, and the user-supplied `metadata` bag (see §3).
- A missing key returns `success: false` with `NOT_FOUND`.

### 2.6 `exists(key)`

- Input: a string object key.
- Returns an `ExistsResult` (`{ success: boolean; exists: boolean; error?: StorageError }`).
- `success: true` + `exists: true` when present; `success: true` + `exists: false` when absent; `success: false` + `error` only on a provider-level failure.

---

## 3. Core contract types (exact)

```ts
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
  lastModified?: string;   // ISO 8601
  visibility: 'public' | 'private';
  metadata?: Record<string, string>;
};
```

### 3.1 `UploadRequest` rules

- `file` is a `Blob` or `ArrayBuffer`. The core reads its size via `file.size` (Blob) or `file.byteLength` (ArrayBuffer). It does **not** assume a Node Buffer.
- `filename` is the original user-supplied filename. It is used **only** for validation and for deriving the extension — it is **never** used as the object key path (see §5.2).
- `contentType` is the MIME type the Host declares. It is validated against the allowlist (see §5.1).
- `directory` is optional. When present it is sanitized and prepended to the generated key (see §5.2).
- `metadata` is an optional free-form bag of user-supplied string metadata, stored alongside the object.
- `visibility` is optional. When absent, the config default (`defaultVisibility`) applies.

---

## 4. `FileStorageConfig` type (exact)

```ts
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
```

### 4.1 Config rules

- `adapter` is **required**. A missing adapter → `CONFIG_INVALID` at construction.
- `bucket` is **required** (non-empty string). Missing → `CONFIG_INVALID`.
- `defaultVisibility` is **required** and must be `'public'` or `'private'`. Anything else → `CONFIG_INVALID`.
- `maxFileSize` is **required** and must be a positive integer. `<= 0` → `CONFIG_INVALID`.
- `allowedMimeTypes` is **required** (may be an empty array to allow all). Each entry must be a valid MIME type string.
- `publicBaseUrl` and `keyPrefix` are optional. `keyPrefix` is sanitized (see §5.2) and prepended to every generated key.

---

## 5. Design decisions (exact — downstream agents implement from this)

### 5.1 Validation (`core/validate.ts`)

Validation runs **before** any adapter write. Order matters — check the cheapest/most fundamental checks first.

| Check | Rule | Error code |
|---|---|---|
| Empty file | `file.size === 0` (Blob) or `file.byteLength === 0` (ArrayBuffer) → reject | `EMPTY_FILE` |
| Max size | `file.size > config.maxFileSize` → reject | `FILE_TOO_LARGE` |
| MIME allowlist | If `allowedMimeTypes` is non-empty and `contentType` is not in it → reject | `INVALID_MIME` |
| Filename present | `filename` must be a non-empty string | `INVALID_FILENAME` |
| Filename sanitization | `filename` must not contain path separators (`/`, `\`), must not be `.` or `..`, must not contain NUL, must not start with `.` (hidden file), must not contain control characters | `INVALID_FILENAME` |
| Dangerous filename | Reject reserved Windows names (`CON`, `PRN`, `AUX`, `NUL`, `COM1`–`COM9`, `LPT1`–`LPT9`) case-insensitively | `INVALID_FILENAME` |
| Spoofed extension | The extension derived from `filename` must be consistent with `contentType` (see below) | `INVALID_MIME` |
| Directory / path | `directory` (if present) must be a safe relative path (see §5.2) | `INVALID_PATH` |

**Spoofed-extension check:** derive the extension from `filename` (the substring after the last `.`). If the extension maps to a known MIME type (via a small built-in map, e.g. `jpg → image/jpeg`, `png → image/png`, `pdf → application/pdf`, `txt → text/plain`, `json → application/json`, `csv → text/csv`, `mp4 → video/mp4`, `webp → image/webp`, `svg → image/svg+xml`, `gif → image/gif`, `zip → application/zip`), and the declared `contentType` does **not** match that mapped type, reject with `INVALID_MIME`. If the extension is unknown, skip the check (do not reject). This prevents a `.exe` renamed to `.jpg` being uploaded as `image/jpeg`.

**MIME allowlist semantics:** the allowlist is matched **exactly** against the declared `contentType` (no wildcards in v0.1). The Host is responsible for declaring an accurate `contentType`; the module validates it against the allowlist and the extension map.

### 5.2 Path generation (`core/path.ts`)

**NEVER use the user filename as the object key path.** The key is always generated by the module.

```
{keyPrefix?}/{directory?}/{year}/{month}/{uuid}.{ext}
```

- `keyPrefix` — from config, sanitized (see below). Optional.
- `directory` — from the request, sanitized (see below). Optional.
- `year` / `month` — from the current UTC date (`getUTCFullYear()`, `getUTCMonth() + 1` zero-padded to 2 digits).
- `uuid` — a random v4 UUID generated with the **Web Crypto API** (`crypto.randomUUID()`). **No `node:crypto`** — must run on Cloudflare Workers.
- `ext` — the **sanitized, lowercased** extension derived from `filename` (after the last `.`). If the filename has no extension, omit the `.ext` suffix.

**Sanitization rules (applied to `keyPrefix` and `directory`):**
1. Reject any segment that is `.` or `..` → `INVALID_PATH`.
2. Reject any segment containing `/`, `\`, NUL, or control characters → `INVALID_PATH`.
3. Reject any segment that is empty (collapse repeated separators).
4. Reject any segment starting with `.` (hidden) → `INVALID_PATH`.
5. Normalize separators to `/` only.
6. The final key must never start with `/` and must never contain `..` as a path segment (path-traversal prevention).

**Path traversal prevention:** the generated key is always a flat, module-controlled path. Because the user filename is never used as a path and `directory` is sanitized against `..` and separators, path traversal is structurally impossible. The adapter must also reject any key containing `..` as a defense-in-depth check.

### 5.3 Security requirements

1. **Path traversal prevention.** User input never becomes a raw path. `directory` is sanitized; `filename` is used only for extension derivation. The generated key is module-controlled. The adapter rejects any key containing `..`.
2. **Dangerous filename.** Reserved names and hidden files are rejected (see §5.1).
3. **Spoofed extension.** The extension↔MIME consistency check rejects renamed executables (see §5.1).
4. **Oversized upload.** `maxFileSize` is enforced before any write. The adapter must also enforce a hard cap as defense-in-depth.
5. **Secret leak.** The module never reads env. Error messages and `UploadResult`/`StorageError` objects must **never** contain credentials, signed URLs, or bucket secrets. `getUrl` for a private object returns a signed URL only via the adapter's sanctioned method — never logs it.
6. **Public URL by accident.** The module does **not** assume all files are public. Visibility is explicit: config `defaultVisibility` + per-request `visibility` override. A private object must never be exposed via a plain public URL. `getUrl` on a private object returns a signed URL (adapter-supported) or `PRIVATE_ACCESS` error.
7. **No mutation of Host input.** `upload` must not mutate the `UploadRequest` object.
8. **No `node:*` imports.** Web Crypto API only (`crypto.randomUUID()`).

### 5.4 `public` / `private` concept

- Every object has a stored `visibility` (`'public'` or `'private'`), determined at upload time by `request.visibility ?? config.defaultVisibility`.
- **Public** objects: `getUrl` returns a stable public URL (built from `config.publicBaseUrl` + key, or the adapter's public URL).
- **Private** objects: `getUrl` returns a signed/temporary URL if the adapter supports it; otherwise `success: false` with `PRIVATE_ACCESS`.
- The `getUrl` `public` option overrides the stored visibility for that single call (e.g. a Host that knows an object is safe to expose publicly can force a public URL).

---

## 6. Structured errors

All errors are instances of `StorageError` with the shape:

```ts
export interface StorageError {
  code: StorageErrorCode;
  message: string;   // human-readable, MUST NOT contain secrets or signed URLs
  cause?: unknown;   // optional underlying provider error (never serialized to the Host)
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
```

### 6.1 Code semantics

| Code | When thrown / returned | Notes |
|---|---|---|
| `INVALID_MIME` | `contentType` not in allowlist, or extension↔MIME mismatch | validation |
| `FILE_TOO_LARGE` | `file.size > config.maxFileSize` | validation |
| `EMPTY_FILE` | `file.size === 0` | validation |
| `INVALID_FILENAME` | filename empty, contains separators, hidden, reserved, or control chars | validation |
| `INVALID_PATH` | `directory` / `keyPrefix` unsafe (traversal, hidden, separators) | validation |
| `CONFIG_INVALID` | `createFileStorage` receives a malformed config | construction-time throw |
| `UPLOAD_FAILED` | adapter write failed | provider |
| `DELETE_FAILED` | adapter delete failed | provider |
| `NOT_FOUND` | object does not exist (getMetadata) | provider |
| `PRIVATE_ACCESS` | `getUrl` on a private object with no signed-URL support | access control |
| `PROVIDER_ERROR` | any other adapter-level failure | provider |

### 6.2 Error safety

- **Error messages must NEVER contain secrets, credentials, or signed URLs.**
- The `StorageError` object must not carry raw credentials. `cause` is for internal debugging only and is never serialized to the Host.
- Validation errors are returned inside `UploadResult.error` (not thrown). Only `CONFIG_INVALID` is thrown (at construction).

---

## 7. `StorageAdapter` interface (exact)

The core talks **only** to this interface. It must never know about R2 specifics (bucket binding, S3 API, etc.).

```ts
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
```

### 7.1 Adapter contract rules

- `put` must reject (throw) if the key contains `..` (defense-in-depth path-traversal check).
- `delete` is idempotent: deleting a missing key resolves normally (no throw).
- `head` throws a `NOT_FOUND`-mapped error when the object is absent.
- `getSignedUrl` throws if the adapter does not support signed URLs (the core maps this to `PRIVATE_ACCESS`).
- The core maps adapter throws to `StorageError` codes (`UPLOAD_FAILED`, `DELETE_FAILED`, `NOT_FOUND`, `PROVIDER_ERROR`). The core never lets a raw adapter error escape to the Host.

---

## 8. File structure (exact)

```
file-storage-module/
├── core/
│   ├── types.ts      ← UploadRequest, UploadResult, DeleteResult, GetUrlResult, GetMetadataResult, ExistsResult, FileMetadata, FileStorageConfig, StorageError, StorageErrorCode, StorageAdapter, PutOptions, PutResult, HeadResult
│   ├── validate.ts   ← file validation (size, MIME, filename, path)
│   ├── path.ts       ← safe object key generation
│   ├── storage.ts    ← FileStorageClient (upload/delete/getUrl/getMetadata/exists) + createFileStorage()
│   └── index.ts      ← public entry point: re-exports all public API + types
├── adapters/
│   └── r2.ts         ← Cloudflare R2 adapter (implements StorageAdapter)
├── tests/
│   ├── validate.test.ts
│   ├── path.test.ts
│   └── storage.test.ts
├── integration.example.ts
├── MODULE.md
├── VERSION           ← 0.1.0
├── package.json
└── tsconfig.json
```

### 8.1 File responsibilities

- **`core/types.ts`** — all shared types only. No logic.
- **`core/validate.ts`** — `validateUpload(request, config)`: the validation pipeline in §5.1. Returns `{ ok: true }` or `{ ok: false, error: StorageError }`.
- **`core/path.ts`** — `generateKey(request, config)`: the safe object-key generation in §5.2. Also exports `sanitizePathSegment()`.
- **`core/storage.ts`** — `createFileStorage(config)` returning a `FileStorageClient` implementing the 5 public methods. Orchestrates validate → generate key → adapter call → map result.
- **`core/index.ts`** — public barrel. Re-exports `createFileStorage`, `FileStorageClient`, and all public types. Downstream code imports from `./core` (or the package root), never from individual files.
- **`adapters/r2.ts`** — the Cloudflare R2 `StorageAdapter` implementation. Uses the R2 binding passed in via config (the Host constructs it from its own env). No env reads here either.
- **`tests/`** — vitest unit tests, one file per core unit (see §9).
- **`integration.example.ts`** — a reference example showing a Host reading its own env, constructing the R2 adapter, and injecting config (see §10). Not copied verbatim into production.
- **`MODULE.md`** — the module's own documentation (mirrors this design; written by the implementer in Stage 2).
- **`VERSION`** — plain text file containing `0.1.0`.
- **`package.json`** — see §11.
- **`tsconfig.json`** — see §11.

---

## 9. Test requirements (for Stage 3 tester)

Vitest unit tests must cover at minimum:

1. **validate.test.ts**
   - Empty file (`size === 0`) → `EMPTY_FILE`.
   - File over `maxFileSize` → `FILE_TOO_LARGE`.
   - `contentType` not in allowlist → `INVALID_MIME`.
   - Filename with `/` or `\` → `INVALID_FILENAME`.
   - Filename `.` or `..` → `INVALID_FILENAME`.
   - Hidden filename (starts with `.`) → `INVALID_FILENAME`.
   - Reserved name (`CON`, `NUL`, `COM1`) → `INVALID_FILENAME`.
   - Spoofed extension: `evil.exe` declared as `image/jpeg` → `INVALID_MIME`; `photo.jpg` declared as `image/jpeg` → ok.
   - Unknown extension + allowlisted MIME → ok (no false reject).
   - `directory` with `..` → `INVALID_PATH`.
   - Valid request passes all checks.
2. **path.test.ts**
   - Generated key matches `{prefix}/{dir}/{year}/{month}/{uuid}.{ext}` shape.
   - User filename is **never** used as a path segment.
   - Extension is lowercased and sanitized.
   - No-extension filename → no `.ext` suffix.
   - `directory` with `..` / separators / hidden → `INVALID_PATH`.
   - Generated key never starts with `/` and never contains `..`.
   - `keyPrefix` is applied and sanitized.
   - UUID is a valid v4 UUID (Web Crypto).
3. **storage.test.ts** (using a fake in-memory adapter)
   - `upload` success returns `success: true` with `key`, `url`, `size`, `contentType`.
   - `upload` validation failure returns `success: false` with the right `error.code` (does not throw).
   - `upload` adapter failure returns `success: false` with `UPLOAD_FAILED` / `PROVIDER_ERROR`.
   - `delete` idempotent: missing key → `success: true`.
   - `delete` adapter failure → `DELETE_FAILED`.
   - `getUrl` public object → public URL.
   - `getUrl` private object with signed-URL adapter → signed URL; without → `PRIVATE_ACCESS`.
   - `getMetadata` missing key → `NOT_FOUND`.
   - `exists` present → `exists: true`; absent → `exists: false`.
   - `createFileStorage` with malformed config → throws `CONFIG_INVALID`.
   - Input `UploadRequest` object is not mutated.
   - Error objects never contain secrets/signed URLs.

---

## 10. `integration.example.ts` (reference shape)

A generic Cloudflare Worker Host example showing the intended usage. It is a **reference only** — not copied verbatim into production.

```ts
import { createFileStorage } from './core';
import { createR2Adapter } from './adapters/r2';

// Host reads its OWN env (module never does)
interface Env {
  R2_BUCKET: R2Bucket;          // Cloudflare R2 binding
  R2_PUBLIC_BASE_URL?: string;
  MAX_FILE_SIZE?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const adapter = createR2Adapter(env.R2_BUCKET);

    const storage = createFileStorage({
      adapter,
      bucket: 'my-bucket',
      defaultVisibility: 'private',
      maxFileSize: Number(env.MAX_FILE_SIZE ?? 10 * 1024 * 1024), // 10 MB
      allowedMimeTypes: ['image/jpeg', 'image/png', 'application/pdf'],
      publicBaseUrl: env.R2_PUBLIC_BASE_URL,
      keyPrefix: 'uploads',
    });

    const form = await request.formData();
    const file = form.get('file') as File;

    const result = await storage.upload({
      file,
      filename: file.name,
      contentType: file.type,
      directory: 'avatars',
      visibility: 'public',
    });

    if (!result.success) {
      return new Response(JSON.stringify({ error: result.error }), { status: 400 });
    }
    return new Response(JSON.stringify({ key: result.key, url: result.url }));
  },
};
```

---

## 11. `package.json` and `tsconfig.json` (copy conventions from config-runtime-module)

### `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "outDir": "dist"
  },
  "include": ["core", "adapters", "tests", "integration.example.ts"]
}
```

### `package.json`

```json
{
  "name": "file-storage-module",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Reusable File Storage module — Host injects config, module validates/generates-safe-keys/abstracts-storage. Copy into target project, not an npm package until contract stabilizes.",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "devDependencies": {
    "typescript": "5.6.3",
    "vitest": "2.1.4"
  }
}
```

---

## 12. Explicit non-goals (do NOT build)

- ❌ No Supabase Storage adapter in v0.1.0 (that is v0.2). Only Cloudflare R2.
- ❌ No env reading of any kind (`process.env` / `env` / `globalThis`).
- ❌ No business-specific logic.
- ❌ No `node:crypto` / `node:*` imports. Web Crypto API only (`crypto.randomUUID()`).
- ❌ No large validation framework (no zod/ajv dependency). Only the small checks in §5.1.
- ❌ No streaming/chunked uploads in v0.1.0 (single-shot `put` only).
- ❌ No multipart upload, no resumable upload, no presigned-upload generation in v0.1.0.
- ❌ No automatic image processing / thumbnails / transcoding.
- ❌ No global file-type sniffing library (magic bytes) in v0.1.0 — MIME is validated against the allowlist + extension map only.
- ❌ No wildcard MIME matching in v0.1.0 (exact match only).

---

## 13. Acceptance criteria (for Stage 4 reviewer)

1. `DESIGN.md` exists at `D:/AI-Workspace/projects/modules-hub/modules/file-storage/DESIGN.md` and matches this spec.
2. Implemented module exposes exactly the 5 public methods in §2 with the exact signatures, via `createFileStorage(config)`.
3. `UploadRequest`, `UploadResult`, `FileStorageConfig`, `StorageError`, and `StorageAdapter` types match §3, §4, §6, and §7 exactly.
4. Validation enforces max size, MIME allowlist, filename sanitization, safe directory, empty-file rejection, and unsupported-type rejection (§5.1).
5. Object keys are always module-generated (`{prefix}/{dir}/{year}/{month}/{uuid}.{ext}`) — user filename is never used as a path (§5.2).
6. Path traversal is structurally prevented; adapter rejects keys containing `..`.
7. Errors are structured `{ code, message }` with the 11 codes in §6 and never leak secrets or signed URLs.
8. The core talks only to the `StorageAdapter` interface — no R2 specifics in `core/`.
9. Module never reads `process.env` / `env` / `globalThis`.
10. `public`/`private` concept is enforced; private objects are never exposed via plain public URLs.
11. `npm run typecheck` and `npm test` pass.
12. No `node:*` imports; runs on Cloudflare Workers.
