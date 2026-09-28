# Enterprise Features — เอกสารภาษาไทย

โมดูลนี้ให้ primitive สำหรับ resiliency และ tracing ที่ทำงานภายใน process เดียวกัน ประกอบด้วย
`CircuitBreaker` พร้อม typed error และสัญญา `Tracer` แบบขั้นต่ำที่มี implementation มาให้สองตัว
คือ `NoopTracer` และ `MemoryTracer` — โมดูลนี้ไม่ผูกกับ framework ใด ไม่มี network client และ
ไม่มี telemetry SDK ตัว host เป็นผู้ส่งงาน async เข้าไปเองและเลือก tracer เอง

## install — การติดตั้ง

โมดูลนี้ใช้วิธี copy-and-own คือตัวซอร์สเองคือของที่ส่งมอบ ไม่มีแพ็กเกจบน npm ให้ติดตั้งและ
ไม่เพิ่ม runtime dependency ให้แอปของคุณ

1. คัดลอกโฟลเดอร์โมดูล `enterprise-features/` ทั้งโฟลเดอร์ไปไว้ในโปรเจกต์ของคุณ เช่นไปที่
   `src/modules/enterprise-features/` ต้องคัดลอกทั้งโมดูล (`index.ts`, `core/`, `examples/`,
   `tests/`, `package.json`, `package-lock.json`, `tsconfig.json`) ไม่ใช่คัดลอกเฉพาะบางไฟล์
2. เข้าไปในโฟลเดอร์โมดูลที่คัดลอกมาแล้วรัน `npm ci` เพื่อติดตั้ง toolchain ที่ใช้รันเทสและ
   ตัวอย่าง (`vitest`, `vite-node`, `typescript`) จาก lockfile ที่แนบมาให้
3. import จาก entry point ของสำเนาที่คุณคัดลอกเอง (`./modules/enterprise-features/index.js`)
   แล้วปรับแก้เฉพาะสำเนานั้น ห้าม import ข้ามโปรเจกต์จากโฟลเดอร์ Module Hub

ต้องใช้ Node.js 18 ขึ้นไปพร้อม npm สำหรับ toolchain และต้องมี bundler หรือ runner ที่รัน
TypeScript ได้สำหรับตัวแอป (ดูหัวข้อ runtime)

## quickstart — เริ่มใช้งานเร็ว

หลังทำครบสามขั้นตอนด้านบน นี่คือทางที่สั้นที่สุดจากโมดูลที่คัดลอกมาแล้วไปถึงการเรียกที่สำเร็จ
ครั้งแรก — เอาการเรียก async หนึ่งตัวไปห่อด้วย breaker และบันทึก span หนึ่งอัน

```ts
// your-app/src/resiliency.ts   (โมดูลถูกคัดลอกไปที่ your-app/src/modules/enterprise-features/)
import { CircuitBreaker, MemoryTracer } from './modules/enterprise-features/index.js';

const breaker = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 5_000 });
const tracer = new MemoryTracer();

// การเรียก upstream ของคุณเอง — โมดูลนี้ไม่ทำ network I/O ให้
async function callUpstreamCatalog(): Promise<string[]> {
  return ['sku-1', 'sku-2'];
}

export async function syncCatalog(tenantId: string): Promise<string[]> {
  const span = tracer.startSpan('sync-catalog');
  span.setAttribute('tenantId', tenantId);
  try {
    return await breaker.execute(() => callUpstreamCatalog());
  } finally {
    span.end();
  }
}
```

ขณะที่ circuit อยู่ในสถานะ `CLOSED` เมธอด `execute()` จะส่งค่าที่คุณคืนกลับออกไปตามปกติ
เมื่อ circuit เปิดเป็น `OPEN` จะ throw `CircuitBreakerError` ที่มี code `CIRCUIT_OPEN` และ
ระหว่างสถานะ `HALF_OPEN` จะยอมให้ probe เข้าไปได้ทีละหนึ่งตัวเท่านั้น

คำสั่งที่ใช้รันตัวอย่างที่แนบมา จากในโฟลเดอร์โมดูล:

```bash
npm run example
```

## example — ตัวอย่างที่รันได้

โมดูลมีตัวอย่างที่รันได้หนึ่งไฟล์คือ `examples/run.ts` เริ่มด้วยคำสั่งเดียว

```bash
npm run example
```

ผลลัพธ์ที่คาดหมาย — npm จะพิมพ์บรรทัด `npm notice run …` ของตัวเองก่อน จากนั้นโปรแกรมจะพิมพ์
เจ็ดบรรทัดนี้แล้วจบด้วย exit code 0

```text
memoryTracer recordedSpans=2 attributeKeys=tenantId,attempt,stage endedSpanMutationThrew=true
noopTracer recordedSpans=0 spanContractCallable=true
breaker consecutiveFailures=3 stateAfterFailures=OPEN openFailures=3
blockedCall code=CIRCUIT_OPEN operationInvoked=false
halfOpen state=HALF_OPEN probeResult=recovered concurrentProbeCode=HALF_OPEN_PROBE_IN_PROGRESS stateAfterProbeSuccess=CLOSED
invalidConfig code=INVALID_CONFIG
entryPoint runtimeExports=4 names=CircuitBreaker,CircuitBreakerError,MemoryTracer,NoopTracer
EXAMPLE_RESULT: OK runtimeExports=4 names=CircuitBreaker,CircuitBreakerError,MemoryTracer,NoopTracer recordedSpans=2 attributeKeys=tenantId,attempt,stage breakerStates=CLOSED>OPEN>HALF_OPEN>CLOSED blockedCode=CIRCUIT_OPEN concurrentProbeCode=HALF_OPEN_PROBE_IN_PROGRESS invalidConfigCode=INVALID_CONFIG
```

สิ่งที่ตัวอย่างนี้พิมพ์ออกมา: `MemoryTracer` บันทึก span ที่จบแล้ว 2 อัน พร้อมคีย์ attribute
`tenantId,attempt,stage` และการแก้ span ที่จบไปแล้วทำให้ throw ส่วน `NoopTracer` ใช้สัญญา
span เดียวกันแต่บันทึกไว้ 0 อัน จากนั้นความล้มเหลวติดกันสามครั้งพา breaker จาก `CLOSED` ไป
`OPEN` ด้วยจำนวน failure 3 ครั้ง การเรียกขณะเปิดอยู่ throw code `CIRCUIT_OPEN` และไม่เรียก
ฟังก์ชันที่ส่งเข้าไปเลย หลังพ้นเวลารอ สถานะเป็น `HALF_OPEN` probe ตัวที่สองที่เข้ามาพร้อมกัน
throw code `HALF_OPEN_PROBE_IN_PROGRESS` probe ที่ได้รับอนุญาตคืนค่า `recovered` แล้ว circuit
กลับไปปิด และการตั้งค่าที่ไม่ถูกต้อง throw code `INVALID_CONFIG` ตัวอย่างนี้ไม่ต่อเน็ตเวิร์ก
ไม่เขียนไฟล์ ไม่ใช้ความลับ และไม่อ่านค่าจาก environment

## limitations — ข้อจำกัด

- สถานะของ breaker อยู่ในหน่วยความจำและแยกต่อ instance หนึ่ง `new CircuitBreaker(...)` แต่ละตัว
  เก็บ state ไว้ในฟิลด์ของตัวเอง (`core/circuit-breaker.ts:20-24`) ดังนั้นสอง instance สอง
  process สองเครื่อง หรือสอง serverless instance จะไม่แชร์จำนวน failure กันเลย รีสตาร์ทแล้ว
  circuit รีเซ็ต และแต่ละ worker จะเปิดหรือปิดแยกกันได้
- ไม่มี OpenTelemetry adapter และไม่ใช่ distributed tracing สัญญา `Tracer`/`Span`
  (`core/types.ts:26-33`) เป็นสัญญาภายใน process เท่านั้น ไม่มีการส่ง context ข้าม service และ
  ไม่มี lifecycle ของ exporter ตัวที่แนบมาให้มีแค่ `NoopTracer` กับ `MemoryTracer`
