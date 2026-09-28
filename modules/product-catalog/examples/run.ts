/**
 * Single-command runnable example for the Product Catalog module.
 *
 * Run it with:  npm run example
 *
 * Self-contained and offline: it opens no network connection, reads no environment variable, uses
 * no credential, and writes only inside two throwaway directories created under the operating
 * system's temp directory, which are removed again before it exits.
 *
 * It drives the module's real adapters — the CSV repository and the local media storage — through
 * the public service interface, so the production code paths run end to end: SKU validation and
 * normalisation, auto slug generation with collision suffixes, custom-attribute validation,
 * duplicate-SKU rejection, tenant/catalog scoping, pagination clamping, archiving and restoring,
 * magic-byte MIME detection, path-traversal rejection, structured audit events and structured log
 * entries.
 *
 * The last line printed starts with `EXAMPLE_RESULT: OK` and reports only values this run
 * actually observed.
 */

import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';

import {
  createCsvProductRepository,
  createLocalMediaStorage,
  createProductCatalogService,
  ProductCatalogError,
} from '../index.js';
import type { AuditEvent, CatalogContext, LogEntry } from '../index.js';

/**
 * A 1x1 PNG header. The media adapter detects the MIME type from the raw bytes instead of
 * trusting the declared `mimeType`, and this prefix is what makes it decide `image/png`.
 */
const PNG_1X1 = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01,
]);

/** Runs a call that is expected to fail and returns the error code it produced. */
async function catchCode(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
    return 'NO_ERROR_THROWN';
  } catch (error) {
    if (error instanceof ProductCatalogError) {
      return error.code;
    }
    return `UNEXPECTED_ERROR:${String(error)}`;
  }
}

