# product-catalog — โมดูลแคตตาล็อกสินค้าแบบ multi-tenant ที่ก๊อปไปเป็นของตัวเอง

โมดูล TypeScript สำหรับจัดการแคตตาล็อกสินค้าแบบ multi-tenant คุณก๊อปทั้งโฟลเดอร์ไปไว้ในโปรเจกต์
แล้วเป็นเจ้าของโค้ดเอง สร้าง config object หนึ่งตัว ประกอบ adapter สองตัวคือที่เก็บข้อมูลกับที่เก็บ
ไฟล์สื่อ แล้วทุกคำสั่งจะวิ่งผ่าน service เดียว: validate input, normalize SKU, สร้าง slug,
กั้นขอบเขตตาม tenant/catalog, ทำ pagination, จัดการรูปสินค้า, ส่ง audit event และ log entry
แบบมีโครงสร้าง หรือโยน `ProductCatalogError` ที่มี `code` ให้คุณแยกแยะได้

โมดูลนี้เป็น reusable embedded module ไม่ใช่ service และไม่ใช่ framework ไม่ใช่ระบบ standalone
และไม่เคยอ่าน environment ของคุณ ทุก path ทุก URL และทุก sink ถูก inject เข้ามาจากฝั่ง host
adapter สองตัวที่แนบมาในเวอร์ชันนี้เก็บข้อมูลเป็นไฟล์ CSV ในเครื่องและไฟล์สื่อบนดิสก์ในเครื่อง
จึงรันได้ในที่ที่ Node.js อ่านเขียนไฟล์ได้

เวอร์ชัน 0.1.0 entry point สาธารณะคือ `index.ts`

## install — การติดตั้ง

โมดูลนี้ใช้วิธี copy-and-own คือตัว source เองคือสินค้า ไม่มีแพ็กเกจ npm ที่เผยแพร่บน registry
ให้ติดตั้ง และโมดูลไม่มี runtime dependency เลย จึงไม่เพิ่ม dependency เข้าไปในโปรเจกต์ของคุณ

1. คัดลอกโฟลเดอร์โมดูล `product-catalog/` ทั้งโฟลเดอร์ไปไว้ในโปรเจกต์ของคุณ เช่น
   `src/modules/product-catalog/` — ต้องก๊อปทั้งโฟลเดอร์ (`index.ts`, `core/`, `adapters/`,
   `examples/`, `tests/`, `package.json`, `package-lock.json`, `tsconfig.json`) ไม่ใช่ก๊อปเฉพาะ
   บางไฟล์
2. ถ้าต้องการรันเทสและตัวอย่างของโมดูลในสำเนาที่ก๊อปมา ให้เข้าไปในโฟลเดอร์นั้นแล้วรัน `npm ci`
   เพื่อติดตั้ง dev toolchain (vitest, typescript, vite-node) จาก `package-lock.json` ที่แนบมา
   แอปพลิเคชันของคุณไม่ต้องใช้ toolchain ชุดนี้
3. import จาก entry point ของสำเนาที่คุณก๊อปเอง (`./modules/product-catalog/index.js`) และแก้ไข
   เฉพาะสำเนานั้น ห้าม import ข้ามโปรเจกต์จากโฟลเดอร์ต้นฉบับ

ต้องใช้ Node.js 18 ขึ้นไป เพราะ adapter ที่แนบมาใช้ `node:fs` อ่านเขียนไฟล์

## quickstart — เริ่มใช้งานเร็ว

หลังทำ 3 ขั้นตอนด้านบนแล้ว เส้นทางสั้นที่สุดไปถึงการเรียกใช้งานครั้งแรกสำเร็จมีเท่านี้ คือประกอบ
adapter สองตัว สร้าง config หนึ่งตัว แล้วเรียกหนึ่งครั้ง

