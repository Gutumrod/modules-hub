# Notification (โมดูลแจ้งเตือน)

โมดูล TypeScript ขนาดเล็กที่ไม่พึ่งพา dependency ภายนอกเลย รับ `NotificationEvent` หนึ่งตัวที่ผ่าน
การตรวจสอบแล้ว แล้วส่งต่อไปยังปลายทางเดียวที่คุณ inject เข้ามา ตัว transport ที่แนบมาคือ webhook
provider ทั่วไป พร้อมการเซ็น HMAC-SHA256 (ถ้าตั้ง secret) timeout ต่อ attempt และ retry แบบมีขอบเขต
ส่วนการตัดสินใจที่โมดูลไม่ทำเอง — ปลายทางคือที่ไหน ใช้ credential อะไร และยิง event ตอนไหน —
เป็นหน้าที่ของ host project ทั้งหมด

## install — การติดตั้ง

โมดูลนี้ใช้วิธี copy-and-own คือตัว source เองคือสินค้า ไม่มีแพ็กเกจ npm ที่เผยแพร่บน registry
ให้ติดตั้ง และโมดูลไม่มี runtime dependency เลย จึงไม่เพิ่ม dependency เข้าไปใน dependency tree
ของโปรเจกต์คุณ

1. คัดลอกโฟลเดอร์โมดูล `notification/` ทั้งโฟลเดอร์ไปไว้ในโปรเจกต์ของคุณ เช่น
   `src/modules/notification/` — ต้องก๊อปทั้งโฟลเดอร์ (`core/`, `providers/`, `examples/`,
   `tests/`, `package.json`, `package-lock.json`, `tsconfig.json`, `VERSION`,
   `.dev.vars.example`) ไม่ใช่ก๊อปเฉพาะบางไฟล์
2. เข้าไปในโฟลเดอร์ที่ก๊อปมาแล้วรัน `npm ci` เพื่อติดตั้ง dev toolchain ที่ใช้รันเทสและตัวอย่าง
   (`vitest`, `typescript`, `vite-node`) จาก `package-lock.json` ที่แนบมา
3. import จาก entry point ของสำเนาที่คุณก๊อปเอง (`./modules/notification/core/client.js` และ
   provider เช่น `./modules/notification/providers/webhook.js`) แล้วแก้ไขเฉพาะสำเนานั้น
   ห้าม import ข้ามโปรเจกต์จากโฟลเดอร์ต้นฉบับ

ต้องใช้ Node.js 18+ พร้อม npm สำหรับ toolchain และใช้ bundler หรือตัวรัน TypeScript สำหรับแอปของคุณ

## quickstart — เริ่มใช้งานเร็ว

หลังทำ 3 ขั้นตอนด้านบนแล้ว เส้นทางสั้นที่สุดจากโมดูลที่ก๊อปมาไปถึงการเรียกใช้งานครั้งแรกสำเร็จ
มีเท่านี้ — provider หนึ่งตัว notifier หนึ่งตัว event หนึ่งตัว

```ts
// your-app/src/notify.ts  (โมดูลถูกก๊อปไปไว้ที่ your-app/src/modules/notification/)
import { createNotifier } from './modules/notification/core/client.js';
import { WebhookProvider } from './modules/notification/providers/webhook.js';

// host เป็นคนอ่าน secret ของตัวเองแล้วส่งเข้ามา โมดูลไม่อ่าน environment เอง
const provider = new WebhookProvider({
  url: process.env.NOTIFICATION_WEBHOOK_URL as string,
  secret: process.env.NOTIFICATION_WEBHOOK_SECRET, // optional: เปิดใช้ X-Signature
  timeoutMs: 5000, // optional ค่าเริ่มต้น 5000
  maxAttempts: 3, // optional ค่าเริ่มต้น 3
});

const notifier = createNotifier({ provider });

const result = await notifier.notify({
  type: 'booking.created',
  payload: { bookingId: 'bk_123' },
  idempotencyKey: 'booking-created-bk_123',
});

console.log(result.ok, result.statusCode, result.attempts);
```

`notify()` ตรวจ event ก่อนเสมอ ถ้า event ไม่ถูกต้องจะคืน
`{ ok: false, error: { code: 'INVALID_EVENT' } }` พร้อม `attempts: 0` โดยไม่แตะ network เลย
ถ้าผ่านจะส่งต่อให้ provider ที่ inject เข้ามาทำงาน

คำสั่งรันตัวอย่างที่แนบมา (รันจากในโฟลเดอร์โมดูล)

```bash
npm run example
```

## example — ตัวอย่างที่รันได้

โมดูลแนบตัวอย่างที่รันได้หนึ่งตัวคือ `examples/run.ts` เปิดด้วยคำสั่งเดียว

