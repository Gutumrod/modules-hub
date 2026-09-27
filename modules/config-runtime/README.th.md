# Config Runtime (คอนฟิกและรันไทม์)

โมดูล TypeScript ขนาดเล็กสำหรับจัดการคอนฟิกของโปรเจกต์ โมดูลนี้ไม่มี dependency ตอนใช้งานจริง
โฮสต์เป็นผู้อ่าน environment ของตัวเอง แล้ว inject ค่าดิบเข้ามา โมดูลมีหน้าที่เดียวคือ
ตรวจสอบ (validate) → แปลงชนิด (type-coerce) → ใส่ค่าเริ่มต้น → ปิดบังค่า secret → คืนค่าเป็น
ออบเจ็กต์ที่แก้ไขไม่ได้ (frozen)

โมดูลไม่แกะ environment เองเลย ไม่มี business logic และไม่พ่วง schema framework ใด ๆ

## install — การติดตั้ง

โมดูลนี้ใช้วิธี copy-and-own คือตัว source เองคือสิ่งที่ส่งมอบ ไม่มีแพ็กเกจ npm ที่เผยแพร่บน
registry ให้ติดตั้ง และโมดูลไม่มี runtime dependency จึงไม่เพิ่มอะไรเข้าไปใน dependency ของแอปคุณ

1. คัดลอกโฟลเดอร์โมดูล `config-runtime/` ทั้งโฟลเดอร์ไปไว้ในโปรเจกต์ของคุณ เช่น
   `src/modules/config-runtime/` ต้องก๊อปทั้งโฟลเดอร์ (`core/`, `tests/`, `examples/`,
   `integration.example.ts`, `MODULE.md`, `DESIGN.md`, `VERSION`, `package.json`,
   `package-lock.json`, `tsconfig.json`, `vitest.config.ts`) ไม่ใช่ก๊อปเฉพาะบางไฟล์
2. เข้าไปในโฟลเดอร์ที่ก๊อปมาแล้วรัน `npm ci` เพื่อติดตั้ง dev toolchain ที่ใช้รันเทสและตัวอย่าง
   (vitest, vite-node, typescript และเครื่องมือ coverage/mutation) จาก `package-lock.json`
   ที่แนบมา ขั้นนี้จำเป็นเฉพาะตอนรันเทสและตัวอย่าง ไม่ได้ใช้ตอนนำโมดูลไปใช้ในแอป
3. import จาก entry point สาธารณะของสำเนาที่คุณก๊อปเอง
   (`./modules/config-runtime/core/index.js`) และแก้ไขเฉพาะสำเนานั้น
   ห้าม import ข้ามโปรเจกต์จากโฟลเดอร์ต้นฉบับ

ขั้นที่ 2 ต้องใช้ Node.js พร้อม npm (รอบนี้รันด้วย Node.js v22.23.2 และ npm 12.0.2)
ส่วนแอปของคุณต้องมี bundler หรือตัวรัน TypeScript — ดูหัวข้อ runtime

## quickstart — เริ่มใช้งานเร็ว

เส้นทางสั้นที่สุดจากโมดูลที่ก๊อปแล้วไปถึงการเรียกใช้งานครั้งแรกสำเร็จ โฮสต์เป็นคนประกาศ schema
และอ่าน environment ของตัวเอง โมดูลไม่ได้อ่านอะไรเองเลย