```ts
// your-app/src/catalog.ts  (โมดูลถูกก๊อปไปไว้ที่ your-app/src/modules/product-catalog/)
import os from 'node:os';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import {
  createProductCatalogService,
  createCsvProductRepository,
  createLocalMediaStorage,
  ProductCatalogError,
} from './modules/product-catalog/index.js';

// 1. adapter สองตัว ไดเรกทอรีเป็นของคุณเอง โมดูลไม่อ่าน env ให้เลย
const dataRepository = createCsvProductRepository({
  dataDirectory: await mkdtemp(path.join(os.tmpdir(), 'catalog-data-')),
});
const mediaStorage = createLocalMediaStorage({
  baseUploadDir: await mkdtemp(path.join(os.tmpdir(), 'catalog-media-')),
  publicBaseUrl: 'https://static.example.test',
});

// 2. config หนึ่งตัว logger กับ auditSink เป็นตัวเลือก ส่วน adapter สองตัวบังคับ
const service = createProductCatalogService({
  dataRepository,
  mediaStorage,
  defaults: { pageSize: 20, maxPageSize: 100 },
});

// 3. เรียกหนึ่งครั้ง context กั้นขอบเขตทุกการอ่านและเขียนไว้ที่ tenant + catalog เดียว
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
  // ทุกเส้นทางที่ล้มเหลวโยน ProductCatalogError ไม่คืน error object กลับมา
  if (err instanceof ProductCatalogError) console.error(err.code);
}
```

คำสั่งรันตัวอย่างที่แนบมา (รันจากในโฟลเดอร์โมดูล)

```bash
npm run example
```

## example — ตัวอย่างที่รันได้

โมดูลแนบตัวอย่างที่รันได้หนึ่งตัวคือ `examples/run.ts` เปิดด้วยคำสั่งเดียว ไม่ต้องใส่ argument
ไม่ต่อเน็ตเวิร์ก ไม่ใช้ credential และไม่ต้องตั้งค่าอะไร

```bash
npm run example
```

ตัวอย่างนี้รันผ่าน `vite-node` แล้วขับของจริงคือ CSV repository กับ local media storage ลงใน
ไดเรกทอรีชั่วคราวที่มันสร้างเองใน temp ของระบบ แล้วลบออกก่อนจบ จึงรัน code path ของ production
ได้ครบโดยไม่ต้องมีเซิร์ฟเวอร์ บรรทัดสุดท้ายที่พิมพ์เริ่มด้วย `EXAMPLE_RESULT: OK` และรายงานเฉพาะ
ค่าที่รอบนั้นวัดได้จริง ผลที่สังเกตได้จากรอบที่ตรวจล่าสุด

```text
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
```

อ่านบรรทัดรายละเอียดคู่กับบรรทัดสรุป: สร้างสินค้า 3 ตัว ตัวที่สามไม่ได้ระบุค่าจึงได้ status
`draft` ตามดีฟอลต์ สินค้าตัวที่สองชื่อซ้ำกับตัวแรกจึงได้ slug ต่อท้ายด้วย `-1` ไม่ซ้ำกัน
การค้นหาด้วย SKU ที่พิมพ์เป็นตัวพิมพ์เล็กถูก normalize ก่อนค้นแล้วยังเจอ ขอ limit `1000`
ถูกบีบลงมาเหลือ `maxPageSize` ที่ตั้งไว้คือ `100` การค้นหาเข้าถึงได้ทั้ง name, SKU, description,
ชื่อแบรนด์ และชื่อหมวดหมู่ tenant ที่สองเห็นสินค้า `0` ชิ้นและอ่านสินค้าของ tenant แรกไม่ได้
เส้นทางที่ล้มเหลวทั้งเก้าจุดโยน code ตามที่โมดูลระบุไว้ การ archive ตั้งทั้ง status และ timestamp
และการ restore ล้างทั้งคู่ การลบสินค้าลบ variant กับรูปที่ผูกอยู่ตามไปด้วย และ sink สองตัวที่
เป็นตัวเลือกได้รับ log entry กับ audit event ที่ service ส่งออกมาจริง

## limitations — ข้อจำกัด

- **adapter CSV ห้ามใช้ในงานหลายโปรเซสหรือ scale แนวนอน** `adapters/data/csv/file-lock.ts`
  บังคับลำดับการเขียนด้วยไฟล์ล็อกที่สร้างด้วย flag `'wx'` ซึ่งใช้ได้กับโปรเซสเดียว และ
  `adapters/data/csv/csv-product.repository.ts` อ่านตารางทั้งไฟล์เข้า memory ทุกครั้งที่ query
  หลายโปรเซสที่แชร์ไดเรกทอรีเดียวกันจึงแย่งล็อกกันได้ และแคตตาล็อกขนาดใหญ่จะถูกโหลดทั้งก้อนต่อ
  query เหมาะกับแคตตาล็อกขนาดเล็กถึงกลาง งานพัฒนาในเครื่อง แอปที่รันโปรเซสเดียว และ staging
  แต่ไม่เหมาะกับ production แบบหลายอินสแตนซ์ ปริมาณเขียนสูง หรือแคตตาล็อกใหญ่มาก
