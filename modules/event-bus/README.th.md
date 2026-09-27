# event-bus — อีเวนต์บัสแบบ In-Process สำหรับ TypeScript

โมดูล publish/subscribe ขนาดเล็กที่ **ไม่มี runtime dependency** — คัดลอกทั้งโฟลเดอร์ไปไว้ในโปรเจกต์ของคุณแล้วเป็นเจ้าของโค้ดเอง
ลงทะเบียน handler ตามชนิดอีเวนต์ (event type) แล้ว publish อีเวนต์ โมดูลจะตรวจความถูกต้องของอีเวนต์ เรียก handler ทุกตัวที่ลงทะเบียนไว้ทีละตัว
และคืนผลลัพธ์ที่บอกว่ามีกี่ตัวสำเร็จ กี่ตัวล้มเหลว ทำงานภายใน process เดียวเท่านั้น ไม่มี broker ไม่มีเครือข่าย ไม่มีการเก็บข้อมูลลงดิสก์

เวอร์ชัน 0.1.0 · จุดเข้าใช้งาน (entry point): `index.ts`

entry point เป็น source TypeScript ต้องเรียกผ่าน bundler หรือตัวรันที่รองรับ TypeScript; Node ESM
เปล่า ๆ import source entry point นี้โดยตรงไม่ได้ ถ้าต้องการรัน example ที่แนบมา ให้ติดตั้งเครื่องมือพัฒนา
ด้วย `npm ci` แล้วใช้ `npm run example` จากโฟลเดอร์โมดูลนี้

## install — การติดตั้ง (copy-and-own 3 ขั้นตอน)

1. คัดลอกโฟลเดอร์ `event-bus` ทั้งโฟลเดอร์ไปไว้ในโปรเจกต์ของคุณ เช่นที่ `src/modules/event-bus/`
   ต้องคัดลอกทั้งโฟลเดอร์ (source, `package.json`, `tsconfig.json`, tests และ examples ไปด้วยกัน)
   โมดูลนี้ไม่มีแพ็กเกจบน registry ให้ติดตั้ง ดังนั้น "สำเนาที่คัดลอก" คือ dependency ตัวจริง
2. ไม่บังคับ — ถ้าต้องการรัน test และ example ของโมดูลในเครื่อง ให้รัน `npm ci` ในโฟลเดอร์ที่คัดลอกมา
   ตัวแอปของคุณไม่จำเป็นต้องใช้เครื่องมือชุดนี้เลย
3. import ผ่าน entry point ของสำเนาที่คุณคัดลอกมา — ห้ามชี้ path ข้ามโปรเจกต์ต้นทาง

   ```ts
   import { createEventBus } from './modules/event-bus/index.js';
   ```

เก็บสำเนาไว้ใน version control ของคุณเอง แก้ไขและต่อยอดได้ตามต้องการ

## quickstart — เริ่มใช้งานเร็ว (เรียกครั้งแรกให้สำเร็จ)

จากโฟลเดอร์โมดูลที่คัดลอกมาแล้ว ถึงการ publish ครั้งแรกในไฟล์เดียว:

```ts
// path ชี้ไปที่สำเนาของคุณ ไม่ใช่ repository ต้นทาง
import { createEventBus } from './modules/event-bus/index.js';

const bus = createEventBus();

// ลงทะเบียน handler สำหรับ event type เดียวแบบตรงตัว (exact match)
bus.subscribe('order.created', {
  subscriberId: 'audit',
  handle: (event) => {
    console.log(`received ${event.type} ${event.id}`);
  },
});

// ฟิลด์ id และ timestamp จำเป็นต้องมี แต่บัสเติมให้อัตโนมัติได้ถ้าไม่ส่งมา
const result = await bus.publish({
  id: 'evt_1',
  type: 'order.created',
  payload: { orderId: 'ord_1', totalCents: 4999 },
  timestamp: new Date().toISOString(),
});

console.log(result.delivered, result.failed); // 1 0
```

รันตัวอย่างที่เตรียมไว้ด้วยคำสั่งเดียวนี้ จากในโฟลเดอร์โมดูล:

    npm run example

## example — ตัวอย่างที่รันได้จริง

