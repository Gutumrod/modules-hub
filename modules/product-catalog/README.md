# product-catalog — A Multi-Tenant Product Catalog Core You Copy Into Your Own Project

A product catalog core you copy into your own project and own outright. You build one
configuration object, hand it a data repository adapter and a media storage adapter, and every
catalog operation goes through one service: input validation, SKU normalisation, slug generation,
tenant/catalog scoping, pagination, image handling, structured audit events, structured log
entries — or a structured `ProductCatalogError` you branch on by code.

It is a reusable embedded module, not a service and not a framework. It never reads your
environment: every path, URL and sink is injected by you. The two adapters that ship with it in
this version store their data in local CSV files and on the local filesystem, so the module runs
where Node.js can read and write files.

Version 0.1.0. Public entry point: `index.ts`.

## install — Install (copy-and-own, 3 steps)

1. Copy the whole module directory into your project — copy `product-catalog/` into, for example,
   `src/modules/product-catalog/`. Copy it whole: `index.ts`, `core/`, `adapters/`, `examples/`,
   `tests/`, `package.json`, `package-lock.json` and `tsconfig.json` belong together. There is no
   published package for this module, so there is nothing to install from a registry; the copy
   *is* the dependency.
2. Optional, and only if you want to run the module's own tests and example inside the copy: run
   `npm ci` in the copied directory. Your application needs none of that tooling.
3. Import the module through the entry point of your copy, never through another repository's
   path:

   ```ts
   import { createProductCatalogService } from './modules/product-catalog/index.js';
   ```

Keep the copy under your own version control. It is yours to edit, extend and rename.

## quickstart — Quickstart (first successful call)

From a copied module directory to a first successful call. Both adapters need a directory you own,
and the module reads no environment, so the shortest path is to build the two adapters, build one
configuration object, and make one call:

```ts
// Path points at your copy, not at a shared repository.
import os from 'node:os';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import {
  createProductCatalogService,
  createCsvProductRepository,
  createLocalMediaStorage,
  ProductCatalogError,
} from './modules/product-catalog/index.js';

// 1. Two adapters. The directories are yours — the module never reads env for them.
const dataRepository = createCsvProductRepository({
  dataDirectory: await mkdtemp(path.join(os.tmpdir(), 'catalog-data-')),
});
const mediaStorage = createLocalMediaStorage({
  baseUploadDir: await mkdtemp(path.join(os.tmpdir(), 'catalog-media-')),
  publicBaseUrl: 'https://static.example.test',
});

// 2. One configuration object. logger and auditSink are optional; both adapters are required.
const service = createProductCatalogService({
  dataRepository,
  mediaStorage,
  defaults: { pageSize: 20, maxPageSize: 100 },
});

// 3. One call. The context scopes every read and write to one tenant + catalog.
const ctx = { tenantId: 'tenant-a', catalogId: 'main' };

try {
  const product = await service.createProduct(ctx, {
    sku: 'PHONE-001',
    name: 'Acme Phone X',
    price: 25999,
    stockQuantity: 50,
  });
  console.log(product.id, product.slug, product.status);
} catch (err) {
  // Every failure path throws ProductCatalogError — never an error object in the return value.
  if (err instanceof ProductCatalogError) console.error(err.code);
}
```

Run the bundled, self-contained example with this exact command, from the module directory:

    npm run example

## example — Runnable Example

One command, no arguments, no network, no credentials, no configuration:

    npm run example