- **โมดูลต้องใช้ filesystem จึงรันบน runtime แบบ edge หรือ Worker ไม่ได้ตามที่แนบมา**
  ทั้ง `adapters/data/csv/csv-product.repository.ts`, `adapters/data/csv/file-lock.ts` และ
  `adapters/media/local/local-media.storage.ts` import `node:fs` ส่วน adapter รูป import
  `node:crypto` กับ `node:path` ด้วย จึงรันบน Cloudflare Workers, Deno Deploy หรือ runtime ที่
  ไม่มี filesystem ของ Node ไม่ได้ ชั้น `core/` เองไม่มี import `node:*` เลย และโมดูลผูกกับ
  interface `ProductRepository` กับ `MediaStorage` เท่านั้น host จึงเขียน adapter ที่ต่อกับ
  ฐานข้อมูลหรือ object storage เองได้ แต่เวอร์ชันนี้ยังไม่แนบ adapter แบบนั้นมาให้
- **`config.logger` เป็นตัวเลือก ตั้งค่าผิดจึงดูเหมือนเงียบ** ถ้าไม่ส่ง `logger` มา โมดูลจะไม่ส่ง
  log entry ออกมาเลย และถ้าไม่ส่ง `auditSink` ก็จะไม่บันทึก audit event เลย ทั้งสองเป็นแบบ
  opt-in ตามดีไซน์ ไม่มีคำเตือนใด ๆ ว่าไม่ได้ตั้ง
- **รูปถูกเก็บด้วยคีย์ที่โมดูลสร้างเอง ไม่ใช่ชื่อไฟล์ที่คุณส่งมา** `uploadProductImage` รับ
  `fileName` ไว้เป็น metadata เท่านั้น path ที่เก็บจริงคือ
  `uploads/products/{productId}/{uuid}.{ext}` ชื่อเดิมถูกทำความสะอาดแล้วเก็บเป็น metadata และ
  adapter ไม่เชื่อ `mimeType` ที่ประกาศมา แต่ตรวจชนิดจากไบต์จริงและปฏิเสธถ้าไม่ตรงกัน
- **`listCategories` ไม่มี pagination** `listProducts`, `searchProducts` และ `listBrands` คืนค่า
  เป็น `PaginatedResult` แต่ `listCategories` คืน `Category[]` ตรง ๆ เรียงตาม `sortOrder` แล้วตาม
  ชื่อ ไม่มีตัวเลือก page หรือ limit สำหรับหมวดหมู่
- **การจัดลำดับรูปเป็นแบบทั้งหมดหรือไม่ทำเลย** `reorderProductImages` จะโยน `INVALID_PRODUCT_DATA`
  ถ้ารายการ id ไม่ได้มีรูปของสินค้านั้นครบทุกตัวและตัวละครั้งเดียว จึงปฏิเสธทั้งคำขอ ไม่ทำบางส่วน
- **ไม่มี authentication ไม่มี pricing engine ไม่มี search index ไม่มี import/export** โมดูลกั้น
  ขอบเขตข้อมูลตาม `tenantId` + `catalogId` ที่คุณส่งเข้ามา แต่ไม่ได้ยืนยันตัวตนใครและไม่ได้ตัดสิน
  ว่าผู้เรียกมีสิทธิ์ทำอะไร งาน order, กฎราคา, การ sync search index และการนำเข้า/ส่งออกข้อมูล
  จำนวนมากเป็นหน้าที่ของ host หรือโมดูลอื่น

## api — API ที่ export

ทุกอย่าง export มาจาก entry point `index.ts` เท่านั้น ห้าม import จากไฟล์ย่อยโดยตรง

รายการที่เป็นค่าจริงตอนรัน:

- `createProductCatalogService` — `createProductCatalogService(config: ProductCatalogConfig): ProductCatalogService`
  คืน service ที่ผูกกับ adapter และ sink ที่คุณ inject และโยน `CONFIGURATION_ERROR` ทันทีถ้าไม่มี
  `dataRepository` หรือ `mediaStorage`
- `createCsvProductRepository` — `createCsvProductRepository(options: CsvProductRepositoryOptions): ProductRepository`
  adapter ข้อมูลแบบ CSV รับ `dataDirectory` ที่บังคับกับ `lockTimeoutMs` ที่เป็นตัวเลือก
  (ค่าเริ่มต้น `3000`) สร้างไดเรกทอรีและไฟล์ CSV ห้าไฟล์ให้ตอนใช้งานครั้งแรก
