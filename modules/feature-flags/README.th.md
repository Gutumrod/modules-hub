# feature-flags — สวิตช์เปิด/ปิดฟีเจอร์แบบกำหนดผลได้แน่นอน สำหรับ TypeScript

โมดูลประเมิน feature flag ขนาดเล็กที่ **ไม่มี runtime dependency** — คัดลอกทั้งโฟลเดอร์ไปไว้ในโปรเจกต์ของคุณแล้วเป็นเจ้าของโค้ดเอง
คุณฉีด (inject) flag store เข้ามา ถามธงด้วย key แล้วได้ค่า `enabled` เป็น boolean กลับไป
ผ่านท่อการประเมินเดียวที่กำหนดผลได้แน่นอน: ตรวจ key → อ่านจาก store → จับคู่ targeting rule → ใช้ค่า fallback
เมื่อ provider ล้มเหลวหรือไม่พบธง โมดูลจะไม่ throw ใส่แอปของคุณ แต่คืนค่า fallback ที่คาดเดาได้แทน

เวอร์ชัน 0.1.0 · จุดเข้าใช้งาน (entry point): `index.ts`

**ข้อจำกัด / สิ่งที่โมดูลนี้ไม่ได้ทำ**

- memory store ที่แนบมาใช้ได้กับ instance เดียว และไม่ซิงก์ข้าม process
- ไม่มี percentage rollout และไม่มีการซิงก์จาก remote
- flag ไม่ใช่ permission, RBAC หรือ entitlement ของแพ็กเกจชำระเงิน

## install — การติดตั้ง (copy-and-own 3 ขั้นตอน)

1. คัดลอกโฟลเดอร์ `feature-flags` ทั้งโฟลเดอร์ไปไว้ในโปรเจกต์ของคุณ เช่นที่ `src/modules/feature-flags/`
   ต้องคัดลอกทั้งโฟลเดอร์ (`index.ts`, `core/`, `adapters/`, `package.json`, `tsconfig.json`, tests และ examples ไปด้วยกัน)
   โมดูลนี้ไม่มีแพ็กเกจบน registry ให้ติดตั้ง ดังนั้น "สำเนาที่คัดลอก" คือ dependency ตัวจริง
2. ไม่บังคับ — ถ้าต้องการรัน test และ example ของโมดูลในเครื่อง ให้รัน `npm ci` ในโฟลเดอร์ที่คัดลอกมา
   ตัวแอปของคุณเองไม่จำเป็นต้องใช้เครื่องมือชุดนี้เลย
3. import ผ่าน entry point ของสำเนาที่คุณคัดลอกมา — ห้ามชี้ path ข้ามโปรเจกต์ต้นทาง

   ```ts
   import { createFeatureFlagClient, createMemoryFlagStore } from './modules/feature-flags/index.js';
   ```

เก็บสำเนาไว้ใน version control ของคุณเอง แก้ไขและต่อยอดได้ตามต้องการ

## quickstart — เริ่มใช้งานเร็ว (เรียกครั้งแรกให้สำเร็จ)

จากโฟลเดอร์โมดูลที่คัดลอกมาแล้ว ถึงการประเมินธงครั้งแรกในไฟล์เดียว:

```ts
// path ชี้ไปที่สำเนาของคุณ ไม่ใช่ repository ต้นทาง
import { createFeatureFlagClient, createMemoryFlagStore } from './modules/feature-flags/index.js';

// 1. flag store — ค่า boolean แบบย่อจะถูกแปลงเป็น { key, enabled } ให้อัตโนมัติ
const store = createMemoryFlagStore({
  'new-checkout-flow': true,
});

// 2. client — โมดูลไม่อ่าน env เลย คุณเป็นคนฉีดทุกอย่างเข้าไป
const client = createFeatureFlagClient({
  store,
  defaultFallback: false,
});

// 3. ถามค่าธง — isEnabled() คืน boolean จากท่อ getFlag() เดียว
const enabled = await client.isEnabled({ key: 'new-checkout-flow' });
console.log(enabled); // true

// ถ้าต้องการผลวินิจฉัยเต็ม ใช้ getFlag():
// { key: 'new-checkout-flow', enabled: true, source: 'store', reason: 'Evaluated flag default state' }
```

