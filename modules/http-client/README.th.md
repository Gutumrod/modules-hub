# http-client — HTTP client แบบมี type ที่คุณคัดลอกไปเป็นเจ้าของเอง

โมดูล HTTP client ขนาดเล็กที่ **ไม่มี runtime dependency** — คัดลอกทั้งโฟลเดอร์ไปไว้ในโปรเจกต์ของคุณแล้วเป็นเจ้าของโค้ดเอง
คุณสร้าง config หนึ่งก้อน ฉีด transport เข้าไป แล้วทุกคำสั่งจะวิ่งผ่านท่อเดียว: ตรวจ URL ตาม policy → ลบข้อมูลอ่อนไหวออกจาก header →
คุม timeout → retry แบบ backoff เมื่อเจอปัญหาชั่วคราว → แปลง response → ดึง provider request id → คืนค่า response ที่มี type
หรือ throw `HttpError` ที่มี code ให้คุณแยกแยะได้

โมดูลนี้ตั้งใจให้ขอบเขตแคบ: มัน retry เฉพาะคำขอเดียวแบบชั่วคราวในไม่กี่วินาที
ไม่ใช่ job queue ไม่ใช่ตัวจัดตารางงานเบื้องหลัง และไม่อ่าน environment ของคุณเลย — คุณเป็นคนฉีดทุกอย่างเข้าไป

เวอร์ชัน 0.1.0 · จุดเข้าใช้งาน (entry point): `index.ts`

entry point เป็น source TypeScript ต้องเรียกผ่าน bundler หรือตัวรันที่รองรับ TypeScript; Node ESM
เปล่า ๆ import source entry point นี้โดยตรงไม่ได้ ถ้าต้องการรัน example ที่แนบมา ให้ติดตั้งเครื่องมือพัฒนา
ด้วย `npm ci` แล้วใช้ `npm run example` จากโฟลเดอร์โมดูลนี้

## install — การติดตั้ง (copy-and-own 3 ขั้นตอน)

1. คัดลอกโฟลเดอร์ `http-client` ทั้งโฟลเดอร์ไปไว้ในโปรเจกต์ของคุณ เช่นที่ `src/modules/http-client/`
   ต้องคัดลอกทั้งโฟลเดอร์ไปด้วยกัน (`index.ts`, `core/`, `adapters/`, `examples/`, `package.json`, `tsconfig.json` และ tests)
   โมดูลนี้ไม่มีแพ็กเกจบน registry ให้ติดตั้ง ดังนั้น "สำเนาที่คัดลอก" คือ dependency ตัวจริง
2. ไม่บังคับ — ถ้าต้องการรัน test และ example ของโมดูลในเครื่อง ให้รัน `npm ci` ในโฟลเดอร์ที่คัดลอกมา
   ตัวแอปของคุณเองไม่จำเป็นต้องใช้เครื่องมือชุดนี้เลย
3. import ผ่าน entry point ของสำเนาที่คุณคัดลอกมา — ห้ามชี้ path ข้ามโปรเจกต์ต้นทาง

   ```ts
   import { createHttpClient, createFetchTransport, HttpError } from './modules/http-client/index.js';
   ```

เก็บสำเนาไว้ใน version control ของคุณเอง แก้ไขและต่อยอดได้ตามต้องการ

## quickstart — เริ่มใช้งานเร็ว (เรียกครั้งแรกให้สำเร็จ)

จากโฟลเดอร์โมดูลที่คัดลอกมาแล้ว ถึงคำขอแรกที่สำเร็จ โมดูลไม่เปิดเน็ตเวิร์กเองและไม่อ่าน environment
ทางที่สั้นที่สุดคือสร้าง transport จาก `fetch` ที่แพลตฟอร์มของคุณมีอยู่แล้ว:

```ts
// path ชี้ไปที่สำเนาของคุณ ไม่ใช่ repository ต้นทาง
import { createHttpClient, createFetchTransport, HttpError } from './modules/http-client/index.js';

// 1. transport ที่สร้างจาก fetch ของ runtime — ใน production ควรส่งเข้ามาเองเสมอ
const transport = createFetchTransport({ fetch: globalThis.fetch });

// 2. config ก้อนเดียว ค่าที่เป็นความลับทั้งหมดมาจาก env ของคุณเอง ไม่ใช่จากโมดูล
const client = createHttpClient({
  transport,
  defaultTimeoutMs: 8000,
  urlPolicy: {
    allowedProtocols: ['https:'],
    blockedHosts: ['localhost', '127.0.0.1', '169.254.169.254'],
  },
});

// 3. เรียกหนึ่งครั้ง — การแปลง body, retry, timeout และการ map error อยู่ในนั้นทั้งหมด
try {
  const res = await client.get<{ id: string; name: string }>('https://api.example.test/items/1');
  console.log(res.status, res.ok, res.data?.name);
} catch (err) {
  // ทุกเส้นทางที่ล้มเหลว throw HttpError — ไม่คืน error object กลับมา
  if (err instanceof HttpError) console.error(err.code, err.status);
}
```

รัน example ที่แนบมาแบบไม่ต้องตั้งค่าอะไร ด้วยคำสั่งนี้ จากในโฟลเดอร์โมดูล:

    npm run example

## example — ตัวอย่างที่รันได้ทันที

คำสั่งเดียว ไม่ต้องใส่อาร์กิวเมนต์ ไม่ใช้เน็ตเวิร์ก ไม่ต้องมี credential และไม่ต้องตั้งค่าใด ๆ:

    npm run example

คำสั่งนี้รัน `examples/run.ts` ผ่าน `vite-node` ตัว example ใช้ fetch adapter ตัวจริงของโมดูล
โดยฉีด fetch จำลองที่เขียนบทไว้ ทำให้ท่อการทำงานจริงรันได้ครบโดยไม่ต้องมีเซิร์ฟเวอร์
บรรทัดสุดท้ายที่พิมพ์ออกมาจะเริ่มด้วย `EXAMPLE_RESULT: OK` และรายงานเฉพาะค่าที่รอบนั้นวัดได้จริง
ผลลัพธ์จากการรันที่ตรวจสอบล่าสุด:

    GET  /items/1 -> status=200 ok=true id=item_1 name=Widget requestId=req_example_1
    GET  /text    -> status=200 dataType=string data="hello from the transport"
    POST /items   -> status=201 contentType=application/json body={"name":"Widget"} redactedHeaders=2
    GET  /flaky   -> status=200 id=flaky_ok attempts=2
    POST /unsafe  -> code=HTTP_RETRY_EXHAUSTED cause=HTTP_SERVER_ERROR attempts=1
    GET  blocked  -> code=HTTP_INVALID_URL fetchesAttempted=0
    GET  bad-url  -> code=HTTP_INVALID_URL
    GET  /missing -> code=HTTP_CLIENT_ERROR attempts=1
    GET  /slow    -> code=HTTP_RETRY_EXHAUSTED cause=HTTP_TIMEOUT attempts=1
    GET  aborted  -> code=HTTP_ABORTED attempts=1
    throwing hooks isolated -> true
    EXAMPLE_RESULT: OK fetches=11 hookCalls=onRequest:8+onResponse:4+onError:4 redactedHeaderValues=2 itemStatus=200 itemId=item_1 requestId=req_example_1 textDataType=string postStatus=201 postBodySerialized=true flakyAttempts=2 flakyStatus=200 unsafePostAttempts=1 unsafeCode=HTTP_RETRY_EXHAUSTED unsafeCause=HTTP_SERVER_ERROR blockedCode=HTTP_INVALID_URL blockedFetchesAttempted=0 invalidUrlCode=HTTP_INVALID_URL clientErrorCode=HTTP_CLIENT_ERROR clientErrorAttempts=1 timeoutCode=HTTP_RETRY_EXHAUSTED timeoutCause=HTTP_TIMEOUT abortCode=HTTP_ABORTED abortAttempts=1 attemptsPerSlowRequest=true hostileHooksIsolated=true errorClassOk=true caughtErrorCodes=HTTP_RETRY_EXHAUSTED+HTTP_INVALID_URL+HTTP_CLIENT_ERROR+HTTP_ABORTED hookErrorCodes=HTTP_RETRY_EXHAUSTED+HTTP_CLIENT_ERROR+HTTP_ABORTED