คำสั่งเดียว ไม่ต้องใส่อาร์กิวเมนต์ ไม่ต้องต่อเครือข่าย ไม่ต้องตั้งค่า:

    npm run example

คำสั่งนี้รัน `examples/run.ts` ผ่าน `vite-node` และพิมพ์ผลลัพธ์จริงตามนี้ บรรทัดสุดท้ายขึ้นต้นด้วย
`EXAMPLE_RESULT: OK` แล้วตามด้วยตัวเลขที่ตัวอย่างวัดได้จริงในรอบนั้น:

    published event types: order.created, order.updated, order.cancelled
    handlers registered: 4 (3 for order.created, 1 for order.updated)
    order.created  -> delivered=2 failed=1 failureCode=HANDLER_FAILED
    order.updated  -> delivered=1 failed=0 failures=absent
    order.cancelled-> delivered=0 failed=0 failures=absent
    duplicate subscribe returned same UnsubscribeFn: true
    unsubscribe via handle: true, second call: false
    unsubscribe via subscriberId: true, second call: false
    handler invocations recorded: publish:order.created, audit:order.created:ord_1001, notify:ord_1001, publish:order.updated, audit:order.updated:ord_1002, publish:order.cancelled
    EXAMPLE_RESULT: OK published=3 delivered=3 failed=1 handlerFailureCode=HANDLER_FAILED newSubscriptions=4 removals=2 publishHooks=3 unsubscribeHooks=1 onErrorCalls=1 onErrorSinkCalls=1 invalidInputCodes=EVENT_INVALID+EVENT_TYPE_INVALID

ตัวอย่างนี้แสดงพฤติกรรม 4 อย่างที่ควรรู้ก่อนเอาไปต่อ: handler สามตัวบน event type เดียวกันรันตามลำดับที่ลงทะเบียน,
handler ที่ throw จะถูกแยกออกและรายงานเป็น `HANDLER_FAILED` โดยตัวอื่นยังทำงานต่อ, การ subscribe handler เดิมซ้ำเป็น no-op,
และข้อมูลที่ไม่ถูกต้องจะ throw เป็น `EventBusError` ที่มี code ระบุชัดเจน

## limitations — ข้อจำกัด (อ่านก่อนใช้งาน)

- ใช้ได้ใน process เดียวเท่านั้น ส่งแบบ at-most-once และไม่ durable — การส่งเกิดในหน่วยความจำของ process ปัจจุบัน
  ไม่มีการเก็บลงดิสก์ ฐานข้อมูล หรือคิว ไม่มี retry และกู้คืนไม่ได้หลัง process crash หรือ restart
  อีเวนต์ที่กำลังส่งอยู่จะหายไป ห้ามใช้โมดูลนี้กับงานที่การส่งต้องรอดข้ามการ restart
- จับคู่ event type แบบตรงตัวเท่านั้น — `'order.created'` ตรงกับ `'order.created'` เท่านั้น
  เวอร์ชันนี้ไม่มี wildcard `'*'` ไม่มี prefix อย่าง `'payment.*'` และไม่มี regex routing
- handler ทำงานแบบเรียงลำดับ ทีละตัวและ await ทีละตัว — ไม่มี fan-out แบบขนาน (`Promise.all`)
  ดังนั้น handler ที่ทำงานช้าจะทำให้ handler ที่ลงทะเบียนทีหลังบน event type เดียวกันต้องรอตามไปด้วย
- handler ที่ล้มเหลวถูกรายงาน แต่ไม่ถูก retry — `publish()` คืนค่าโดยบันทึกความล้มเหลวไว้ใน `result.failures`
  (code `HANDLER_FAILED`) และจะไม่ throw เพราะ handler throw และจะไม่ลองซ้ำ โค้ดของคุณต้องตัดสินใจเองว่าจะจัดการอย่างไร
- ค่าเริ่มต้นจำกัด subscriber 100 ตัวต่อ event type (`maxSubscribersPerType`) — ถ้าลงทะเบียนเกินจะ throw `SUBSCRIBER_INVALID`
- ไม่ใช่ audit log — บัสไม่เก็บประวัติ ไม่รับประกันลำดับข้าม event type และไม่มีบันทึกที่แก้ไขไม่ได้ว่าอะไรถูก publish ไปแล้ว
- ไม่มีการอ่าน env — โมดูลไม่อ่าน `process.env` หรือ global config ใด ๆ จึงไม่มีการตั้งค่าเกิดขึ้นเลยถ้าคุณไม่ส่งผ่าน `createEventBus(config)`