```ts
// your-app/src/config.ts  (โมดูลถูกก๊อปไปไว้ที่ your-app/src/modules/config-runtime/)
import {
  defineConfig,
  parseConfig,
  redactConfig,
} from './modules/config-runtime/core/index.js';

// 1. ประกาศ schema ครั้งเดียว defineConfig จะตรวจรูป schema ให้ตั้งแต่ตอนประกาศ
const schema = defineConfig({
  dbUrl: { required: true, validate: { type: 'url' } },
  apiKey: { required: true, secret: true, validate: { type: 'string' } },
  debug: { default: 'false', validate: { type: 'boolean' } },
  maxRetries: { default: '3', validate: { type: 'integer', min: 1, max: 10 } },
});

// 2. โฮสต์อ่าน env ของตัวเอง แล้ว inject ค่าดิบเข้ามา โมดูลไม่อ่าน process.env เอง
const config = parseConfig(schema, {
  dbUrl: process.env.DB_URL,
  apiKey: process.env.API_KEY,
  debug: process.env.DEBUG,
  maxRetries: process.env.MAX_RETRIES,
});

// 3. config ผ่านการตรวจ แปลงชนิดแล้ว และถูก freeze ใช้ต่อได้เลย
console.log(config.maxRetries); // number (ได้ 3 เมื่อไม่ได้ตั้ง MAX_RETRIES)
console.log(config.debug); // boolean ที่แปลงมาจากสตริง "true"/"false"

// 4. สำหรับ log เท่านั้น redactConfig จะปิดบังค่า secret ให้
console.log(redactConfig(config, schema)); // apiKey จะแสดงเป็น "[REDACTED]"
```

คำสั่งรันตัวอย่างที่แนบมา (รันจากในโฟลเดอร์โมดูล)

```bash
npm run example
```

## example — ตัวอย่างที่รันได้

โมดูลแนบตัวอย่างที่รันได้หนึ่งตัวคือ `examples/run.ts` เปิดด้วยคำสั่งเดียว

```bash
npm run example
```

ตัวอย่างนี้เล่นเป็นโฮสต์เอง คือประกาศ schema แล้ว inject ค่าดิบที่เขียนไว้ในไฟล์ (ไม่อ่าน
environment เลย) แล้วพิมพ์สิ่งที่วัดได้จริง ผลลัพธ์ที่ต้องได้ (npm จะพิมพ์บรรทัด
`npm notice run ...` ของตัวเองก่อน แล้วโปรแกรมจะพิมพ์ 5 บรรทัดนี้)

```text
parsed keys=4 frozen=true debug=boolean:true maxRetries=number:7 region=omitted
redacted apiKey=[REDACTED] dbUrlUnchanged=true revalidatedKeys=4
runtime environment=production runtime=cloudflare-workers region=unknown
error codes=CONFIG_MISSING,CONFIG_TYPE_INVALID,CONFIG_TYPE_INVALID,CONFIG_VALUE_OUT_OF_RANGE,RUNTIME_CONTEXT_INVALID
EXAMPLE_RESULT: OK parsedKeys=4 frozen=true redactedApiKey=[REDACTED] errorCodes=CONFIG_MISSING|CONFIG_TYPE_INVALID|CONFIG_TYPE_INVALID|CONFIG_VALUE_OUT_OF_RANGE|RUNTIME_CONTEXT_INVALID
```

สิ่งที่ตัวอย่างทำ: `parseConfig` คืนมา 4 คีย์ แปลง `debug` เป็น `boolean:true` และ `maxRetries`
เป็น `number:7` ปล่อย field `region` ที่เป็น optional และไม่มีค่าเริ่มต้นให้ถูกตัดออก
และคืนออบเจ็กต์ที่ถูก freeze ตัว `redactConfig` แทนค่า secret `apiKey` ด้วย `[REDACTED]`
โดยที่ `dbUrl` ที่ไม่ใช่ secret ยังค่าเดิม และการ re-validate คอนฟิกที่ผ่านแล้วได้ 4 คีย์เท่าเดิม
พร้อมกับเส้นทาง error จริง 5 เส้นที่ให้รหัส error ตามที่โมดูลประกาศไว้ครบทั้ง 5 รหัส

## limitations — ข้อจำกัด