อ่านบรรทัดรายละเอียดคู่กับบรรทัดสรุป: GET ธรรมดาคืน status 200 พร้อม `requestId` ที่ดึงมาจาก header ของ response
ท่อเดียวกันแปลงเป็น text ได้เมื่อสั่ง `responseType` เป็น `'text'` body ที่เป็น object ของ `POST` ถูก serialize เป็น JSON และตั้ง content type ให้
host ที่ถูกบล็อกและ URL ที่ parse ไม่ได้ถูกปฏิเสธก่อนจะยิง fetch เลย สั่ง `GET` ที่ปลอดภัยถูก retry หลังเจอ 503 แต่ `POST` ที่ไม่ idempotent ได้ลองเพียงครั้งเดียว
ทั้ง timeout และการ abort จากผู้เรียกถูกแปลงเป็น code ของ `HttpError` และ hook ที่ throw ก็ไม่เปลี่ยนผลลัพธ์

## limitations — ข้อจำกัด (อ่านก่อนใช้งาน)

- **`maxAttempts: 1` ทำให้รหัสข้อผิดพลาดจริงถูกกลบ** คำขอที่ล้มเหลวหนึ่งครั้งด้วย error ที่ retry ได้ แต่ถูกตั้งให้ลองครั้งเดียว
  — ซึ่งรวมถึงทุกคำขอที่ไม่ idempotent เมื่อไม่ได้ตั้ง `allowUnsafeRetries` — จะถูกรายงานเป็น `HTTP_RETRY_EXHAUSTED` ทั้งที่ไม่ได้ลองซ้ำเลย
  ต้องดู error จริงผ่าน `error.cause` เท่านั้น เห็นได้ชัดใน `npm run example` ที่ `POST` รายงาน `HTTP_RETRY_EXHAUSTED` พร้อม `cause=HTTP_SERVER_ERROR`
- **`Retry-After` ที่เกิน `maxRetryAfterMs` กลับถูก retry แทนที่จะหยุดทันที** ตัวตรวจที่ควรหยุดทันที throw จากใน `try` ของ retry loop เอง
  error นั้นจึงถูกมองว่า retry ได้และ loop ก็วนต่อ ผู้เรียกจึงได้ `HTTP_RETRY_EXHAUSTED` แทน `HTTP_RATE_LIMITED` หรือ `HTTP_SERVER_ERROR` ที่ควรได้ทันที
  ทั้งสองข้อเขียนไว้ใน `MODULE.md` และ `TEST-REPORT.md` และยังไม่ถูกแก้ในเวอร์ชัน 0.1.0
- **retry แบบชั่วคราวเท่านั้น** สถานะการ retry อยู่ในหน่วยความจำตลอดหนึ่งคำขอ ไม่ถูกบันทึก ไม่มีตัวจัดตาราง และไม่ติดตามข้ามการรีสตาร์ทโปรเซส
  งานเบื้องหลังและ retry ระยะยาวเป็นหน้าที่ของโมดูลอื่น
- **การจับคู่ host ของ Host เป็นแบบตรงตัว** `allowedHosts` และ `blockedHosts` เทียบชื่อ host แบบเท่ากันทุกตัวอักษร
  จึงไม่ครอบคลุม subdomain และไม่รองรับ wildcard ต้องลงทะเบียนชื่อ host ทุกตัวที่ต้องการ
- **body ของ response ที่เป็น error ถูกตัดให้สั้นลง** สำหรับ response ที่ไม่ใช่ 2xx เนื้อหาจะถูกอ่านและตัดเหลือ 2048 ไบต์ก่อนใส่ในข้อความ error
  หน้า error ขนาดใหญ่ของ upstream จึงไปถึง log ของคุณเพียงบางส่วน
- **ไม่อ่าน environment ตามการออกแบบ** โมดูลไม่เคยอ่าน `process.env`, `env` หรือ `globalThis.process` ถ้าคุณไม่ส่งค่ามาก็ไม่มีการตั้งค่าใด ๆ
  ค่าที่ขาดจึงไปโผล่เป็นคำขอที่ล้มเหลว ไม่ใช่ค่า default
- **คุณต้องจัดหา fetch ให้ transport เอง** `createFetchTransport()` ใช้ `globalThis.fetch` เป็นค่าเริ่มต้น ถ้า runtime ไม่มี `fetch` ส่วนกลาง คุณต้องฉีดของตัวเองเข้าไป
- **ไม่มี cache ไม่มี rate limit ไม่มี circuit breaker** ทุกคำขอถูกส่งออกไปตามที่สั่ง ไม่มี response cache ไม่มีการจำกัดอัตราฝั่ง client และไม่มีชั้นกันความล้มเหลวในโมดูลนี้