## api — API สาธารณะ

ทุก export มาจาก entry point `index.ts` เท่านั้น ห้าม import จากไฟล์ย่อยโดยตรง

รายการที่ export ตอน runtime:

- `createEventBus(config?: EventBusConfig): EventBus` — factory คืนบัสที่ผูกกับ config ที่ให้มา
  ถ้าไม่ส่ง config จะใช้ `crypto.randomUUID` สำหรับ id, `new Date().toISOString()` สำหรับ timestamp และจำกัด 100 subscriber ต่อ event type
- `EventBusError` — คลาส error ของทุก error ที่โมดูล throw หรือเก็บไว้ มีฟิลด์ `code` และอาจมี `eventId`, `eventType`, `subscriberId`, `cause`

รายการที่เป็น type:

- `Event<T>` — สัญญาของอีเวนต์: ต้องมี `id`, `type`, `payload`, `timestamp` และมี `source`, `subject`, `correlationId`, `metadata` เป็นทางเลือก
- `EventBus` — อินเทอร์เฟซของบัส: `publish(event)`, `subscribe(eventType, handler)`, `unsubscribe(eventType, subscriberIdOrHandler)`
- `EventBusConfig` — `idGenerator`, `timestampProvider`, `maxSubscribersPerType`, `hooks`, `onErrorSink`
- `EventBusErrorCode` — รวม `'EVENT_INVALID'`, `'EVENT_TYPE_INVALID'`, `'SUBSCRIBER_INVALID'`, `'HANDLER_FAILED'`, `'PUBLISH_FAILED'`
- `EventBusHooks` — callback สำหรับ telemetry: `onPublish`, `onSubscribe`, `onUnsubscribe`, `onError`
  hook ที่ throw จะถูกกลืนและไม่มีผลต่อผลลัพธ์ของการ publish
- `EventHandler<T>` — รูปแบบ object handler: `handle(event)` พร้อม `subscriberId` (ทางเลือก) ใช้ระบุตัวตนใน registry
- `EventHandlerFn<T>` — รูปแบบ function handler: `(event) => Promise<void> | void`
- `PublishResult` — `{ delivered, failed, failures? }` โดย `failures` จะมีเฉพาะเมื่อ `failed > 0`
- `PublishFailure` — หนึ่งรายการใน `failures`: `subscriberId` (ทางเลือก) และ `EventBusError`
- `UnsubscribeFn` — `() => boolean` คืนจาก `subscribe()` เป็น `true` เมื่อถอด handler ออกสำเร็จ และ `false` เมื่อไม่มีแล้ว

## tests — การทดสอบ

รันชุดทดสอบจากในโฟลเดอร์โมดูล:

    npm test

ผลที่วัดได้จริงในรอบแพ็กเกจนี้ (2026-09-27) `npm test` จบด้วย exit code 0 และรายงานว่า:

- 9 ไฟล์ทดสอบ, 100 tests, ไม่มีตัวใดล้มเหลว — เป็นชุดเดิม 91 tests ใน 8 ไฟล์ บวกกับ 9 tests
  ของสัญญาเอกสารใน `tests/docs-contract.test.ts`
- `npm test` คือคำสั่ง `vitest run`
- `tests/docs-contract.test.ts` อ่าน `README.md`, `README.th.md`, `MODULE.md`, `package.json` และ
  `examples/run.ts` จากไฟล์จริงบนดิสก์ ถ้าหัวข้อ README ที่บังคับหายไป กฎการติดตั้งผิด หรือ marker ของตัวอย่างหายไป ชุดทดสอบจะ fail
- `npm run typecheck` คือคำสั่ง `tsc --noEmit` และผ่านทั้งโมดูลรวมถึง examples

## strengths — จุดแข็ง