- `createLocalMediaStorage` — `createLocalMediaStorage(options: LocalMediaStorageOptions): MediaStorage`
  adapter ไฟล์สื่อบนดิสก์ในเครื่อง รับ `baseUploadDir` กับ `publicBaseUrl` ที่บังคับ และ
  `maxFileSizeByte` ที่เป็นตัวเลือก (ค่าเริ่มต้น `5242880`)
- `ProductCatalogError` — คลาส error ที่ทุกเส้นทางล้มเหลวโยนออกมา มี `code` เป็น
  `ProductCatalogErrorCode`, `details` และ `cause`

ประเภทข้อมูลที่ export จาก entry point (ไม่มีค่าจริงตอนรัน):

- `ProductCatalogService` — interface ของ service มี 30 เมธอดในกลุ่ม product, variant, brand,
  category และ image ทุกตัวรับ `CatalogContext` เป็นอาร์กิวเมนต์แรก
- `ProductCatalogConfig` — config ที่ inject เข้ามา: `dataRepository`, `mediaStorage`,
  `logger`/`auditSink` ที่เป็นตัวเลือก และ `defaults.currency`, `defaults.pageSize`,
  `defaults.maxPageSize`
- `CatalogContext` — `{ tenantId, catalogId, actor? }` ใช้กั้นขอบเขตทุกการอ่านและเขียน
- `Product`, `Variant`, `Brand`, `Category`, `ProductImage` — ระเบียนโดเมนที่ถูกเก็บจริง
- `ProductStatus` — `'draft' | 'active' | 'inactive' | 'archived'`
- `AttributeValue`, `CustomAttributeMap` — union ของ attribute ที่พิมพ์ไว้ เก็บบน product และ
  variant
- `CreateProductInput`, `UpdateProductInput`, `CreateVariantInput`, `UpdateVariantInput`,
  `CreateBrandInput`, `UpdateBrandInput`, `CreateCategoryInput`, `UpdateCategoryInput`,
  `UploadProductImageInput` — input ของแต่ละคำสั่ง
- `ProductQuery`, `BrandQuery`, `CategoryQuery`, `SortField`, `SortOrder`, `PaginatedResult` —
  รูปร่างของ query และผลลัพธ์
- `ProductRepository`, `MediaStorage` — interface ของ adapter สองตัวที่ core ผูกด้วย
- `CsvProductRepositoryOptions`, `LocalMediaStorageOptions` — ตัวเลือกของ adapter ทั้งสอง
- `StructuredLogger`, `LogEntry`, `LogLevel`, `AuditSink`, `AuditEvent`, `AuditEventType` —
  สัญญา observability ที่เป็นตัวเลือก
- `UploadMediaInput`, `MediaStorageOutput`, `MediaMetadata` — ประเภทข้อมูลเข้า/ออกของ adapter สื่อ
- `ProductCatalogErrorCode` — union ปิดของ code บน `ProductCatalogError` และเป็น code ที่คุณใช้
  แยกแยะ: `PRODUCT_NOT_FOUND`, `DUPLICATE_SKU`, `INVALID_PRODUCT_DATA`, `INVALID_VARIANT`,
  `INVALID_CATEGORY`, `STORAGE_ERROR`, `MEDIA_UPLOAD_FAILED`, `MEDIA_DELETE_FAILED`, `CSV_LOCKED`,
  `CSV_CORRUPTED`, `PROVIDER_UNAVAILABLE`, `CONFIGURATION_ERROR`

## tests — การทดสอบ

รันชุดเทสจากในโฟลเดอร์โมดูลด้วยคำสั่ง

```bash
npm test
```

ผลที่วัดได้จริงในรอบนี้ (`2026-09-27`) คำสั่ง `npm test` ออกด้วย exit code 0 และรายงานว่า

- 226 tests ผ่านทั้งหมด ไม่มีตก ใน 10 test files
- 213 tests ใน 9 ไฟล์เดิมคือชุดเทสที่มีอยู่ก่อน ไฟล์เหล่านี้ไม่ถูกแก้เลย ไม่มีเทสใดถูกลบ ข้าม
  หรือทำให้อ่อนลง