รันตัวอย่างที่เตรียมไว้ด้วยคำสั่งเดียวนี้ จากในโฟลเดอร์โมดูล:

    npm run example

## example — ตัวอย่างที่รันได้จริง

คำสั่งเดียว ไม่ต้องใส่อาร์กิวเมนต์ ไม่ต้องต่อเครือข่าย ไม่ต้องตั้งค่า:

    npm run example

คำสั่งนี้รัน `examples/run.ts` ผ่าน `vite-node` และพิมพ์ผลลัพธ์จริงตามนี้ บรรทัดสุดท้ายขึ้นต้นด้วย
`EXAMPLE_RESULT: OK` แล้วตามด้วยค่าที่ตัวอย่างวัดได้จริงในรอบนั้น:

    new-checkout-flow             -> enabled=true source=store reason="Evaluated flag default state"
    beta-dashboard / tenant-vip   -> enabled=true source=store reason="Matched targeting rule"
    beta-dashboard / tenant-basic -> enabled=false source=store reason="Evaluated flag default state"
    not-registered                -> enabled=false source=default_fallback reason="Flag not found in store"
    not-registered + defaultValue -> enabled=true source=default_fallback reason="Flag not found in store"
    config defaultFallback=true   -> enabled=true source=default_fallback reason="Flag not found in store"
    setFlag runtime update       -> true=true thenFalse=false thenTrue=true
    invalid key "   "             -> enabled=false source=error_fallback reason="Invalid flag key"
    provider that throws          -> enabled=false source=error_fallback reason="Provider error: storage lookup failed"
    malformed stored value        -> enabled=false source=error_fallback reason="Invalid flag value"
    throwing hooks survived      -> true
    concurrent tenants isolated  -> vip=true other=false
    EXAMPLE_RESULT: OK evaluations=12 onErrorCalls=3 errorCodes=FLAG_KEY_INVALID+FLAG_PROVIDER_ERROR+FLAG_VALUE_INVALID flagsInStore=2 sources=store,store,store,default_fallback targetingRuleFired=true runtimeUpdateApplied=true throwingHooksIsolated=true tenantIsolation=true hookAttributesStripped=true errorClassOk=true

ตัวอย่างนี้แสดงพฤติกรรมที่ควรรู้ก่อนเอาไปต่อ: targeting rule ตัวแรกที่ตรงจะชนะ, fallback ทั้งสามลำดับถูกใช้ตามลำดับ,
`store.setFlag()` เห็นผลทันทีในการเรียกครั้งถัดไป, error code ทั้งสามแบบลดระดับเป็น fallback แทนการ throw,
hook ที่ throw เปลี่ยนผลลัพธ์ไม่ได้, tenant ที่ประเมินพร้อมกันไม่รั่วข้ามกัน และ payload ของ hook ถูกตัด `attributes` ออกแล้ว

## limitations — ข้อจำกัด (อ่านก่อนใช้งาน)

- ทุกครั้งที่ประเมินจะเรียก store หนึ่งครั้งแบบ asynchronous และ core ไม่ cache ผลลัพธ์เลย
  ทุกการเรียก `isEnabled()` / `getFlag()` จะไปถึง `FeatureFlagStore` ของคุณเสมอ นี่คือเหตุที่การแก้ธงเห็นผลทันที
  และหมายความว่า store อยู่ในเส้นทางวิกฤตของการตรวจทุกครั้ง ถ้า store อยู่ไกล latency ของคุณก็อยู่ไกลตามไปด้วย