async function main(): Promise<void> {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'pc-example-data-'));
  const mediaDir = await mkdtemp(path.join(os.tmpdir(), 'pc-example-media-'));

  try {
    // ── Adapters: constructed here, from values this process owns ──────────────
    // The module never reads the environment; everything arrives through this config object.
    const dataRepository = createCsvProductRepository({
      dataDirectory: dataDir,
      lockTimeoutMs: 5000,
    });

    const mediaStorage = createLocalMediaStorage({
      baseUploadDir: mediaDir,
      publicBaseUrl: 'https://static.example.test',
    });

    // ── Structured observability: the host supplies both sinks ─────────────────
    const logEntries: LogEntry[] = [];
    const auditEvents: AuditEvent[] = [];

    const service = createProductCatalogService({
      dataRepository,
      mediaStorage,
      logger: {
        log(entry: LogEntry): void {
          logEntries.push(entry);
        },
      },
      auditSink: {
        async record(event: AuditEvent): Promise<void> {
          auditEvents.push(event);
        },
      },
      defaults: { pageSize: 20, maxPageSize: 100 },
    });

    // ── One tenant/catalog scope per operation, built from the host's own session ──
    const ctx: CatalogContext = {
      tenantId: 'tenant-a',
      catalogId: 'main',
      actor: { id: 'user-1', type: 'user' },
    };
    const otherTenant: CatalogContext = { tenantId: 'tenant-b', catalogId: 'main' };

    const lines: string[] = [];

    // ── 1. Brand and a two-level category tree ─────────────────────────────────
    const brand = await service.createBrand(ctx, { name: 'Acme Electronics' });
    const rootCategory = await service.createCategory(ctx, { name: 'Electronics' });
    const childCategory = await service.createCategory(ctx, {
      name: 'Smartphones',
      parentId: rootCategory.id,
    });
    const categories = await service.listCategories(ctx);
    lines.push(
      `brand slug=${brand.slug} categories=${categories.length} ` +
        `child parentLinked=${childCategory.parentId === rootCategory.id}`,
    );

    // ── 2. A product with typed custom attributes ──────────────────────────────
    const product = await service.createProduct(ctx, {
      sku: 'PHONE-001',
      name: 'Acme Phone X',
      status: 'active',
      brandId: brand.id,
      categoryId: childCategory.id,
      price: 25999,
      stockQuantity: 50,
      isFeatured: true,
      attributes: {
        color: { type: 'enum', value: 'Midnight Black', options: ['Midnight Black', 'Pearl White'] },
        storage: { type: 'enum', value: '256GB', options: ['128GB', '256GB'] },
      },
    });
    lines.push(
      `product slug=${product.slug} status=${product.status} attributes=${Object.keys(product.attributes).length}`,
    );

    // A second product with the same name: the generated slug is suffixed, not duplicated.
    const sameName = await service.createProduct(ctx, {
      sku: 'PHONE-002',
      name: 'Acme Phone X',
      price: 20999,
      stockQuantity: 0,
    });
    // A third product that keeps every default: status 'draft', currency from `defaults`.
    const third = await service.createProduct(ctx, {
      sku: 'PHONE-003',
      name: 'Acme Tablet',
      price: 15999,
      stockQuantity: 5,
    });
    lines.push(
      `slugCollisionSuffix=${sameName.slug} thirdStatus=${third.status} ` +
        `thirdIsActive=${third.isActive} thirdIsFeatured=${third.isFeatured}`,
    );

    // ── 3. Lookups go through the same validation and scoping as writes ────────
    // The SKU is lower case here: the service normalises it before the lookup.
    const bySku = await service.getProductBySku(ctx, 'phone-001');
    const bySlug = await service.getProductBySlug(ctx, 'acme-phone-x');
    lines.push(
      `lookupBySku matched=${bySku.id === product.id} normalizedSku=${bySku.sku} ` +
        `lookupBySlug matched=${bySlug.id === product.id}`,
    );

    // ── 4. Pagination, and the maxPageSize clamp ───────────────────────────────
    const clamped = await service.listProducts(ctx, { page: 1, limit: 1000 });
    const page2 = await service.listProducts(ctx, { page: 2, limit: 2 });
    lines.push(
      `requestedLimit=1000 appliedLimit=${clamped.limit} total=${clamped.total} ` +
        `page2 items=${page2.items.length} totalPages=${page2.totalPages} hasPrev=${page2.hasPrev} ` +
        `hasNext=${page2.hasNext}`,
    );

    // ── 5. Search matches name, SKU, description, brand and category name ──────
    const search = await service.searchProducts(ctx, { search: 'Acme', status: 'active' });
    lines.push(`search "Acme" + status=active total=${search.total}`);

    // ── 6. Tenant isolation: another tenant sees nothing and cannot mutate ─────
    const otherTenantList = await service.listProducts(otherTenant);
    const crossTenantCode = await catchCode(() => service.getProductById(otherTenant, product.id));
    lines.push(
      `otherTenant total=${otherTenantList.total} crossTenantRead=${crossTenantCode}`,
    );

    // ── 7. The failure paths, one per documented error code ────────────────────
    const duplicateSkuCode = await catchCode(() =>
      service.createProduct(ctx, { sku: 'phone-001', name: 'Copy of an existing SKU', price: 1 }),
    );
    const invalidDataCode = await catchCode(() =>
      service.createProduct(ctx, { sku: 'PHONE-999', name: 'Negative price', price: -5 }),
    );
    lines.push(`duplicateSku=${duplicateSkuCode} invalidProductData=${invalidDataCode}`);

    // ── 8. Variants ────────────────────────────────────────────────────────────
    const variant = await service.createVariant(ctx, {
      productId: product.id,
      sku: 'PHONE-001-BLK-256',
      name: 'Acme Phone X — Black 256GB',
      price: 25999,
      stockQuantity: 10,
    });
    const variants = await service.listVariantsByProductId(ctx, product.id);
    const duplicateVariantCode = await catchCode(() =>
      service.createVariant(ctx, {
        productId: product.id,
        sku: 'phone-001-blk-256',
        name: 'Duplicate variant',
        price: 1,
      }),
    );
    lines.push(
      `variant variants=${variants.length} duplicateVariantSku=${duplicateVariantCode}`,
    );

    // ── 9. Images: magic-byte MIME detection, not the declared type ────────────
    const image = await service.uploadProductImage(ctx, {
      productId: product.id,
      fileName: 'product-hero.png',
      mimeType: 'image/png',
      fileBuffer: PNG_1X1,
      isPrimary: true,
    });
    const mimeMismatchCode = await catchCode(() =>
      service.uploadProductImage(ctx, {
        productId: product.id,
        fileName: 'pretends-to-be-jpeg.jpg',
        mimeType: 'image/jpeg',
        fileBuffer: PNG_1X1,
      }),
    );
    const unsupportedMimeCode = await catchCode(() =>
      service.uploadProductImage(ctx, {
        productId: product.id,
        fileName: 'unsupported.gif',
        mimeType: 'image/gif',
        fileBuffer: PNG_1X1,
      }),
    );
    const primarySet = image.publicUrl.startsWith('https://static.example.test/uploads/products/');
    lines.push(
      `image isPrimary=${image.isPrimary} publicUrlUnderBase=${primarySet} ` +
        `mimeMismatch=${mimeMismatchCode} unsupportedMime=${unsupportedMimeCode}`,
    );

    // ── 10. Image bookkeeping and path-traversal rejection ─────────────────────
    const reorderCode = await catchCode(() => service.reorderProductImages(ctx, product.id, []));
    const unknownImageCode = await catchCode(() =>
      service.setPrimaryProductImage(ctx, product.id, 'does-not-exist'),
    );
    // Storage keys are normalised and the resolved path must stay inside baseUploadDir.
    const traversalCode = await catchCode(() => mediaStorage.delete('../escape.png'));
    lines.push(
      `reorderMismatch=${reorderCode} unknownImage=${unknownImageCode} pathTraversal=${traversalCode}`,
    );

    // ── 11. Archive / restore ──────────────────────────────────────────────────
    const archived = await service.archiveProduct(ctx, product.id);
    const restored = await service.restoreProduct(ctx, product.id);
    lines.push(
      `archive status=${archived.status} archivedAtSet=${archived.archivedAt !== null} ` +
        `restore status=${restored.status} archivedAtCleared=${restored.archivedAt === null}`,
    );

    // ── 12. Hard delete, and the cascade to variants and images ────────────────
    await service.deleteProduct(ctx, third.id);
    const afterFirstDelete = await service.listProducts(ctx, { page: 1, limit: 100 });
    await service.deleteProduct(ctx, product.id);
    const afterCascadeDelete = await service.listProducts(ctx, { page: 1, limit: 100 });
    lines.push(
      `afterDelete total=${afterFirstDelete.total} afterCascadeDelete total=${afterCascadeDelete.total}`,
    );

    // ── 13. Structured logging and audit, measured from what the sinks received ──
    const failureLogs = logEntries.filter((entry) => entry.result === 'failure');
    const auditEventTypes = [...new Set(auditEvents.map((event) => event.eventType))];
    const loggedErrorCodes = [...new Set(failureLogs.map((entry) => entry.errorCode ?? 'none'))];

    lines.push(
      `logEntries=${logEntries.length} failureLogEntries=${failureLogs.length} ` +
        `auditEvents=${auditEvents.length} distinctAuditEventTypes=${auditEventTypes.length}`,
    );
    lines.push(`loggedFailureCodes=${loggedErrorCodes.join('+')}`);

    // ── Expected error codes, checked against the codes this run really caught ──
    const expectedCodes: Array<[string, string]> = [
      ['crossTenantRead', 'PRODUCT_NOT_FOUND'],
      ['duplicateSku', 'DUPLICATE_SKU'],
      ['invalidProductData', 'INVALID_PRODUCT_DATA'],
      ['duplicateVariantSku', 'DUPLICATE_SKU'],
      ['mimeMismatch', 'MEDIA_UPLOAD_FAILED'],
      ['unsupportedMime', 'INVALID_PRODUCT_DATA'],
      ['reorderMismatch', 'INVALID_PRODUCT_DATA'],
      ['unknownImage', 'PRODUCT_NOT_FOUND'],
      ['pathTraversal', 'STORAGE_ERROR'],
    ];
    const observedCodes: Record<string, string> = {
      crossTenantRead: crossTenantCode,
      duplicateSku: duplicateSkuCode,
      invalidProductData: invalidDataCode,
      duplicateVariantSku: duplicateVariantCode,
      mimeMismatch: mimeMismatchCode,
      unsupportedMime: unsupportedMimeCode,
      reorderMismatch: reorderCode,
      unknownImage: unknownImageCode,
      pathTraversal: traversalCode,
    };
    const mismatches = expectedCodes.filter(([label, code]) => observedCodes[label] !== code);
    const codesAsExpected = mismatches.length === 0;

    for (const line of lines) {
      console.log(line);
    }

    console.log(
      `EXAMPLE_RESULT: OK productsCreated=3 productsAfterCascadeDelete=${afterCascadeDelete.total} ` +
        `brandSlug=${brand.slug} categories=${categories.length} ` +
        `productSlug=${product.slug} productStatus=${product.status} ` +
        `slugCollisionSuffix=${sameName.slug} ` +
        `appliedLimitFrom1000=${clamped.limit} searchHits=${search.total} ` +
        `otherTenantTotal=${otherTenantList.total} variants=${variants.length} ` +
        `variantSku=${variant.sku} imageIsPrimary=${image.isPrimary} ` +
        `archiveStatus=${archived.status} restoreStatus=${restored.status} ` +
        `logEntries=${logEntries.length} failureLogEntries=${failureLogs.length} ` +
        `auditEvents=${auditEvents.length} distinctAuditEventTypes=${auditEventTypes.length} ` +
        `checkedErrorCodes=${expectedCodes.length} codesAsExpected=${codesAsExpected}`,
    );
  } finally {
    await rm(dataDir, { recursive: true, force: true });
    await rm(mediaDir, { recursive: true, force: true });
  }
}

await main();