- 13 tests ใหม่ใน `tests/docs-contract.test.ts` คอยป้องกันสัญญาเอกสารลูกค้า และไฟล์นี้เป็นไฟล์
  เทสเดียวที่เพิ่มในรอบนี้
- `npm test` รัน `vitest run` ส่วน `npm run test:contract` รันเฉพาะ `tests/contract`
- `tests/docs-contract.test.ts` อ่าน `README.md`, `README.th.md`, `MODULE.md`, `package.json`,
  `index.ts`, `core/errors.ts` และ `examples/run.ts` จากดิสก์ ถ้าลบ section ที่บังคับออก
  ละเมิดกฎติดตั้งแบบ copy-and-own ระบุ export ที่ entry point ไม่มี อ้างจำนวนเทสที่ `MODULE.md`
  ไม่ได้ระบุ ระบุ error code ที่โมดูลไม่ได้นิยาม หรือลบ marker ของตัวอย่างออก เทสจะไม่ผ่าน
- `npm run typecheck` รัน `tsc --noEmit` ครอบ `**/*.ts` (รวมตัวอย่างและเทส) และออกด้วย exit code 0

## strengths — จุดแข็ง

- **ไม่มี runtime dependency** `package.json` ไม่มีฟิลด์ `dependencies` เลย จึงไม่มีอะไรถูกดึง
  เข้าแอปพลิเคชันของคุณนอกจากตัว source ของโมดูลเอง มีแค่ dev toolchain (`typescript`, `vitest`,
  `@vitest/coverage-v8`, `vite-node`) ที่ประกาศไว้ และใช้แค่ตอนรันเทสกับตัวอย่าง
- **ทุกเส้นทางล้มเหลวโยน error ที่มีโครงสร้างให้แยกตาม code** `core/errors.ts` นิยาม union ปิด
  ทั้งสิบสอง code และ `ProductCatalogError` พา `code`, `details` กับ `cause` มาด้วย
  `core/service.ts` map error ที่ไม่ใช่ error ของโดเมนเป็น `PROVIDER_UNAVAILABLE` แทนที่จะปล่อย
  หลุดออกไปดิบ ๆ และเมธอด `get*` ของ repository คืน `null` แทนการโยน เพื่อให้ชั้น service
  เป็นคนตัดสิน code ตัวอย่างที่แนบมาตรวจ 9 code เทียบกับที่จับได้จริง
- **การเขียนไฟล์ทนต่อการล้มกลางคันและมีล็อก** `adapters/data/csv/csv-product.repository.ts` เขียน
  ผ่านไฟล์ชั่วคราวแล้ว `fsync` แล้ว rename ทับของเดิม และเก็บไฟล์ก่อนหน้าไว้เป็น `.bak` ส่วน
  `adapters/data/csv/file-lock.ts` กั้นแต่ละตารางด้วยไฟล์ล็อก `'wx'` แล้ว poll จนครบ
  `lockTimeoutMs` ก่อนจะโยน `CSV_LOCKED`
- **การแยก tenant บังคับใช้ในชั้น adapter จริง ไม่ใช่แค่เขียนในเอกสาร** ฟังก์ชัน `sameScope()` ใน
  `adapters/data/csv/csv-product.repository.ts` กรองทุกการอ่านและทุกการเขียนด้วย `tenant_id` +
  `catalog_id` ระเบียนของ tenant อื่นจึงมองไม่เห็นและแก้ไม่ได้ ไม่ใช่แค่ซ่อนที่ชั้น service
  ตัวอย่างที่แนบมาพิสูจน์ด้วย context ของ tenant ที่สอง
- **กัน path traversal ก่อนแตะไฟล์** `core/utils/sanitize.ts` normalize storage key และ
  `assertSafePath` ปฏิเสธ path ที่หลุดออกจาก `baseUploadDir` ด้วย `STORAGE_ERROR:
  'Path traversal detected'` และ `adapters/media/local/local-media.storage.ts` เรียกใช้กับทุก key
  ตัวอย่างที่แนบมาเรียกเส้นทางนี้จริง
- **อัปโหลดตรวจจากเนื้อไฟล์ ไม่ใช่จากคำที่ประกาศ** adapter รูปตรวจชนิด MIME จากไบต์จริง (ลายเซ็น
  JPEG, PNG, WEBP) ปฏิเสธบัฟเฟอร์ที่ตรวจได้ไม่ตรงกับ `mimeType` ที่ประกาศด้วย
  `MEDIA_UPLOAD_FAILED` ปฏิเสธชนิดที่ไม่อยู่ใน allowlist ด้วย `INVALID_PRODUCT_DATA` และเช็ค
  ความยาวไบต์กับ `maxFileSizeByte` ก่อนเขียน