- การจับคู่ targeting เป็นการเทียบสตริงแบบตรงตัวเท่านั้นในเวอร์ชันนี้ — rule จะตรงเมื่อทุกฟิลด์ที่ระบุไว้
  (`tenantId`, `userId`, `environment`) เท่ากับค่าใน context ส่วนฟิลด์ที่ไม่ระบุถือเป็น wildcard
  ไม่มี percentage rollout ไม่มี regex ไม่มี expression tree ไม่มีการเทียบตัวเลข และไม่มี JSON-logic
- `createMemoryFlagStore()` เป็น store ในหน่วยความจำแบบ single-instance เท่านั้น ใช้สำหรับ test, พัฒนาในเครื่อง
  และตรวจสัญญา (contract) เท่านั้น ไม่ซิงก์ข้าม process ข้าม serverless instance หรือข้าม Cloudflare Workers
  ถ้าใช้ production ต้องฉีด `FeatureFlagStore` แบบกระจาย (distributed) เข้ามาแทน
- feature flag ไม่ใช่ระบบสิทธิ์ (entitlement) — ใช้สำหรับควบคุมการปล่อยของ, kill switch และ pilot เท่านั้น
  ห้ามใช้เป็นตัวตรวจ permission, RBAC หรือสิทธิ์ตามแพ็กเกจการชำระเงิน
- ไม่มีอะไรถูกเก็บให้คุณ โมดูลไม่ persist ธง ไม่ซิงก์จาก remote config service และไม่มี admin UI ไม่มีตัวจัดเวลา
  และไม่มีประวัติการเปลี่ยนแปลง ธงอยู่เฉพาะใน store ที่คุณฉีดเข้ามาเท่านั้น
- ธงเป็น boolean เท่านั้น ไม่มี A/B variant payload ไม่มีค่าที่เป็น JSON และไม่มีธงแบบสตริง
  อะไรที่ซับซ้อนกว่านั้นต้องให้ Host ไปจำลองไว้รอบการตัดสินใจจากค่า `enabled`
- ไม่มีการอ่าน env — โมดูลไม่อ่าน `process.env`, `env` หรือ `globalThis.process` จึงไม่มีการตั้งค่าเกิดขึ้นเลย
  ถ้าคุณไม่ส่งผ่าน `createFeatureFlagClient(config)`

## api — API สาธารณะ

ทุก export มาจาก entry point `index.ts` เท่านั้น ห้าม import จากไฟล์ย่อยโดยตรง

รายการที่ export ตอน runtime:

- `createFeatureFlagClient(config?: FeatureFlagConfig): FeatureFlagClient` — factory คืน client ที่ผูกกับ config ที่ให้มา
  ถ้าไม่ส่ง `store` จะใช้ store ว่างที่คืน `null` เสมอ ทุกคำถามจึงจบที่ค่า fallback
- `createMemoryFlagStore(initialFlags?: Record<string, StoredFlag | boolean>): MemoryFeatureFlagStore` — store ในหน่วยความจำ
  สำหรับ test และพัฒนาในเครื่อง ค่า boolean ถูกแปลงเป็น `{ key, enabled }` ให้อัตโนมัติ และเพิ่ม `setFlag`, `removeFlag`, `clear` เหนือสัญญาของ store
- `FeatureFlagError` — คลาส error ที่ใช้สัญญา error แบบมีโครงสร้างของโมดูล มีฟิลด์ `code` และอาจมี `key`, `cause`

รายการที่เป็น type:

- `FeatureFlagClient` — อินเทอร์เฟซของ client: `isEnabled(query)` และ `getFlag(query)`
- `FeatureFlagConfig` — `store`, `defaultFallback`, `hooks` ทั้งหมด Host เป็นคนฉีดเข้ามา
- `FeatureFlagContext` — context ที่ใช้ประเมิน: `tenantId`, `userId`, `environment`, `attributes` (ทุกตัวเป็นทางเลือก)
- `FeatureFlagErrorCode` — union ของ `'FLAG_KEY_INVALID'`, `'FLAG_PROVIDER_ERROR'`, `'FLAG_VALUE_INVALID'`
- `FeatureFlagLoggingHooks` — callback telemetry: `onEvaluation` และ `onError` (ทางเลือก) hook ที่ throw จะถูกกลืนและไม่มีผลต่อผลการประเมิน
- `FeatureFlagQuery` — `{ key, context?, defaultValue? }`
- `FeatureFlagResult` — `{ key, enabled, source, reason }` โดย `source` เป็น `'store'`, `'default_fallback'` หรือ `'error_fallback'`
- `FeatureFlagStore` — สัญญาของ store: `getFlag(key, context?): Promise<StoredFlag | null>`
- `FlagTargetingRule` — rule แบบเทียบตรงตัวหนึ่งข้อ: `tenantId`, `userId`, `environment` (ทางเลือก) พร้อม `enabled` ที่บังคับ
- `MemoryFeatureFlagStore` — `FeatureFlagStore` บวก `setFlag(key, flag)`, `removeFlag(key)`, `clear()`
- `SanitizedFlagEvaluationInfo` — สิ่งที่ `onEvaluation` ได้รับ: `key`, `context` ที่ผ่านการตัดข้อมูลแล้ว, `result`, `durationMs`
- `StoredFlag` — ระเบียนธงที่เก็บไว้: `key`, `enabled`, `rules` (ทางเลือก), `metadata` (ทางเลือก)

## tests — การทดสอบ

รันชุดทดสอบจากในโฟลเดอร์โมดูล:

    npm test

ผลที่วัดได้จริงในรอบแพ็กเกจนี้ (2026-09-27) `npm test` จบด้วย exit code 0 และรายงานว่า:

- 7 ไฟล์ทดสอบ 142 tests ไม่มีตัวใดล้มเหลว — 130 tests เป็นชุดเดิมใน 6 ไฟล์ (ไม่ได้แก้และไม่ได้ลบตัวใด)
  และ 12 tests ใน `tests/docs-contract.test.ts` เป็นตัวป้องกันสัญญาเอกสาร ซึ่งเป็นไฟล์ทดสอบไฟล์เดียวที่เพิ่มในรอบนี้
- `npm test` คือคำสั่ง `vitest run`
- `tests/docs-contract.test.ts` อ่าน `README.md`, `README.th.md`, `MODULE.md`, `package.json`, `index.ts`,
  `core/error.ts` และ `examples/run.ts` จากไฟล์จริงบนดิสก์ ถ้าหัวข้อ README ที่บังคับหายไป กฎการติดตั้งผิด
  มีการเขียนถึง export ที่ entry point ไม่มี หรือ marker ของตัวอย่างหายไป ชุดทดสอบจะ fail
- `npm run typecheck` คือคำสั่ง `tsc --noEmit` ซึ่งรวม `**/*.ts` (รวม examples และ tests) และจบด้วย exit code 0

## strengths — จุดแข็ง

- ไม่มี runtime dependency เลย — `package.json` ไม่มีฟิลด์ `dependencies` และไม่มีไฟล์ใดในโมดูล import `node:*`
  ดังนั้น bundle ของคุณจะได้เพียงโค้ดโมดูลเท่านั้น dependency ที่ประกาศไว้มีแต่ของสำหรับพัฒนา (`typescript`, `vitest`, `vite-node`)
  เพื่อรัน test และ example เท่านั้น
- ใช้ค่า fallback ที่กำหนดผลได้แทนการ crash — `core/evaluator.ts` จับ key ที่ไม่ถูกต้อง, store ที่โยน exception
  และค่าที่ผิดรูปแบบ แล้วคืนค่าตามลำดับที่ล็อกไว้ `query.defaultValue` → `config.defaultFallback` → `false`
  มี test ยืนยันใน `tests/unit/evaluator.test.ts` และ `tests/smoke.test.ts`