It runs `examples/run.ts` through `vite-node`. The example drives the module's real adapters — the
CSV repository and the local media storage — against throwaway directories it creates under the
operating system temp directory and removes again, so the production code paths run end to end
with no server. The last line it prints starts with `EXAMPLE_RESULT: OK` and reports only values
that run actually measured. Observed output of the last verified run:

    brand slug=acme-electronics categories=2 child parentLinked=true
    product slug=acme-phone-x status=active attributes=2
    slugCollisionSuffix=acme-phone-x-1 thirdStatus=draft thirdIsActive=true thirdIsFeatured=false
    lookupBySku matched=true normalizedSku=PHONE-001 lookupBySlug matched=true
    requestedLimit=1000 appliedLimit=100 total=3 page2 items=1 totalPages=2 hasPrev=true hasNext=false
    search "Acme" + status=active total=1
    otherTenant total=0 crossTenantRead=PRODUCT_NOT_FOUND
    duplicateSku=DUPLICATE_SKU invalidProductData=INVALID_PRODUCT_DATA
    variant variants=1 duplicateVariantSku=DUPLICATE_SKU
    image isPrimary=true publicUrlUnderBase=true mimeMismatch=MEDIA_UPLOAD_FAILED unsupportedMime=INVALID_PRODUCT_DATA
    reorderMismatch=INVALID_PRODUCT_DATA unknownImage=PRODUCT_NOT_FOUND pathTraversal=STORAGE_ERROR
    archive status=archived archivedAtSet=true restore status=active archivedAtCleared=true
    afterDelete total=2 afterCascadeDelete total=1
    logEntries=30 failureLogEntries=8 auditEvents=11 distinctAuditEventTypes=7
    loggedFailureCodes=PRODUCT_NOT_FOUND+DUPLICATE_SKU+INVALID_PRODUCT_DATA+MEDIA_UPLOAD_FAILED
    EXAMPLE_RESULT: OK productsCreated=3 productsAfterCascadeDelete=1 brandSlug=acme-electronics categories=2 productSlug=acme-phone-x productStatus=active slugCollisionSuffix=acme-phone-x-1 appliedLimitFrom1000=100 searchHits=1 otherTenantTotal=0 variants=1 variantSku=PHONE-001-BLK-256 imageIsPrimary=true archiveStatus=archived restoreStatus=active logEntries=30 failureLogEntries=8 auditEvents=11 distinctAuditEventTypes=7 checkedErrorCodes=9 codesAsExpected=true

Read the detail lines with the summary: three products are created and the third keeps every
default, so its status comes back as `draft`; a second product with the same name gets the
collision suffix `-1` instead of a duplicate slug; an SKU typed in lower case is normalised before
the lookup and still matches; a requested page limit of `1000` is clamped to the configured
`maxPageSize` of `100`; search matches on name, SKU, description, brand name and category name; a
second tenant sees `0` products and cannot read the first tenant's product; the duplicate-SKU,
invalid-data, unsupported-MIME, MIME-mismatch, image-reorder-mismatch, unknown-image and
path-traversal paths each throw their documented code; archiving sets the status and the timestamp
and restoring clears both; deleting a product cascades to its variants and images; and the two
optional sinks receive the log entries and audit events the service emitted.

## limitations — Limitations (read this first)

- **The CSV adapter must not be used in multi-process or horizontally scaled deployments.**
  `adapters/data/csv/file-lock.ts` serialises writes through a single-process lock file created
  with the `'wx'` flag, and `adapters/data/csv/csv-product.repository.ts` reads the entire table
  into memory on every query. Multiple processes sharing one data directory can contend for the
  lock, and a large catalog is loaded in full per query. It is suitable for small-to-medium
  catalogs, local development, single-process applications and staging — not for multi-instance
  production, high write throughput or very large catalogs.
- **The module needs a filesystem, so it cannot run on an edge or Worker runtime as shipped.**
  `adapters/data/csv/csv-product.repository.ts`, `adapters/data/csv/file-lock.ts` and
  `adapters/media/local/local-media.storage.ts` all import `node:fs`, and the local media adapter
  imports `node:crypto` and `node:path`. Cloudflare Workers, Deno Deploy and other runtimes
  without a Node filesystem cannot run these two adapters. The `core/` layer itself is free of
  `node:` imports, and the module depends on the `ProductRepository` and `MediaStorage`
  interfaces, so a host can supply database- and object-storage-backed adapters instead — the
  module ships no such adapter yet.
- **`config.logger` is optional, so a wiring mistake can look like silence.** When `logger` is
  omitted no log entries are emitted at all, and when `auditSink` is omitted no audit events are
  recorded. Both are opt-in by design; nothing warns you that they are missing.
- **Images are stored under a generated key, not under the file name you pass.** `uploadProductImage`
  accepts `fileName` for metadata only. The stored path is
  `uploads/products/{productId}/{uuid}.{ext}`, the original name is sanitised and kept as
  metadata, and the adapter never trusts the declared `mimeType`: it detects the type from the raw
  bytes and rejects a mismatch.
- **`listCategories` is not paginated.** `listProducts`, `searchProducts` and `listBrands` return a
  `PaginatedResult`, but `listCategories` returns a plain `Category[]` sorted by `sortOrder` then
  name. There is no page or limit option on categories.
- **Reordering images is all-or-nothing.** `reorderProductImages` throws `INVALID_PRODUCT_DATA`
  unless the id list contains every image of the product exactly once, so a partial reorder is
  rejected outright rather than applied in part.
- **No authentication, no pricing engine, no search index, no import/export.** The module scopes
  data by the `tenantId` + `catalogId` you pass in, but it does not authenticate anyone and does
  not decide what a caller is allowed to do. Order management, pricing rules, search-index
  synchronisation and bulk import/export belong to the host or to other modules.