- `MemoryTracer` เก็บ span ที่จบแล้วทั้งหมดไว้ใน array ในหน่วยความจำโดยไม่จำกัดขนาด
  (`core/tracer.ts:15,33`) เหมาะกับเทสและการตรวจสอบในเครื่อง ไม่เหมาะกับทราฟฟิกจริงเพราะไม่มี
  การไล่span ออก ไม่มี sampling และไม่มีเพดานจำนวน
- ฟิลด์ `monitorIntervalMs` ประกาศอยู่ใน `CircuitBreakerConfig` (`core/types.ts:6`) แต่ตัว
  implementation ไม่เคยอ่านค่านี้ จึงไม่มี loop เฝ้าดูเบื้องหลัง การเปลี่ยนสถานะถูกประเมินแบบ
  lazy เฉพาะเมื่อคุณเรียก `execute()` หรือ `getStatus()` เท่านั้น circuit ที่เปิดอยู่จะไม่
  เปลี่ยนเป็น `HALF_OPEN` เองตามเวลา
- entry point เป็น TypeScript ที่ใช้ specifier ลงท้าย `.js` เทสและตัวอย่างรันผ่าน
  vitest/vite-node ส่วน Node.js ESM เปล่า ๆ import `index.ts` ตรง ๆ ไม่ได้ (ดูหัวข้อ runtime)

## api — รายการที่ export

ทุกอย่าง export ผ่าน entry point `index.ts` ของโมดูล ห้าม import ไฟล์ย่อยโดยตรง

- `CircuitBreaker` — ตัว breaker เอง ใช้ `new CircuitBreaker(config)` แล้วเรียก `execute(fn)`
  และ `getStatus()`
- `CircuitBreakerError` — คลาส error ที่ `execute()` throw ออกมา พร้อมฟิลด์ `code` และ `message`
- `NoopTracer` — `Tracer` ที่ทำตามสัญญา span ครบแต่ไม่เก็บอะไรเลย
- `MemoryTracer` — `Tracer` ที่เก็บ span ที่จบแล้วไว้ในหน่วยความจำ มี `startSpan()`,
  `getCompletedSpans()` และ `clear()`
- `CircuitState` (type) — `'CLOSED' | 'OPEN' | 'HALF_OPEN'`
- `CircuitBreakerConfig` (type) — `{ failureThreshold, resetTimeoutMs, monitorIntervalMs? }`
- `CircuitBreakerStatus` (type) — `{ state, failures, lastFailureTime?, nextAttemptTime? }`
- `CircuitBreakerErrorCode` (type) — `'CIRCUIT_OPEN' | 'HALF_OPEN_PROBE_IN_PROGRESS' |
  'INVALID_CONFIG'`
- `TracerConfig` (type) — `{ serviceName, environment?, version? }`
- `SpanAttributeValue` (type) — `string | number | boolean`
- `Span` (type) — `{ setAttribute(key, value), end() }`
- `Tracer` (type) — `{ startSpan(name) }` เป็นจุดต่อขยายสำหรับ adapter ของคุณเอง
- `RecordedSpan` (type) — `{ name, startedAt, endedAt, durationMs, attributes }` ซึ่ง
  `MemoryTracer` จะ freeze ให้

## tests — เทส

รันชุดเทสจากในโฟลเดอร์โมดูลด้วยคำสั่ง

```bash
npm test
```

ผลที่วัดได้ในรอบนี้: `npm test` รายงาน `Test Files 3 passed (3)` และ `Tests 23 passed (23)`
คือ 23 tests ในสามไฟล์ เท่านั้นคือชุดเทสเดิมของโมดูล (16 tests: `circuit-breaker.test.ts`
12 tests และ `tracer.test.ts` 4 tests) บวกกับ 7 tests ของสัญญาเอกสารใน
`tests/docs-contract.test.ts` ส่วนการตรวจชนิดเป็นอีกด่านหนึ่ง

```bash
npm run typecheck
```

## strengths — จุดแข็ง

