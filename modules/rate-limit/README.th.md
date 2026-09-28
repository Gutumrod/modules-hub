# Rate Limit (การจำกัดอัตราการเรียกใช้งาน)

โมดูล TypeScript ขนาดเล็กสำหรับจำกัดอัตราการเรียกใช้งานแบบ fixed window (หน้าต่างเวลาคงที่)
คุณเป็นผู้ประกอบ `key` เอง (IP, user id, tenant id, API key, route) และ inject storage adapter
กับค่าคอนฟิกเข้ามา โมดูลมีหน้าที่เดียวคือเก็บตัวนับของ key นั้น แล้วบอกว่าคำขอนี้ผ่านหรือไม่ผ่าน

**ข้อจำกัด / สิ่งที่โมดูลนี้ไม่ได้ทำ**

- memory store ที่แนบมาใช้ได้ใน process เดียว ไม่แชร์ตัวนับข้าม worker หรือ instance
- รองรับเฉพาะ fixed window
- ฝั่ง host ต้องประกอบ identity key เอง และจัดหา store ร่วมเมื่อจำเป็นต้องแชร์ตัวนับ

## install — การติดตั้ง

โมดูลนี้ใช้วิธี copy-and-own คือตัว source เองคือสินค้า ไม่มีแพ็กเกจ npm ที่เผยแพร่บน registry
ให้ติดตั้ง และโมดูลไม่มี runtime dependency เลย จึงไม่เพิ่ม dependency เข้าไปในโปรเจกต์ของคุณ

1. คัดลอกโฟลเดอร์โมดูล `rate-limit/` ทั้งโฟลเดอร์ไปไว้ในโปรเจกต์ของคุณ เช่น
   `src/modules/rate-limit/` — ต้องก๊อปทั้งโฟลเดอร์ (`index.ts`, `core/`, `adapters/`,
   `examples/`, `tests/`, `package.json`, `package-lock.json`, `tsconfig.json`) ไม่ใช่ก๊อปเฉพาะบางไฟล์
2. เข้าไปในโฟลเดอร์ที่ก๊อปมาแล้วรัน `npm ci` เพื่อติดตั้ง dev toolchain ที่ใช้รันเทสและตัวอย่าง
   (vitest, typescript, vite-node) จาก `package-lock.json` ที่แนบมา
3. import จาก entry point ของสำเนาที่คุณก๊อปเอง (`./modules/rate-limit/index.js`) และแก้ไข
   เฉพาะสำเนานั้น ห้าม import ข้ามโปรเจกต์จากโฟลเดอร์ต้นฉบับ

ต้องใช้ Node.js 18+ พร้อม npm สำหรับ toolchain และใช้ bundler หรือตัวรัน TypeScript สำหรับแอปของคุณ

## quickstart — เริ่มใช้งานเร็ว

หลังทำ 3 ขั้นตอนด้านบนแล้ว เส้นทางสั้นที่สุดไปถึงการเรียกใช้งานครั้งแรกสำเร็จมีเท่านี้

```ts
// your-app/src/limit.ts  (โมดูลถูกก๊อปไปไว้ที่ your-app/src/modules/rate-limit/)
import { createRateLimiter, createMemoryStore } from './modules/rate-limit/index.js';

const limiter = createRateLimiter({
  store: createMemoryStore(),
  defaultLimit: 5, // 5 คำขอ
  defaultWindowMs: 60_000, // ต่อ 60 วินาที (fixed window)
});

async function main() {
  // key ต้องประกอบเองโดยฝั่ง host
  const result = await limiter.check({ key: 'ip:203.0.113.195' });
  console.log(result.allowed, result.remaining, result.resetAt);
}
```

ถ้าการเช็คไม่ได้ส่ง `limit` กับ `windowMs` มา โมดูลจะใช้ค่าจาก config ที่คุณ inject
ถ้าต้องการให้โยน error เมื่อเกินลิมิต ให้ใช้ `checkOrThrow` แทน `check`

คำสั่งรันตัวอย่างที่แนบมา (รันจากในโฟลเดอร์โมดูล)

```bash
npm run example
```

## example — ตัวอย่างที่รันได้

โมดูลแนบตัวอย่างที่รันได้หนึ่งตัวคือ `examples/run.ts` เปิดด้วยคำสั่งเดียว

```bash
npm run example
```

ตัวอย่างนี้ใช้เวลาคงที่ (fixed clock) ผลลัพธ์จึงเหมือนเดิมทุกครั้งที่รัน บรรทัดแรกที่ npm พิมพ์เอง
คือ `npm notice run ...` แล้วโปรแกรมจะพิมพ์ 5 บรรทัดนี้