- โมเดล error แบบปิดและมี type — ทั้ง 3 code (`FLAG_KEY_INVALID`, `FLAG_PROVIDER_ERROR`, `FLAG_VALUE_INVALID`)
  รวมอยู่ใน union เดียวใน `core/error.ts` จึงเขียนเงื่อนไขบน `error.code` ที่ส่งเข้า `onError` ได้โดยไม่ต้อง parse ข้อความ
- client มีท่อการประเมินเดียวเท่านั้น — `isEnabled()` เรียก `getFlag()` แล้วคืน `result.enabled` การตรวจ ความถูกต้อง,
  การอ่าน store, targeting, fallback และ hook จึงแยกกันไม่ได้ระหว่างสองเมธอด มี test ยืนยันใน `tests/unit/client.test.ts`
- payload ของ hook ถูกตัดข้อมูลอ่อนไหวก่อนถึงมือคุณ — `core/evaluator.ts` ตัดฟิลด์ `attributes` ออกจาก context
  ที่ส่งให้ `onEvaluation` ข้อมูลดิบของผู้ใช้จึงไม่ไปถึง logging sink มี test ยืนยันใน `tests/unit/evaluator.test.ts`
- hook ที่พังถูกแยกออก — ทุกการเรียก hook ถูกครอบด้วย `try`/`catch` ดังนั้น callback telemetry หรือ alerting ที่พัง
  เปลี่ยนหรือทำให้การประเมินล้มไม่ได้ มี test ยืนยันใน `tests/unit/error.test.ts` และเห็นได้จาก `npm run example`
- ได้ซอร์สเต็ม ไม่ใช่กล่องดำ — คัดลอกทั้งโมดูลรวม test และตัวอย่างการต่อที่มีคอมเมนต์อธิบาย และอ่าน/แก้ได้ทุกบรรทัด

## runtime — สภาพแวดล้อมที่ต้องมี

- runtime dependency: ไม่มี — `package.json` ไม่มีฟิลด์ `dependencies` โค้ดที่ส่งมอบไม่ต้องใช้แพ็กเกจบุคคลที่สามเลย
- Node builtin ที่ใช้: ไม่มี — โมดูลไม่ import `node:*` และการค้นหา `node:` ในไฟล์ `.ts` ของโมดูลไม่พบผลลัพธ์
- API ของแพลตฟอร์มที่ใช้: มาตรฐานเว็บเท่านั้น — `Map` สำหรับ memory store, `Date` สำหรับวัดเวลาการประเมิน
  และ `Promise` สำหรับสัญญาของ store ที่เป็น asynchronous
- รันได้ที่ไหน: ทุกที่ที่รันไทม์ JavaScript/TypeScript มี API เหล่านี้ — Cloudflare Workers, เบราว์เซอร์รุ่นใหม่, Deno, Bun และ Node.js 18 ขึ้นไป
  โมดูลเป็น ESM ปกติ โดย relative import มีสกุลไฟล์ `.js` และ type-check ผ่านภายใต้ `moduleResolution: Bundler`
- ที่รัน example ได้: `npm run example` ใช้ `vite-node` ซึ่งเป็นเครื่องมือสำหรับพัฒนาเท่านั้น ต้องติดตั้ง development dependency ของโมดูลก่อน
  และไม่ถูกนับเข้า bundle ของแอปคุณ
- ที่ใช้ไม่ได้: งานที่ต้องอาศัย store หรือระบบที่โมดูลนี้ไม่มี — ไม่มีการ persist ไม่มีการซิงก์จากระยะไกล ไม่มีเครื่องยนต์ทำ percentage rollout
  ไม่มี admin UI และไม่มีสถานะข้าม process สิ่งเหล่านั้นต้องมาจาก `FeatureFlagStore` ที่คุณฉีดเข้ามา หรือจากระบบอื่นเลย