- error มีชนิดจริงไม่ใช่สตริง: `CircuitBreakerError` มีฟิลด์ `code` ที่เป็นชนิด
  `CircuitBreakerErrorCode` ทำให้ `CIRCUIT_OPEN`, `HALF_OPEN_PROBE_IN_PROGRESS` และ
  `INVALID_CONFIG` ถูกตรวจโดยคอมไพเลอร์ — ดู `core/circuit-breaker.ts:3-8` และ assertion ใน
  `tests/unit/circuit-breaker.test.ts`
- `HALF_OPEN` ยอมให้ probe ทีละตัว: probe ที่เข้ามาพร้อมกันถูกปฏิเสธด้วย
  `HALF_OPEN_PROBE_IN_PROGRESS` และ probe ที่สำเร็จจะปิด circuit — มีเทส "rejects concurrent
  half-open probes" และบรรทัดผลลัพธ์ของตัวอย่างยืนยัน
- ตรวจ config ใน constructor: `failureThreshold` หรือ `resetTimeoutMs` ที่ผิดจะล้มทันทีด้วย
  `INVALID_CONFIG` ไม่ใช่รอไปพังตอนเรียกครั้งแรก — `core/circuit-breaker.ts:10-17` และมีเทส
  invalid-config แบบ parameterised หกกรณีใน `tests/unit/circuit-breaker.test.ts`
- fail-fast ทำงานจริง ไม่ใช่แค่คำโฆษณา: ขณะเปิดอยู่ `execute()` throw ก่อนเรียกฟังก์ชันของคุณ
  ซึ่งตัวอย่างสังเกตได้เป็น `operationInvoked=false` และ unit test ยืนยันด้วย spy
  (`expect(blocked).not.toHaveBeenCalled()`)
- ไม่มี runtime dependency และไม่มี `node:*` เลยในซอร์ส: `package.json` ไม่มี `dependencies`
  และ `index.ts` กับ `core/` import กันเองเท่านั้น — วัดตอนรันแล้ว entry point export ค่าจริง
  สี่ตัวคือ `CircuitBreaker,CircuitBreakerError,MemoryTracer,NoopTracer`

## runtime — สภาพแวดล้อมที่รันได้

- runtime dependency: ไม่มี `package.json` ประกาศแค่ devDependencies (`typescript`,
  `vite-node`, `vitest`) ซึ่งต้องใช้เพื่อรันเทสและตัวอย่างเท่านั้น ไม่ได้ใช้ตอนเอาโมดูลไปใช้
- node builtin ที่โมดูลใช้: ไม่มี `index.ts` และ `core/` ไม่มี import `node:*` ไม่มีการอ่าน
  `process.env` และไม่มีการแตะไฟล์ ใช้แค่คลาส อ็อบเจกต์ `Date.now()` และ `Promise`
- รันที่ไหนได้: ทุกที่ที่รัน TypeScript ES2022 ผ่าน bundler หรือ runner ที่ตั้ง
  `moduleResolution: Bundler` — แอป Node.js ที่ build ด้วย Vite/esbuild/tsc และโปรเจกต์
  edge/worker ที่ใช้ bundler เพราะ core ไม่แตะ API ที่มีแต่ใน Node
- รันที่ไหนไม่ได้: Node.js ESM เปล่า ๆ import entry point ตรง ๆ ไม่ได้ เพราะ `index.ts` เป็น
  TypeScript และ specifier ที่อ้างไฟล์ `.ts` ใช้ชื่อ `.js` การรันไฟล์ที่ import มันด้วย
  `node --experimental-strip-types` จะล้มด้วย `ERR_MODULE_NOT_FOUND: Cannot find module
  …\index.js` ให้ใช้ `npm test`, `npm run example` (vitest/vite-node) หรือ bundler ของคุณแทน
- การตรวจชนิดใช้ `tsconfig.json` ที่แนบมา (`tsc --noEmit`, `target ES2022`, `module ES2022`,
  `moduleResolution Bundler`, `strict`) ให้รัน `npm run typecheck` ในโฟลเดอร์โมดูลที่คัดลอก
  ก่อน deploy