- **เทสรันได้เองและให้ผลซ้ำได้** เทสทั้ง 226 ตัวใช้ adapter CSV และ local media ตัวจริงกับ
  ไดเรกทอรีชั่วคราว ไม่ต้องต่อเน็ตเวิร์ก ไม่ต้องมีฐานข้อมูล ไม่ต้องใช้ credential และ
  `vitest.config.ts` ตั้ง coverage ของ `core/**` ไว้ที่ 90% บรรทัด/ฟังก์ชัน/statement และ 85%
  สาขา
- **ได้ source ครบ ไม่ใช่กล่องดำ** คุณก๊อปทั้งโมดูล ทั้ง core, validator, adapter สองตัว, เทส และ
  ตัวอย่างการต่อเข้าโปรเจกต์ที่มีคอมเมนต์ใน `examples/integration.example.ts` แล้วอ่านหรือแก้ได้
  ทุกบรรทัด

## runtime — รันไทม์และการนำไปใช้

- **Runtime dependency: ไม่มี** `package.json` ไม่มีฟิลด์ `dependencies` เลย source ที่ส่งมอบไป
  จึงไม่ต้องใช้แพ็กเกจบุคคลที่สามตอนรัน
- **Node builtin ที่ source ใช้:** `node:fs` (CSV repository, file lock และ adapter รูป),
  `node:crypto` (CSV repository และ adapter รูป), `node:path` (adapter ทั้งสอง) ส่วน
  `examples/run.ts` กับเทสใช้ `node:os` และ `node:fs/promises` เพิ่มด้วย ชั้น `core/` และ
  `index.ts` ไม่ import `node:*` เลย
- **ไม่อ่าน environment ตามดีไซน์** โมดูลไม่เคยอ่าน `process.env`, `env` หรือ `globalThis.process`
  ทุกค่าถูกส่งเข้ามาชัด ๆ ผ่าน `ProductCatalogConfig` และ option ของ adapter
- **รันได้ที่ไหน:** Node.js 18 ขึ้นไปที่อ่านเขียนไฟล์ได้ ทั้งเซิร์ฟเวอร์ คอนเทนเนอร์ งาน CI และ
  สคริปต์ในเครื่อง source เป็น ES2022 ธรรมดา ใช้ specifier `.js` กับ relative import และผ่าน
  type check ด้วย `moduleResolution: Bundler` และคอมไพล์แล้ว import เป็น Node ESM เปล่าได้
- **รันไม่ได้ที่ไหนตามที่แนบมา:** runtime แบบ edge หรือ Worker ที่ไม่มี filesystem ของ Node
  (Cloudflare Workers, Deno Deploy, บันเดิลในเบราว์เซอร์) รัน adapter สองตัวในเวอร์ชันนี้ไม่ได้
  เพราะใช้ `node:fs` host ที่ต้องรันบน runtime แบบนั้นต้อง implement interface `ProductRepository`
  กับ `MediaStorage` เองบนที่เก็บของตัวเอง เพราะชั้น `core/` ไม่มี import `node:*` เลยและพร้อมรับ
- **ไม่ครอบคลุมอะไร:** authentication, authorization, งาน order, pricing engine, การ sync
  search index และการนำเข้า/ส่งออกข้อมูลจำนวนมาก โมดูลกั้นขอบเขตตาม context ที่คุณส่งมาและเก็บ
  ตามที่คุณสั่ง แต่ไม่ได้ตัดสินนโยบายเหล่านี้เอง
- **ตัวอย่างรันที่ไหน:** `npm run example` ใช้ `vite-node` ซึ่งเป็นเครื่องมือสำหรับพัฒนาเท่านั้น
  ต้องมี dev dependency ของโมดูลติดตั้งไว้ และไม่รวมอยู่ในบันเดิลของแอปพลิเคชันคุณ

สัญญาฉบับเต็ม — signature ของทุกเมธอด ค่าเริ่มต้นของทุก config ทุก error code มาตรการด้านความ
ปลอดภัย และพฤติกรรมของ adapter — ดูได้ที่ `MODULE.md` และ `DESIGN.md` ในโฟลเดอร์ที่ก๊อปไป