```bash
npm run example
```

ตัวอย่างนี้เป็น self-contained คือไม่มี network ไม่เขียนไฟล์ ไม่มี secret และไม่อ่าน environment
โดยมันสลับ `globalThis.fetch` เป็น stub ในเครื่องชั่วคราวระหว่างทำแต่ละ scenario (วิธีเดียวกับที่
ชุดเทสของโมดูลใช้) แล้วคืนค่ากลับก่อนจบโปรเซส จึงไม่มี request ใดออกไปข้างนอกจริง และใส่ค่าคงที่
ทุกตัว ผลลัพธ์จึงเหมือนเดิมทุกครั้งที่รัน

บรรทัดแรกที่ npm พิมพ์เองคือ `npm notice run ...` แล้วโปรแกรมจะพิมพ์ 8 บรรทัดนี้

```text
validation invalidCode=INVALID_EVENT invalidAttempts=0 ok=true
injection isClient=true sendCalls=1
success ok=true statusCode=200 attempts=1
transport contentType=application/json idempotencyKey=booking-created-bk_123 authHeader=Bearer example-token
signature matched=true bodyMatched=true
retry429 ok=true attempts=2 fetchCalls=2
rejected ok=false statusCode=400 code=REMOTE_4XX fetchCalls=1
EXAMPLE_RESULT: OK validations=2 invalidCode=INVALID_EVENT delegatedSendCalls=1 signatureMatched=true retryAttempts=2 remote4xxCode=REMOTE_4XX
```

บรรทัดสุดท้ายเริ่มด้วย `EXAMPLE_RESULT: OK` สิ่งที่มันสังเกตได้จริง: มีการเรียกตรวจสอบ 2 ครั้ง
(อันที่ไม่ถูกต้องถูกปฏิเสธด้วย `INVALID_EVENT` และ `attempts: 0` ส่วนอันที่ถูกต้องถูกส่งต่อ)
provider ที่ inject เข้ามาได้รับ `send` หนึ่งครั้งพอดี ค่า `X-Signature` ของ request ที่เซ็นแล้ว
เท่ากับค่า HMAC-SHA256 hex ที่คำนวณขึ้นใหม่ในเครื่องจาก JSON body ตัวเดียวกับที่ส่งออกไป
response `429` ถูก retry แล้วสำเร็จใน attempt ที่ 2 และ response `400` หยุดหลัง fetch ครั้งเดียว
พร้อม code `REMOTE_4XX`

## limitations — ข้อจำกัด

- มี transport เดียวและปลายทางเดียว: `providers/webhook.ts` เป็น provider ตัวเดียวที่ implement
  จริงในเวอร์ชันนี้ มัน POST event เป็น JSON ไปยัง URL เดียวที่คุณตั้ง ไม่มีการ route, fan-out
  หรือส่งแยกตามผู้รับ ถ้า event ต้องไปถึง LINE, Telegram หรือ email ปลายทางฝั่งที่รับ webhook
  ต้องเป็นคนทำเอง ไฟล์ `providers/line.stub.ts`, `providers/telegram.stub.ts` และ
  `providers/email.stub.ts` เป็น placeholder ที่ constructor โยน error
  `LineProvider not implemented yet` / `TelegramProvider not implemented yet` /
  `EmailProvider not implemented yet` จึงยังใช้เป็น provider จริงในเวอร์ชันนี้ไม่ได้
- retry เป็นแบบตายตัวและไม่ฟัง server: ความล้มเหลวที่ retry ได้ (`RATE_LIMITED`, `REMOTE_5XX`,
  `NETWORK_ERROR`, `TIMEOUT`) จะถูกยิงซ้ำไม่เกิน `maxAttempts` ครั้ง (ค่าเริ่มต้น 3) โดยหน่วง
  `500 * 2 ** (attempt - 1)` ms — 500 ms ก่อน attempt ที่ 2 และ 1000 ms ก่อน attempt ที่ 3 —
  โดยไม่สนใจ header `Retry-After` เลย และแต่ละครั้งส่ง body เดิมทั้งก้อน
- การ retry หน่วงเวลาอยู่ใน `await` ของผู้เรียก: ด้วยค่าเริ่มต้น `maxAttempts: 3` การส่งที่ล้มเหลว
  อาจบล็อกโค้ดผู้เรียกนานประมาณ 1.5 วินาที (เฉพาะ backoff) บวกกับ `timeoutMs` ต่อ attempt
  (ค่าเริ่มต้น 5000 ms ต่อครั้ง)
- โมดูลไม่ทำ deduplication เอง `idempotencyKey` ถูกส่งต่อเป็น header `X-Idempotency-Key` เท่านั้น
  ปลายทางต้องเป็นคน implement การกันซ้ำเอง