- รองรับเฉพาะ field แบบ scalar ชั้นเดียว ค่าหนึ่ง field ใช้ validator ตัวเดียวจาก union `Validator`
  จึงยังไม่รองรับ object ซ้อน, array หรือ object schema ในเวอร์ชันนี้ ค่าที่ซ้อนอยู่จะผ่านไปเฉย ๆ
  (ถ้า field นั้นไม่ตั้ง `validate`) หรือไม่ก็ fail ตอนแปลงชนิด ดู `core/types.ts` และหัวข้อ
  non-goals ใน `DESIGN.md`
- โมดูลไม่อ่านคอนฟิกจาก environment เลย ใน `core/` ไม่มีการอ้าง `process.env`, `env` หรือ
  `globalThis` จึงโหลดไฟล์ `.env` หรือ platform binding เองไม่ได้ โฮสต์ต้องอ่าน env ของตัวเอง
  แล้วส่งค่าดิบเข้า `parseConfig(schema, hostConfig)`
- การตรวจทำงานบนค่าดิบที่ inject เข้ามา และการแปลง boolean เป็นแบบ strict field แบบ boolean
  รับเฉพาะสตริง `"true"` / `"false"` หรือ boolean จริงเท่านั้น ส่วน `"yes"`, `"1"`, `"0"`, `"on"`
  และ `"off"` จะถูกปฏิเสธด้วย `CONFIG_TYPE_INVALID` และ `"false"` ไม่มีทางกลายเป็น `true`
- การปิดบัง secret เป็นแบบตื้น (shallow) `redactConfig` คัดลอกเฉพาะชั้นบนสุด ดังนั้น secret ที่ซ่อน
  อยู่ในออบเจ็กต์ของ field ที่ไม่ใช่ secret จะถูกคัดลอกแบบอ้างอิงและไม่ถูกปิดบัง มันเป็นตัวช่วย
  ปิดบังสำหรับคอนฟิกแบบแบน ไม่ใช่ตัวล้างข้อมูลแบบลึก และมีเทสใน `tests/config.test.ts` ยืนยัน
  พฤติกรรมนี้ไว้
- error ที่โยนออกมาเป็นออบเจ็กต์ธรรมดา ไม่ใช่ `Error` `parseConfig`, `validateConfig` และ
  `createRuntimeContext` โยนค่า `ConfigError` รูป `{ code, field, message }` ดังนั้น
  `instanceof Error` จะเป็น false และต้องแยกแยะด้วยค่า `code`
- การตรวจสอบเป็นแบบ synchronous เท่านั้น ไม่มี async validator จึงเขียน validator ที่ต้องรอ I/O
  ไม่ได้
- entry point เป็น TypeScript Node เปล่า ๆ รัน `core/index.ts` ตรง ๆ ไม่ได้ ต้องมี bundler
  หรือตัวรันที่รองรับ TypeScript (vitest/vite-node ที่เทสและตัวอย่างของโมดูลนี้ใช้) หรือมีขั้นตอน
  compile ก่อน — ดูหัวข้อ runtime

## api — API ที่ export

ทุกอย่าง export มาจาก entry point สาธารณะ `core/index.ts` เท่านั้น ห้าม import จากไฟล์ย่อยโดยตรง

- `defineConfig(schema)` — ตรวจรูป schema, freeze แล้วคืน `ConfigSchema` ที่ตัวอื่นรับ ถ้า schema ผิด
  จะโยน `CONFIG_INVALID` ตั้งแต่ตอนประกาศ
- `parseConfig(schema, hostConfig)` — entry point หลัก: validate + แปลงชนิด + ใส่ค่าเริ่มต้น +
  freeze ถ้า field ใดผิดจะโยน `ConfigError` และไม่ mutate `hostConfig`
- `validateConfig(schema, config)` — ตรวจและแปลงชนิดเหมือน `parseConfig` แต่ไม่ใส่ค่าเริ่มต้น
  ใช้เมื่อมีคอนฟิกที่ typed แล้วอยากตรวจซ้ำ