## api — Public API

Every export below comes from the module entry point `index.ts`. Do not import from sub-files.

Runtime exports:

- `createProductCatalogService` — `createProductCatalogService(config: ProductCatalogConfig): ProductCatalogService`;
  returns the service bound to the adapters and sinks you inject, and throws
  `CONFIGURATION_ERROR` immediately when `dataRepository` or `mediaStorage` is missing.
- `createCsvProductRepository` — `createCsvProductRepository(options: CsvProductRepositoryOptions): ProductRepository`;
  the CSV data adapter. Takes a required `dataDirectory` and an optional `lockTimeoutMs`
  (default `3000`), creates the directory and the five CSV files on first use.
- `createLocalMediaStorage` — `createLocalMediaStorage(options: LocalMediaStorageOptions): MediaStorage`;
  the local-disk media adapter. Takes a required `baseUploadDir` and `publicBaseUrl` plus an
  optional `maxFileSizeByte` (default `5242880`).
- `ProductCatalogError` — the structured error class every failure path throws, carrying `code`
  (a `ProductCatalogErrorCode`), `details` and `cause`.

Types re-exported from the entry point (no runtime value):

- `ProductCatalogService` — the service interface: 30 methods across products, variants, brands,
  categories and images, each taking a `CatalogContext` first.
- `ProductCatalogConfig` — the injected configuration: `dataRepository`, `mediaStorage`, optional
  `logger`, `auditSink`, `defaults.currency`, `defaults.pageSize`, `defaults.maxPageSize`.
- `CatalogContext` — `{ tenantId, catalogId, actor? }`; scopes every read and write.
- `Product`, `Variant`, `Brand`, `Category`, `ProductImage` — the stored domain records.
- `ProductStatus` — `'draft' | 'active' | 'inactive' | 'archived'`.
- `AttributeValue`, `CustomAttributeMap` — the typed custom-attribute union stored on products and
  variants.
- `CreateProductInput`, `UpdateProductInput`, `CreateVariantInput`, `UpdateVariantInput`,
  `CreateBrandInput`, `UpdateBrandInput`, `CreateCategoryInput`, `UpdateCategoryInput`,
  `UploadProductImageInput` — the per-operation inputs.
- `ProductQuery`, `BrandQuery`, `CategoryQuery`, `SortField`, `SortOrder`, `PaginatedResult` — the
  query and result shapes.
- `ProductRepository`, `MediaStorage` — the two adapter interfaces core depends on.
- `CsvProductRepositoryOptions`, `LocalMediaStorageOptions` — the adapter option types.
- `StructuredLogger`, `LogEntry`, `LogLevel`, `AuditSink`, `AuditEvent`, `AuditEventType` — the
  optional observability contracts.
- `UploadMediaInput`, `MediaStorageOutput`, `MediaMetadata` — the media adapter's I/O types.
- `ProductCatalogErrorCode` — the closed union of error codes on `ProductCatalogError`, and the
  codes you branch on: `PRODUCT_NOT_FOUND`, `DUPLICATE_SKU`, `INVALID_PRODUCT_DATA`,
  `INVALID_VARIANT`, `INVALID_CATEGORY`, `STORAGE_ERROR`, `MEDIA_UPLOAD_FAILED`,
  `MEDIA_DELETE_FAILED`, `CSV_LOCKED`, `CSV_CORRUPTED`, `PROVIDER_UNAVAILABLE`,
  `CONFIGURATION_ERROR`.

## tests — Tests

Run the suite from the module directory:

    npm test

Observed in this packaging round (2026-09-27), `npm test` exited 0 and reported:

- 226 tests passed, 0 failed, across 10 test files.
- 213 tests across the 9 pre-existing files are the existing suite. Those files are unchanged —
  no test removed, skipped or weakened.
- 13 new tests in `tests/docs-contract.test.ts` guard the customer documentation contract, and that
  file is the only test file added in this round.
- `npm test` maps to `vitest run`. `npm run test:contract` runs only `tests/contract`.
- `tests/docs-contract.test.ts` reads `README.md`, `README.th.md`, `MODULE.md`, `package.json`,
  `index.ts`, `core/errors.ts` and `examples/run.ts` from disk. Deleting a required README section,
  breaking the copy-and-own install rule, documenting an export the entry point does not have,
  quoting a test count `MODULE.md` does not state, documenting an error code the module does not
  define, or dropping the example marker all fail it.
- `npm run typecheck` maps to `tsc --noEmit` over `**/*.ts` (examples and tests included) and
  exits 0.