- โมดูลบังคับ `https:` ตั้งแต่ตอนสร้าง object ถ้าใช้ `http:` จะโยน error ทันที เว้นแต่ส่ง
  `allowInsecureHttp: true` ซึ่งมีไว้สำหรับพัฒนาในเครื่องเท่านั้น
- entry point ที่แนบมาเป็น TypeScript ที่ใช้ specifier แบบ `.js` ดังนั้น `node` เปล่า ๆ import
  ตรง ๆ ไม่ได้ เทสและตัวอย่างรันผ่าน vitest/vite-node (ดูหัวข้อ runtime)

## api — API ที่ export

โมดูลไม่มี barrel file แต่เปิด entry point ที่มีเอกสารกำกับไว้ 3 ไฟล์

- `core/client.ts`
  - `createNotifier(config)` — factory ที่คืน `NotificationClient` ซึ่งผูกกับ provider ที่คุณ inject
  - `NotificationClient` — คลาสที่มี `notify(event): Promise<NotificationResult>` ตรวจ event ก่อน
    แล้วส่งต่อให้ provider ที่ inject เข้ามา
- `core/types.ts` (มีแต่ type)
  - `NotificationEvent` — `{ type, payload, recipient?, idempotencyKey?, occurredAt? }` โดย `type`
    ต้องเป็น string ที่ไม่ว่าง `payload` ต้องเป็น plain object ที่ JSON serialize ได้ และ
    `occurredAt` ต้องเป็น ISO 8601 string
  - `NotificationProvider` — สัญญาของ transport: `send(event): Promise<NotificationResult>`
  - `NotificationConfig` — `{ provider }` ซึ่งเป็น argument ของ `createNotifier`
  - `NotificationResult` — `{ ok, statusCode?, attempts, error? }`
  - `NotificationError` — `{ code, message, retryable }`
  - `NotificationErrorCode` — union ของ `INVALID_EVENT`, `INVALID_CONFIG`, `SERIALIZATION_ERROR`,
    `NETWORK_ERROR`, `TIMEOUT`, `RATE_LIMITED`, `REMOTE_4XX`, `REMOTE_5XX`, `UNKNOWN_ERROR`
- `providers/webhook.ts`
  - `WebhookProvider` — transport webhook ที่ implement `NotificationProvider` ตัว `send()` จะเซ็น
    body เมื่อมี secret ตั้ง header `Content-Type: application/json` ส่งต่อ `X-Idempotency-Key`
    ใช้ timeout ต่อ attempt และ retry ตาม HTTP status
  - `WebhookProviderConfig` — `{ url, secret?, timeoutMs?, maxAttempts?, headers?,
    allowInsecureHttp? }` โดย `content-type`, `x-signature` และ `x-idempotency-key` เป็นชื่อ
    สงวน ถ้าใส่ header เองด้วยชื่อนี้จะโยน error

error code ที่จะเห็นใน `NotificationResult.error.code` (นิยามใน `core/types.ts` และเขียนไว้ใน
`MODULE.md`): `INVALID_EVENT` (event ไม่ผ่าน validation, ไม่ retry), `SERIALIZATION_ERROR`
(JSON.stringify ล้มเหลว, ไม่ retry), `REMOTE_4XX` (4xx ที่ไม่ใช่ 429, ไม่ retry), `RATE_LIMITED`
(429), `REMOTE_5XX` (5xx), `NETWORK_ERROR` (fetch ล้มเหลว), `TIMEOUT` (timeout ต่อ attempt สั่งยกเลิก
request) ส่วน config ที่ผิดจะถูกโยนเป็น `Error` ที่ข้อความเริ่มด้วย `INVALID_CONFIG` (url ว่าง,
url ไม่ถูกต้อง, ไม่ใช่ `https:` โดยไม่ตั้ง `allowInsecureHttp`, ใช้ชื่อ header สงวน, หรือจะเซ็น
แต่ไม่มี secret)

## tests — การทดสอบ

รันชุดเทสจากในโฟลเดอร์โมดูลด้วยคำสั่ง

```bash
npm test
```

ผลที่วัดได้จริงในรอบนี้ `npm test` รายงาน `Test Files 2 passed (2)` และ `Tests 30 passed (30)`
คือ 30 tests ใน 2 ไฟล์ โดยเป็น 23 tests ของชุดเดิมใน `tests/webhook.test.ts` รวมกับอีก 7 เคส
ของ docs contract ใน `tests/docs-contract.test.ts` ส่วนการตรวจ type เป็นอีกด่านหนึ่ง

```bash
npm run typecheck
```

## strengths — จุดแข็ง