- ไม่มี runtime dependency เลย — `package.json` ไม่มีฟิลด์ `dependencies` และโค้ดไม่ import `node:*` เลยสักตัว
  ดังนั้น bundle ของคุณจะได้เพียงโค้ดโมดูลเท่านั้น ส่วน dependency ที่ประกาศไว้มีแต่ของสำหรับพัฒนา
  (`typescript`, `vitest`, `@vitest/coverage-v8`, `vite-node`) เพื่อรัน test และ example เท่านั้น
- ความล้มเหลวถูกแยกและรายงานเป็นข้อมูล ไม่ใช่ throw — `core/bus.ts` ครอบการเรียก handler แต่ละตัวด้วย `try`/`catch`
  ของตัวเอง และเก็บ `EventBusError` code `HANDLER_FAILED` ต่อหนึ่งความล้มเหลว ซึ่งมี test ใน `tests/unit/failure.test.ts` และ `tests/smoke.test.ts`
- โมเดล error แบบปิดและมี type — ทั้ง 5 code (`EVENT_INVALID`, `EVENT_TYPE_INVALID`, `SUBSCRIBER_INVALID`, `HANDLER_FAILED`, `PUBLISH_FAILED`)
  รวมอยู่ใน union เดียวใน `core/error.ts` จึงเขียน `switch` บน `error.code` ได้โดยไม่ต้อง parse ข้อความ
- กัน prototype pollution — `core/security.ts` ตัดคีย์ `__proto__`, `constructor`, `prototype` ทิ้งขณะคัดลอกอีเวนต์และ metadata
  และสร้าง container ด้วย `Object.create(null)` มี test ยืนยันใน `tests/unit/security.test.ts`
- ลำดับการทำงานแน่นอนอธิบายได้ — handler บน event type เดียวกันรันตามลำดับที่ลงทะเบียนเป๊ะ ๆ ทีละตัว และตัวซ้ำจะถูกมองข้าม
  ยืนยันด้วย `tests/unit/publish.test.ts` และ `tests/smoke.test.ts`
- ได้ซอร์สเต็ม ไม่ใช่กล่องดำ — คัดลอกทั้งโมดูลรวม test และตัวอย่างการต่อกับ Cloudflare Worker ที่มีคอมเมนต์อธิบาย และอ่าน/แก้ได้ทุกบรรทัด

## runtime — สภาพแวดล้อมที่ต้องมี

- runtime dependency: ไม่มี — `package.json` ไม่มีฟิลด์ `dependencies` โค้ดที่ส่งมอบไม่ต้องใช้แพ็กเกจบุคคลที่สามเลย
- Node builtin ที่ใช้: ไม่มี — โมดูลไม่ import `node:*` และคำสั่ง grep หา `node:` ในไฟล์ `.ts` ของโมดูลไม่พบผลลัพธ์
- API ของแพลตฟอร์มที่ใช้: มาตรฐานเว็บเท่านั้น — `crypto.randomUUID` สำหรับ id, `Date` สำหรับ timestamp, `Object`/`Map`/`Promise` สำหรับ registry และการส่งอีเวนต์
- รันได้ที่ไหน: ใช้ผ่าน bundler/ตัวรัน TypeScript ที่ส่งไปยัง runtime ซึ่งมี Web API เหล่านี้ — Cloudflare Workers, เบราว์เซอร์รุ่นใหม่, Deno, Bun และ Node.js 18 ขึ้นไป
  source ใช้ ESM และ type-check ผ่านภายใต้ `moduleResolution: Bundler` แต่ Node ESM เปล่า ๆ import entry point `.ts` โดยตรงไม่ได้
  ให้ใช้ bundler/ตัวรัน TypeScript ของแอป หรือรัน example ที่แนบมาด้วย `npm run example`
- ที่ต้องช่วยเพิ่ม: รันไทม์ที่ไม่มี `crypto.randomUUID` (หรือห้ามแตะ global crypto) ต้องส่ง `idGenerator` และ `timestampProvider` เข้า `EventBusConfig` เอง
- ที่ใช้ไม่ได้: งานข้าม process — ไม่มี network transport ไม่มีคิว ไม่มีบันทึกอีเวนต์ที่ persist และไม่มีตัวจัดเวลา จึงส่งข้ามบริการหรือข้ามการ restart ไม่ได้