## strengths — Strengths

- **No runtime dependencies.** `package.json` declares no `dependencies` field, so nothing beyond
  the module source itself is pulled into your application. Only development tooling
  (`typescript`, `vitest`, `@vitest/coverage-v8`, `vite-node`) is declared, and only for running
  the tests and the example.
- **Every failure path throws a structured error you branch on.** `core/errors.ts` defines one
  closed union of twelve codes and `ProductCatalogError` carries `code`, `details` and `cause`.
  `core/service.ts` maps any non-domain error to `PROVIDER_UNAVAILABLE` rather than letting it
  escape raw, and the repository's `get*` methods return `null` instead of throwing so the
  service layer decides the code. The example checks nine of those codes against the ones it
  really caught.
- **Writes are crash-safe and locked.** `adapters/data/csv/csv-product.repository.ts` writes through
  a temporary file, `fsync`s it, renames it over the target and keeps the previous file as `.bak`;
  `adapters/data/csv/file-lock.ts` guards each table with a `'wx'` lock file and polls up to
  `lockTimeoutMs` before throwing `CSV_LOCKED`.
- **Tenant isolation is enforced in the adapter, not just documented.** `sameScope()` in
  `adapters/data/csv/csv-product.repository.ts` filters every read and every mutation by
  `tenant_id` + `catalog_id`, so a record of another tenant is invisible and unmutable rather than
  merely hidden at the service layer. The example proves it with a second tenant context.
- **Path traversal is refused before any file I/O.** `core/utils/sanitize.ts` normalises storage
  keys and `assertSafePath` rejects any resolved path that leaves `baseUploadDir`, throwing
  `STORAGE_ERROR: 'Path traversal detected'`. `adapters/media/local/local-media.storage.ts`
  applies it to every key. The example exercises the rejection.
- **Uploads are validated by content, not by claim.** The local media adapter detects the MIME type
  from the raw bytes (JPEG, PNG and WEBP signatures), rejects a buffer whose detected type differs
  from the declared `mimeType` with `MEDIA_UPLOAD_FAILED`, rejects any type outside the allowlist
  with `INVALID_PRODUCT_DATA`, and checks the byte length against `maxFileSizeByte` first.
- **Deterministic, self-contained tests.** The 226 tests use the real CSV and local-media adapters
  against temp directories and need no network, no database and no credentials. Coverage of
  `core/**` is configured in `vitest.config.ts` with thresholds of 90% lines/functions/statements
  and 85% branches.
- **Full source, not a black box.** You copy the whole module — core, validators, both adapters,
  the tests and a commented integration example in `examples/integration.example.ts` — and can read
  or change every line.

## runtime — Runtime Requirements

- **Runtime dependencies: none.** `package.json` has no `dependencies` field, so the shipped source
  needs no third-party runtime package at all.
- **Node builtins used by the shipped source:** `node:fs` (the CSV repository, the file lock and
  the local media adapter), `node:crypto` (the CSV repository and the local media adapter),
  `node:path` (both adapters). `examples/run.ts` and the tests additionally use `node:os` and
  `node:fs/promises`. The `core/` layer and `index.ts` import no `node:*` module at all.
- **No environment access by design.** The module never reads `process.env`, `env` or
  `globalThis.process`. All configuration is supplied explicitly through `ProductCatalogConfig`
  and the adapter option objects.
- **Where it runs:** any Node.js 18-or-newer runtime that can read and write files — a server, a
  container, a CI job, a local script. The source is plain ES2022 with `.js` specifiers on relative
  imports and type-checks under `moduleResolution: Bundler`, and the module compiles and imports as
  plain Node ESM after `tsc` emit.
- **Where it cannot run as shipped:** an edge or Worker runtime with no Node filesystem
  (Cloudflare Workers, Deno Deploy, browser bundles) cannot run the two adapters included in this
  version, because they use `node:fs`. A host that needs those runtimes has to implement the
  `ProductRepository` and `MediaStorage` interfaces against its own storage — `core/` itself is
  free of `node:` imports and ready for that.
- **Where it does not apply:** authentication, authorisation, order management, pricing engines,
  search-index synchronisation and bulk import/export. The module scopes data by the context you
  pass in and stores what you give it; it decides none of those policies.
- **Where the example runs:** `npm run example` uses `vite-node`, a development-only tool. It needs
  the module's development dependencies installed and is not part of your application bundle.

For the full contract — every method signature, configuration default, error code, security
measure and adapter behaviour — see `MODULE.md` and `DESIGN.md` in the copied directory.