- `redactConfig(config, schema)` — คืนออบเจ็กต์ใหม่ โดย field ที่ `secret: true` ถูกแทนด้วยสตริง
  `"[REDACTED]"` และไม่ mutate ตัว input
- `createRuntimeContext(partial)` — normalize และ freeze runtime context พร้อมใส่ค่าเริ่มต้น
- `ConfigField` (type) — field หนึ่งตัว: `{ required?, default?, secret?, validate? }`
- `Validator` (type) — union ของการตรวจ: `string`, `integer` (มี `min`/`max` ได้),
  `positiveNumber` (มี `min`/`max` ได้), `boolean`, `url`, `enum` (`values`), `custom` (`fn`)
- `ConfigSchema` (type) — `Record<string, ConfigField>` ที่ freeze แล้ว ซึ่ง `defineConfig` คืนมา
- `ParsedConfig` (type) — `Readonly<Record<string, unknown>>` ที่ freeze จาก parse/validate
- `RedactedConfig` (type) — `Readonly<Record<string, unknown>>` ที่ freeze พร้อม secret ที่ปิดบังแล้ว
- `RuntimeContext` (type) — `{ environment?, runtime?, region?, requestId?, correlationId?, metadata? }`
- `ConfigError` (type) — รูปที่โยนออกมา `{ code, field, message }` โดย `message` ไม่มีค่า secret
- `ConfigErrorCode` (type) — รหัส error ทั้ง 5 ตัวด้านล่าง

รหัส error ที่โมดูลโยน (ทั้งหมดเป็นค่า `ConfigError.code` ใน `core/types.ts`): `CONFIG_MISSING`
(field ที่ `required: true` หายไป), `CONFIG_INVALID` (schema ผิด หรือ custom validator คืน `false`
หรือคืนข้อความ), `CONFIG_TYPE_INVALID` (แปลงชนิดไม่ผ่าน), `CONFIG_VALUE_OUT_OF_RANGE` (ค่า numeric
อยู่นอกช่วง `[min, max]`) และ `RUNTIME_CONTEXT_INVALID` (field ที่ส่งให้ `createRuntimeContext`
ชนิดผิด)

## tests — การทดสอบ

รันชุดเทสจากในโฟลเดอร์โมดูลด้วยคำสั่ง

```bash
npm test
```

ผลที่วัดได้จริงในรอบการแพ็กเกจนี้ `npm test` ออกด้วยรหัส 0 และรายงาน `Test Files 2 passed (2)`
และ `Tests 95 passed (95)` คือ 95 tests ใน 2 ไฟล์ ประกอบด้วย 88 tests เดิมของโมดูลใน
`tests/config.test.ts` รวมกับอีก 7 tests ใน `tests/docs-contract.test.ts` ที่คอยป้องกันเอกสาร
ชุดนี้ ส่วนการตรวจ type เป็นอีกด่านหนึ่ง

```bash
npm run typecheck
```

## strengths — จุดแข็ง

- error มีโครงสร้างและไม่รั่วค่า secret field ที่ fail จะได้ `{ code, field, message }` พร้อมรหัส
  หนึ่งในห้ารหัส และข้อความอ้างแค่ชื่อ field เท่านั้น `tests/config.test.ts` ยืนยันว่า error ที่
  serialize แล้วของ secret field ที่ fail ไม่มีค่า secret อยู่ และออบเจ็กต์ error ไม่มีคีย์อื่น
  นอกจาก `code`, `field` และ `message`
- รับมือ input ที่ไม่น่าเชื่อถืออย่างตั้งใจ อ่าน field จาก own enumerable property เท่านั้น
  ปฏิเสธ `__proto__` / `constructor` / `prototype` ใน schema และข้ามใน config และสร้าง output
  เป็นออบเจ็กต์แบบ null-prototype เทส prototype pollution ยืนยันว่า `Object.prototype`
  ไม่ถูกแตะเลย และ `Object.getPrototypeOf(result)` เป็น `null`