- การเซ็น HMAC เป็นของจริงและถูกยืนยันด้วยการคำนวณอิสระ `WebhookProvider` คำนวณ HMAC-SHA256 ด้วย
  Web Crypto API (`crypto.subtle`) จาก JSON body ตัวเดียวกับที่ส่งออกไป (ดู `providers/webhook.ts`)
  และ `tests/webhook.test.ts` คำนวณ digest ด้วย helper ของตัวเองแล้วยืนยันว่า header `X-Signature`
  ตรงกัน
- ทุกความล้มเหลวออกมาเป็นผลลัพธ์แบบมีโครงสร้าง ไม่ใช่ string ที่โยนออกมา `NotificationResult.error`
  คือ `{ code, message, retryable }` ตาม code ที่ระบุข้างบน และกฎการ retry ถูกตรึงด้วยเทส —
  400/401/403 หยุดหลัง fetch ครั้งเดียว, 429 กับ 500 retry แล้วสำเร็จได้ใน attempt ที่ 2,
  503 ที่ล้มเหลวตลอดใช้จนครบ `maxAttempts`, fetch ที่ค้างถูก abort ด้วย `TIMEOUT` และเคส
  `maxAttempts: 2` ยืนยันว่ามี fetch สองครั้งพอดี
- secret ไม่หลุดไปกับผลลัพธ์ `tests/webhook.test.ts` ยืนยันว่าทั้ง signing secret และค่า
  `Authorization` ที่ host ใส่เข้ามา ต้องไม่ปรากฏที่ใดในผลลัพธ์เมื่อ request ล้มเหลว
- transport สลับได้ `core/client.ts` ขึ้นกับ interface `NotificationProvider` เท่านั้น ชุดเทสจึง
  พิสูจน์การ inject provider ด้วย mock ธรรมดา (ไม่มี transport ไม่มี network) และ transport อื่น
  ต้อง implement แค่ `send(event)`
- ไม่มี runtime dependency และไม่มี `node:*` ใน source เลย `package.json` ไม่มี `dependencies`
  และ `core/` กับ `providers/` import กันเองเท่านั้น จึงไม่บังคับรันไทม์ของโปรเจกต์ที่ก๊อปไป
- ตัวอย่างรันได้ด้วยคำสั่งเดียว โดยไม่มี network ไม่เขียนไฟล์ ไม่มี secret และไม่อ่าน environment
  (`npm run example`)
- สัญญาเอกสารถูกตรวจด้วยเครื่อง ไม่ใช่ดูด้วยตา `tests/docs-contract.test.ts` อ่านไฟล์ README
  ทั้งสองจากดิสก์ เทียบลำดับหัวข้อ และจะ fail ถ้าหัวข้อที่บังคับหายไป ไฟล์ README ภาษาไทยหายไป
  วิธีติดตั้งแบบ copy-and-own หายไป หรือ marker ของตัวอย่างหายไป

## runtime — รันไทม์และการนำไปใช้

- Runtime dependency: ไม่มี `package.json` ไม่มี field `dependencies` เลย devDependencies มีเพียง
  `vitest`, `typescript` และ `vite-node` ซึ่งใช้รันเทสและตัวอย่าง ไม่ได้ใช้ตอนเรียกโมดูล
- Node builtin ที่โมดูลใช้: ไม่มี ใน source ไม่มี import `node:*` (ตั้งใจเลี่ยง `node:crypto`)
  ไม่มีการอ่าน `process.env` และไม่แตะไฟล์ system ใช้เฉพาะ global มาตรฐานของเว็บ คือ `fetch`,
  `AbortController`, `setTimeout`, `TextEncoder`, `URL` และ `crypto.subtle`
- รันได้ที่ไหน: รันได้ทุกที่ที่มี global เหล่านี้และ compile TypeScript ได้ เช่นแอป Node.js 18+
  ที่รันผ่าน bundler หรือตัวรัน TypeScript และรันไทม์ฝั่ง edge/worker ที่ใช้ bundler
  (หัวไฟล์ของโมดูลระบุ Cloudflare Workers และ Supabase Edge Functions เป็นเป้าหมายความพอร์ต)
- รันไม่ได้ที่ไหน: `node` เปล่า ๆ import entry point ตรง ๆ ไม่ได้ เพราะเป็นไฟล์ `.ts` ที่ใช้
  specifier `.js` เส้นทางที่รองรับคือ `npm test`, `npm run example` (vitest/vite-node) หรือ
  bundler/ขั้นตอน transpile ของคุณเอง
- การตรวจ type ใช้ `tsconfig.json` ที่แนบมา (`tsc --noEmit`, target ES2022, module ES2022,
  `moduleResolution Bundler`, strict) ควรรัน `npm run typecheck` ในโฟลเดอร์ที่ก๊อปไปก่อน deploy