```text
fixed-window checks=4 limit=3 allowed=3 blocked=1
first resetAt=2000 last remaining=0
checkOrThrow threw code=RATE_LIMITED status=429
checkRateLimit allowed=true then allowed=false retryAfterMs=999
EXAMPLE_RESULT: OK allowed=3 blocked=1 lastRemaining=0 thrownCode=RATE_LIMITED thrownStatus=429 statelessRetryAfterMs=999
```

ตัวอย่างนี้ทำอะไร: ตั้ง `limit=3` และ `windowMs=1000` แล้วเช็ค 4 ครั้งในหน้าต่างเดียวกัน ได้
`allowed=3`, `blocked=1`, `remaining=0` ค่า `resetAt=2000` ตัว `checkOrThrow` โยน error
code `RATE_LIMITED` พร้อม status `429` และตัว entry point แบบ stateless คืนค่า `allowed=false`
พร้อม `retryAfterMs=999` โดยไม่โยน error

## limitations — ข้อจำกัด

- ตัว memory store ที่แนบมาใช้ได้กับโปรเซสเดียวเท่านั้น `createMemoryStore()` เก็บตัวนับไว้ใน
  `Map` ในหน่วยความจำของโปรเซสเดียว ใช้ได้ดีกับงานพัฒนาในเครื่อง เทส และแอปที่รันอินสแตนซ์เดียว
  แต่ **ไม่เหมาะกับ production แบบ distributed** เพราะสถานะไม่ถูกแชร์ระหว่างโปรเซส cluster
  serverless instance, edge isolate หรือ PM2 worker ถ้าจะใช้จริงต้องเขียน `RateLimitStore`
  ของคุณเองที่ต่อกับที่เก็บร่วม (เช่น Redis-compatible, Postgres, หรือ store ของ cloud)
  แล้ว inject ผ่าน `config.store`
- เวอร์ชัน 0.1 รองรับเฉพาะ fixed window เท่านั้น ยังไม่มี sliding window, token bucket หรือ
  leaky bucket — ตัวนับจะรีเซ็ตเต็มที่เมื่อข้ามขอบหน้าต่างเวลา
- ไม่มี background cleanup ที่ทำงานเอง เบาะของ key จะหมดอายุแบบ lazy เมื่อมีการเรียก `consume`
  ของ key นั้นครั้งถัดไป และจะกวาดของที่หมดอายุก็ต่อเมื่อขนาด `Map` เกิน `maxKeys`
  (ค่าเริ่มต้น 10,000) ดังนั้นหน่วยความจำอาจถือได้ถึงประมาณ `maxKeys` รายการ
- โมดูลไม่แกะ identity และไม่อ่านค่าจาก environment เลย ไม่แกะ header, IP, JWT หรือ route
  และไม่เรียก `process.env` ฝั่ง host ต้องเป็นคนประกอบ `key` และ inject ค่าทั้งหมดเอง
- entry point เป็น TypeScript ที่ใช้ specifier แบบ `.js` เทสและตัวอย่างรันผ่าน vitest/vite-node
  ไม่สามารถรันด้วย Node ESM เปล่า ๆ ได้ถ้าไม่มี bundler หรือขั้นตอน transpile

## api — API ที่ export

ทุกอย่าง export มาจาก entry point `index.ts` เท่านั้น ห้าม import จากไฟล์ย่อยโดยตรง

- `createRateLimiter(config?)` — คืน `RateLimiter` ที่ผูกกับ config ของคุณ ถ้าไม่ส่ง store
  จะสร้าง memory store ให้อัตโนมัติ
- `checkRateLimit(input, store?, config?)` — เช็คแบบ stateless ครั้งเดียว ไม่โยน error เมื่อเกิน
  ลิมิต แต่คืน `allowed: false` แทน
- `createMemoryStore(options?)` — คืน `RateLimitStore` แบบ in-memory ของเวอร์ชัน 0.1
- `RateLimitError` — error ที่ `checkOrThrow` โยนเมื่อถูกบล็อก code `RATE_LIMITED`, status `429`
- `RateLimitConfigError` — error สำหรับ input ที่ไม่ถูกต้อง code `RATE_LIMIT_INVALID_CONFIG`,
  `retryable: false`
- `RateLimiter` (type) — `{ check(input), checkOrThrow(input) }`
- `CheckRateLimitInput` (type) — `{ key, limit, windowMs, cost?, now? }`
- `RateLimitResult` (type) — `{ allowed, remaining, resetAt, retryAfterMs }`
- `RateLimitConfig` (type) — `{ store?, defaultLimit?, defaultWindowMs?, throwOnLimitExceeded? }`
- `RateLimitStore` (type) — สัญญาของ storage adapter: `consume(params)` และ `reset(key?)`
- `StoreConsumeParams` (type) — `{ key, cost, limit, windowMs, now }` ที่ส่งให้ store
- `StoreConsumeResult` (type) — `{ currentCount, windowStart, resetAt, allowed }` ที่ store คืนมา
- `MemoryStoreOptions` (type) — `{ maxKeys? }` ค่าเริ่มต้น `10000`
- `ErrorShape` (type) — รูป error กลาง `{ code, message, details?, requestId?, retryable }`