- ผลลัพธ์แก้ไขไม่ได้ ทุกฟังก์ชัน (`parseConfig`, `validateConfig`, `redactConfig`,
  `createRuntimeContext`) คืนออบเจ็กต์ที่ freeze ซึ่งยืนยันด้วย `Object.isFrozen` ใน
  `tests/config.test.ts` และ input ก็ไม่ถูก mutate เช่นกัน ซึ่งชุดเทสตรวจไว้ด้วย
- การแปลง boolean เป็นแบบ strict และถูกล็อกด้วยเทส: `"false"` ต้องไม่กลายเป็น `true` และ
  `"yes"`, `"1"`, `"0"`, `"on"`, `"off"` ต้องโยน `CONFIG_TYPE_INVALID` ทั้งหมด
- ไม่มี runtime dependency และไม่มี import `node:*` เลย `package.json` ไม่มี `dependencies`
  และ `core/` import แต่ไฟล์ของตัวเอง ไม่มี `process.env`, ไม่มี `globalThis`, ไม่แตะไฟล์ system
  และไม่ใช้ crypto โมดูลจึงไม่เพิ่มภาระให้รันไทม์ของคุณ
- การตรวจ type เป็นด่านบังคับ ไม่ใช่ตัวเลือก `tsc --noEmit` (`npm run typecheck`) ครอบทั้ง `core/`,
  `tests/` และตัวอย่าง และรอบนี้จบด้วยรหัส 0

## runtime — รันไทม์และการนำไปใช้

- Runtime dependency: ไม่มี `package.json` มีเฉพาะ devDependencies คือ `vitest`,
  `@vitest/coverage-v8`, `typescript`, `vite-node` และ `@stryker-mutator/*` อีกสามตัว
  ซึ่งใช้รันเทส ตัวอย่าง และ mutation check ไม่ได้ใช้ตอนเรียกโมดูล
- Node builtin ที่โมดูลใช้: ไม่มี ใน `core/` ไม่มี import `node:*` เลย source ใช้แค่ `URL`,
  `Object`, `Set`, `Number` และ `Math` และไม่อ่าน `process.env`, `env` หรือ `globalThis`
- รันได้ที่ไหน: รันได้ทุกที่ที่ execute TypeScript ES2022 ผ่าน bundler หรือตัวรันที่รองรับ
  TypeScript ด้วย `moduleResolution: Bundler` เช่นแอป Node.js ที่ build ด้วย Vite/esbuild/tsc
  และโปรเจกต์ edge/worker ที่ใช้ bundler เพราะแกนกลางไม่ผูกกับ API ของ Node จึงใช้ใน
  Cloudflare Worker ได้ (ด้วยเหตุนี้โมดูลจึงห้ามใช้ `node:crypto` ถ้าต้องใช้ crypto ให้ใช้ Web Crypto)
- รันไม่ได้ที่ไหนแบบตรง ๆ: Node เปล่า ๆ รัน entry point ที่เป็น TypeScript ไม่ได้ การ import
  โมดูลไปใช้ในแอปจึงต้องผ่าน bundler หรือตัวรันของคุณ ถ้าต้องการให้ `node` เปล่า ๆ โหลดได้
  ต้อง compile ก่อน รอบนี้ยืนยันแล้วว่าถ้า compile โมดูลด้วย `tsconfig.json` ของตัวเอง
  แล้ว import `core/index.js` ที่ compile ได้ด้วย Node เปล่า ๆ จะสำเร็จ และมีฟังก์ชันสาธารณะ
  ครบทั้ง 5 ตัว
- การตรวจ type ใช้ `tsconfig.json` ที่แนบมา (`tsc --noEmit`, target ES2022, module ES2022,
  `moduleResolution Bundler`, strict) ควรรัน `npm run typecheck` ในโฟลเดอร์ที่ก๊อปไปก่อน deploy