## api — Public API

ทุกชื่อที่ส่งออกด้านล่างมาจาก entry point `index.ts` เท่านั้น ห้าม import จากไฟล์ย่อยโดยตรง

- `createHttpClient` — `createHttpClient(config?: HttpClientConfig): HttpClient` สร้าง client ที่ผูกกับ config ของคุณ
  ถ้าไม่ส่งอะไรเลยจะใช้ fetch transport, timeout 10 วินาที และ retry policy มาตรฐาน
- `createFetchTransport` — `createFetchTransport(options?: FetchTransportOptions): HttpTransport` ตัว adapter ที่ใช้ Web Fetch API
  body ที่ไม่ใช่ string, `ArrayBuffer` หรือ `Blob` จะถูก serialize เป็น JSON และตั้ง content type ให้ ถ้าคุณยังไม่ได้ตั้งเอง
- `HttpError` — คลาส error ที่ทุกเส้นทางล้มเหลว throw ออกมา มี `code`, `status`, `retryable`, `providerRequestId`, `url`, `method` และ `cause`
- `HttpClient` — interface ของ client: `request()` พร้อมเมธอดช่วย `get`, `post`, `put`, `patch`, `delete` ซึ่งทุกตัวเรียกผ่าน `request()`
- `HttpClientConfig` — config ที่คุณฉีดเข้ามา: `transport`, `defaultTimeoutMs`, `defaultRetry`, `urlPolicy`, `sensitiveHeaders`, `hooks`
- `HttpRequest` — คำขอหนึ่งครั้ง: `url`, `method` และตัวเลือก `headers`, `body`, `timeoutMs`, `retry`, `signal`, `metadata`, `responseType`
- `HttpResponse` — response หนึ่งครั้ง: `status`, `ok`, `headers`, `data`, `requestId`
- `HttpTransport` — interface ของ transport: `send(request: TransportRequest)`
- `TransportRequest` — สิ่งที่ pipeline ส่งให้ transport: `url`, `method`, `headers`, `body`, `signal`
- `TransportResponse` — สิ่งที่ transport คืนกลับ: `status`, `headers`, `body`, `rawResponse`
- `FetchTransportOptions` — ตัวเลือกของ adapter: `fetch`
- `RetryPolicy` — `maxAttempts`, `initialDelayMs`, `backoffMultiplier`, `maxDelayMs`, `retryableStatusCodes`, `respectRetryAfter`, `maxRetryAfterMs`, `allowUnsafeRetries`
- `UrlPolicy` — `allowedProtocols`, `allowedHosts`, `blockedHosts` ถูกบังคับใช้ก่อนส่งคำขอทุกครั้ง
- `LoggingHooks` — `onRequest`, `onResponse`, `onError` ทุกการเรียก hook ถูกครอบไว้ hook ที่ throw จึงเปลี่ยนผลของคำขอไม่ได้
- `SanitizedRequestInfo` — สิ่งที่ `onRequest` / `onError` ได้รับ: `url`, `method`, `headers` ที่ผ่านการลบข้อมูลอ่อนไหวแล้ว พร้อม `requestId` และ `metadata`
- `SanitizedResponseInfo` — สิ่งที่ `onResponse` ได้รับ: `status`, `headers` ที่ลบข้อมูลอ่อนไหวแล้ว, `requestId` และ `durationMs`
- `HttpErrorCode` — union ของรหัสข้อผิดพลาดทั้งหมดที่คุณใช้แยกแยะได้: `HTTP_TIMEOUT`, `HTTP_NETWORK_ERROR`,
  `HTTP_INVALID_RESPONSE`, `HTTP_CLIENT_ERROR`, `HTTP_SERVER_ERROR`, `HTTP_RATE_LIMITED`, `HTTP_ABORTED`,
  `HTTP_RETRY_EXHAUSTED`, `HTTP_INVALID_URL`

## tests — การทดสอบ

รันชุดทดสอบจากในโฟลเดอร์โมดูล:

    npm test

ผลที่วัดได้จริงในรอบแพ็กเกจนี้ (2026-09-27) `npm test` ออกด้วยรหัส 0 และรายงานว่า:

- ผ่าน 170 เทส ไม่มีตัวใดล้มเหลว ใน 2 ไฟล์เทส ใช้เวลาเทส 2.5 วินาที
- 157 เทสใน `tests/http.test.ts` เป็นชุดทดสอบเดิมของโมดูล ไฟล์นี้ไม่ถูกแก้เลย ไม่มีเทสใดถูกลบ ข้าม หรือทำให้อ่อนลง
- 13 เทสใหม่ใน `tests/docs-contract.test.ts` คอยป้องกันสัญญาเอกสารสำหรับผู้ใช้ และไฟล์นี้เป็นไฟล์เทสเดียวที่เพิ่มในรอบนี้
- `npm test` ทำงานเทียบเท่า `vitest run`
- `tests/docs-contract.test.ts` อ่าน `README.md`, `README.th.md`, `MODULE.md`, `package.json`, `index.ts`, `core/error.ts` และ `examples/run.ts` จากดิสก์
  ถ้าลบ section ที่บังคับออกจาก README ทำให้กฎ copy-and-own เสีย เขียนชื่อ export ที่ entry point ไม่มี อ้างจำนวนเทสที่ `MODULE.md` ไม่ได้ระบุ หรือลบ marker ของ example ทดสอบนี้จะล้มเหลวทันที
- `npm run typecheck` ทำงานเทียบเท่า `tsc --noEmit` ครอบคลุม `**/*.ts` (รวม examples และ tests) และออกด้วยรหัส 0

## strengths — จุดแข็ง

- **ไม่มี runtime dependency** `package.json` ไม่มีฟิลด์ `dependencies` เลย และไม่มีไฟล์ใดในโมดูล import `node:*`
  จึงไม่มีอะไรถูกดึงเข้าแอปของคุณนอกจากตัวโค้ดของโมดูลเอง สิ่งที่ประกาศไว้มีแต่เครื่องมือสำหรับพัฒนา (`typescript`, `vitest`, `vite-node`) และใช้เฉพาะตอนรัน test กับ example
- **มีเส้นทางเรียกคำขอเดียว** `core/client.ts` เขียน `get`, `post`, `put`, `patch` และ `delete` เป็นการส่งต่อให้ `request()` ล้วน ๆ
  การตรวจ URL, การลบข้อมูลอ่อนไหว, timeout, retry, การแปลง response และ hook จึงไม่สามารถแตกออกจากกันได้ มีการยืนยันใน `tests/http.test.ts`
- **โมเดล error แบบปิดและมี type** `core/error.ts` รวมรหัสข้อผิดพลาดทั้งเก้าไว้ใน union เดียว พร้อมค่า `retryable` ตั้งต้นของแต่ละรหัส
  และทุกเส้นทางล้มเหลว throw `HttpError` คุณจึงแยกแยะด้วย `error.code` ไม่ต้อง parse ข้อความ
- **ข้อมูลลับถูกลบก่อนถึง log ของคุณ** `core/security.ts` แทนค่า `Authorization`, `Cookie`, `Set-Cookie`, `X-API-Key` และ `Proxy-Authorization` ด้วย `[REDACTED]`
  ในข้อมูลที่ส่งให้ hook รวมถึงชื่อ header ที่คุณลงทะเบียนใน `sensitiveHeaders` และเทียบชื่อแบบไม่สนตัวพิมพ์ ตัว example นับจำนวนค่าที่ถูกลบไว้ในบรรทัดสรุป
- **hook ทำคำขอพังไม่ได้** ทุกการเรียก hook ใน `core/pipeline.ts` ถูกครอบด้วย `try` / `catch` ตัวส่ง telemetry ที่ throw จึงไม่กระทบผลลัพธ์
  และ example พิสูจน์เรื่องนี้ด้วย hook ที่ throw ทั้งในเส้นทางสำเร็จและเส้นทางล้มเหลว
- **ปลอดภัยจาก prototype pollution** `core/security.ts` สร้าง header map, metadata และ header ของ response ด้วย `Object.create(null)`
  และกรองคีย์ `__proto__`, `constructor`, `prototype` ออกทุกครั้งที่คัดลอก