## tests — การทดสอบ

รันชุดเทสจากในโฟลเดอร์โมดูลด้วยคำสั่ง

```bash
npm test
```

ผลที่วัดได้จริงในรอบนี้ `npm test` รายงาน `Test Files 9 passed (9)` และ `Tests 43 passed (43)`
คือ 43 tests ใน 9 ไฟล์ โดยเป็น 36 tests ของชุดเดิม รวมกับอีก 7 เคสของ docs contract
ใน `tests/docs-contract.test.ts` ส่วนการตรวจ type เป็นอีกด่านหนึ่ง

```bash
npm run typecheck
```

## strengths — จุดแข็ง

- error มีโครงสร้างจริง ไม่ใช่แค่ข้อความ `RateLimitError` มี `code: 'RATE_LIMITED'`,
  `status: 429`, `retryable: true`, `key`, `limit`, `windowMs`, `resetAt`, `retryAfterMs`
  และ `details` ตรงตาม `ErrorShape` กลาง ดูได้ที่ `core/error.ts` และเทสใน
  `tests/unit/error.test.ts`
- ตรวจสอบได้แบบ deterministic เพราะทุกการเช็คส่ง `now` มาทับนาฬิกาได้ ตัวอย่างที่แนบมาจึงรันบน
  เวลาคงที่ และ `tests/integration/rate-limit.test.ts` ยืนยันค่า `resetAt` กับ `retryAfterMs`
  ที่เวลาจริงที่กำหนดไว้
- สัญญา adapter มีเมธอดเดียวที่ต้อง implement คือ `consume(params)` (และ `reset` ถ้าต้องการ)
  ทำให้ memory store และ store อื่นในอนาคตสลับกันได้ ดู `core/types.ts` และ
  `adapters/memory-store.ts`
- memory adapter ถูกเทสในจุดที่พลาดง่าย `tests/memory-store.test.ts` และ
  `tests/unit/memory-store.test.ts` ครอบคลุมทั้งการเรียก `Promise.all` พร้อมกันบน key เดียว
  (limit=3 อนุญาต 3 จาก 5) และเส้นทาง eviction ตาม `maxKeys`
- ไม่มี runtime dependency และไม่มี `node:*` ใน source เลย (`package.json` ไม่มี `dependencies`
  และ `core/`, `adapters/`, `index.ts` import กันเองเท่านั้น) จึงไม่บังคับรันไทม์ของคุณ

## runtime — รันไทม์และการนำไปใช้

- Runtime dependency: ไม่มี `package.json` มีเฉพาะ devDependencies (`vitest`,
  `@vitest/coverage-v8`, `typescript`, `vite-node`) ซึ่งใช้รันเทสและตัวอย่าง ไม่ได้ใช้ตอนเรียกโมดูล
- Node builtin ที่โมดูลใช้: ไม่มี ใน source (`index.ts`, `core/`, `adapters/`) ไม่มี import
  `node:*` ไม่มีการอ่าน `process.env` และไม่แตะไฟล์ system ใช้แค่ `Map`, `Math`, `Date.now()`,
  `Promise` และ object ธรรมดา
- รันได้ที่ไหน: รันได้ทุกที่ที่ execute TypeScript ES2022 ผ่าน bundler หรือตัวรันที่รองรับ
  `moduleResolution: Bundler` เช่นแอป Node.js ที่ build ด้วย Vite/esbuild/tsc และโปรเจกต์
  edge/worker ที่ใช้ bundler เพราะแกนกลางไม่ผูกกับ API ของ Node
- รันไม่ได้ที่ไหน: Node.js ESM เปล่า ๆ import entry point ตรง ๆ ไม่ได้ เพราะ `index.ts` เป็น
  TypeScript และใช้ specifier `.js` ชี้ไปไฟล์ `.ts` ถ้ารันด้วย `node --experimental-strip-types`
  จะได้ error `ERR_MODULE_NOT_FOUND: Cannot find module .../index.js` ให้ใช้ `npm test`,
  `npm run example` (vitest/vite-node) หรือ bundler ของคุณแทน
- การตรวจ type ใช้ `tsconfig.json` ที่แนบมา (`tsc --noEmit`, target ES2022, module ES2022,
  `moduleResolution Bundler`, strict) ควรรัน `npm run typecheck` ในโฟลเดอร์ที่ก๊อปไปก่อน deploy