- **ค่าเริ่มต้นของ retry ระวังตัวไว้แล้ว** `core/retry.ts` ตั้ง `maxAttempts: 3` backoff แบบทวีคูณ `200 ms → 400 ms` จำกัดที่ `5000 ms`
  retry สถานะ `408, 429, 500, 502, 503, 504` และ `allowUnsafeRetries: false` จึงไม่ retry `POST`, `PUT`, `PATCH`, `DELETE` จนกว่าคุณจะสั่งเอง
  ทั้งสองพฤติกรรมเห็นได้ในผลการรัน example ข้างบน
- **ได้ซอร์สเต็ม ไม่ใช่กล่องดำ** คุณคัดลอกทั้งโมดูลไป รวมทั้ง pipeline, adapters, tests และตัวอย่างการต่อกับ Cloudflare Worker ที่มีคอมเมนต์กำกับ แล้วอ่านหรือแก้ได้ทุกบรรทัด

## runtime — สภาพแวดล้อมที่ต้องมี

- **runtime dependency: ไม่มีเลย** `package.json` ไม่มีฟิลด์ `dependencies` โค้ดที่ส่งมอบจึงไม่ต้องใช้แพ็กเกจบุคคลที่สามใด ๆ
- **node builtin ที่ใช้: ไม่มีเลย** โมดูลไม่ import `node:*` ใด ๆ — ไม่มี `fs` ไม่มี `http` ไม่มี `net` ไม่มี `crypto` นี่คือเหตุผลที่ซอร์สชุดเดียวกันรันบน Cloudflare Workers ได้
- **Web platform API ที่ใช้:** `fetch`, `Headers`, `Request`, `Response`, `Blob`, `ArrayBuffer`, `TextDecoder`, `URL`, `AbortController`, `AbortSignal`,
  `DOMException`, `ReadableStream`, `setTimeout` และ `clearTimeout`
- **รันที่ไหนได้:** ใช้ผ่าน bundler/ตัวรัน TypeScript ที่ส่งไปยัง runtime ซึ่งมี Web API เหล่านั้น — Cloudflare Workers, เบราว์เซอร์สมัยใหม่, Deno, Bun และ Node.js 18 ขึ้นไป
  source ใช้ ESM พร้อม `.js` specifier สำหรับไฟล์ TypeScript และผ่านการตรวจ type ภายใต้ `moduleResolution: Bundler`; Node ESM เปล่า ๆ import entry point `.ts` โดยตรงไม่ได้
  ให้ใช้ bundler/ตัวรัน TypeScript ของแอป หรือรัน example ที่แนบมาด้วย `npm run example`
- **รันที่ไหนไม่ได้ด้วยตัวเอง:** runtime ที่ไม่มี `fetch` ส่วนกลาง ต้องให้คุณฉีด `HttpTransport` ของตัวเองผ่าน `createHttpClient({ transport })`
  เพราะ transport เริ่มต้นใช้ `globalThis.fetch` และเนื่องจากไม่มี node builtin โมดูลนี้จึงไม่มี I/O ไฟล์ ปลั๊ก หรือ stream ให้ — พูดคุยผ่าน transport ที่ฉีดเข้ามาเท่านั้น
- **ไม่เหมาะกับงานประเภทไหน:** งานที่อยู่ยาวกว่าหนึ่งคำขอ ไม่มี job queue ไม่มีการจัดตาราง ไม่มีการบันทึกสถานะการลอง และไม่มีสถานะ retry ข้ามโปรเซส
  retry ระยะยาวเป็นหน้าที่ของโมดูลอื่น เช่นเดียวกันกับ response cache, การจำกัดอัตรา และ circuit breaker ซึ่งไม่มีในโมดูลนี้
- **example รันที่ไหน:** `npm run example` ใช้ `vite-node` ซึ่งเป็นเครื่องมือสำหรับพัฒนา ต้องติดตั้ง devDependencies ของโมดูลก่อน และไม่ถูกบรรจุเข้า bundle ของแอปคุณ

สัญญาฉบับเต็ม — ค่าเริ่มต้นของ config, กฎ retry และ idempotency, การจัดการ `Retry-After`, กฎการแปลง response, ตารางรหัสข้อผิดพลาด และโมเดลความปลอดภัย — ดูใน `MODULE.md` และ `DESIGN.md` ในโฟลเดอร์ที่คุณคัดลอกไป
