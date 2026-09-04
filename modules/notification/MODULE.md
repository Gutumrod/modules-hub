# Notification Module

**Version:** 0.2.0
**Status:** ✅ Completed
**Documentation Authority:** Current version/status follow `../REGISTRY.md`; this document describes the module contract/design for that registered version.

## Architecture

Module นี้เป็น **reusable embedded module** — ไม่ใช่ standalone service หรือ central gateway
Host project ที่ต้องการส่ง notification จะ **embed** module นี้เข้าไปใน codebase ของตัวเอง
แล้วเรียก `notify()` จาก code ของตัวเอง

Module ไม่ต้องการ:
- ❌ separate workflow engine or middleware
- ❌ separate database
- ❌ separate deployment

Module ทำหน้าที่เดียว: รับ `NotificationEvent` → ส่งไปยัง webhook endpoint
(พร้อม HMAC signature และ retry) ส่วนการ route ไป LINE/Telegram/Email
เป็นหน้าที่ของ destination endpoint ฝั่งปลายทาง **ไม่ใช่** module นี้

### หน้าที่ของ host project

| สิ่งที่ host ต้องทำ | สิ่งที่ module ทำให้ |
|---|---|
| ดึง config/secrets จาก env ของตัวเอง | รับ config ผ่าน factory `createNotifier({ provider })` |
| เลือก provider (WebhookProvider หรืออนาคต LINE/Email) | ส่ง event ไปยัง provider ที่ inject เข้ามา |
| เรียก `notify()` ที่จุดที่ event เกิดจริง | validate event, retry, sign, timeout |
| deploy module ไปพร้อมกับ application | (ไม่ต้อง deploy แยก) |

### ตัวอย่าง: หลายโปรเจกต์ embed module เดียวกัน

```
┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│     Project A       │    │     Project B       │    │     Project C       │
│  (Cloudflare Worker) │    │   (Supabase Edge)   │    │   (Vercel Next.js)  │
│                     │    │                     │    │                     │
│  import {createNoti}│    │  import {createNoti}│    │  import {createNoti}│
│  WebhookProvider     │    │  WebhookProvider     │    │  WebhookProvider     │
│  → notify()          │    │  → notify()          │    │  → notify()          │
└────────┬────────────┘    └────────┬────────────┘    └────────┬────────────┘
         │                          │                          │
         ▼                          ▼                          ▼
   ┌─────────────────────────────────────────────────────────────────┐
   │              Notification Module (core + providers)              │
   │            โค้ดเดียวกัน ไม่ต้องแก้ contract เพื่อโปรเจกต์ใดโปรเจกต์หนึ่ง        │
   └─────────────────────────────────────────────────────────────────┘
```

- **Project A** (Cloudflare Worker): สร้าง booking แล้ว `notify({ type: 'booking.created', payload })`
- **Project B** (Supabase Edge Function): อัปเดต ticket แล้ว `notify({ type: 'ticket.updated', payload })`
- **Project C** (Vercel Next.js): สมัครสมาชิกแล้ว `notify({ type: 'user.registered', payload })`

ทั้งสามโปรเจกต์ใช้ module โค้ดเดียวกัน ต่างแค่ config (URL, secret, headers) ที่ inject เข้ามา

## Contract

Module นี้ไม่รู้จัก business logic ของโปรเจกต์ปลายทาง หน้าที่เดียวคือรับ `NotificationEvent`
แล้วส่งไปยัง webhook endpoint พร้อม HMAC signature — การ route ไป LINE/Telegram/Email
เป็นหน้าที่ของ destination endpoint ฝั่งปลายทาง **ไม่ใช่** module นี้

### Input: `NotificationEvent`

| field | type | required | หมายเหตุ |
|---|---|---|---|
| type | string | ✅ | dot-notation เช่น `booking.created` |
| payload | object | ✅ | ข้อมูลดิบ ไม่ format ล่วงหน้า |
| idempotencyKey | string | ❌ | forward เป็น header ให้ destination dedup เอง |
| occurredAt | string (ISO 8601) | ❌ | เวลาที่ event เกิดจริง |

### Output: `NotificationResult`

| field | type | หมายเหตุ |
|---|---|---|
| ok | boolean | |
| statusCode | number? | HTTP status จาก webhook (ถ้ามี) |
| attempts | number | จำนวนครั้งที่ยิงจริง (รวม attempt แรก) |
| error | NotificationError? | `{ code, message, retryable }` |

### Error Codes

| code | retryable | ความหมาย |
|---|---|---|
| `INVALID_EVENT` | false | event ไม่ผ่าน validation (type ว่าง, payload ไม่ใช่ object, ฯลฯ) |
| `REMOTE_4XX` | false | webhook ตอบ 4xx (ยกเว้น 429) — client error ไม่ retry |
| `RATE_LIMITED` | true | webhook ตอบ 429 |
| `REMOTE_5XX` | true | webhook ตอบ 5xx |
| `NETWORK_ERROR` | true | fetch ล้มเหลว (DNS, connection refused, ฯลฯ) |
| `TIMEOUT` | true | request หมดเวลาก่อน response |
| `SERIALIZATION_ERROR` | false | JSON.stringify ไม่สำเร็จ |

## การใช้งาน

```ts
import { createNotifier } from './core/client';
import { WebhookProvider, type WebhookProviderConfig } from './providers/webhook';

const provider = new WebhookProvider({
  url: env.NOTIFICATION_WEBHOOK_URL,
  secret: env.NOTIFICATION_WEBHOOK_SECRET,       // optional
  timeoutMs: env.NOTIFY_TIMEOUT_MS,              // optional, default 5000
  maxAttempts: env.NOTIFY_MAX_ATTEMPTS,          // optional, default 3
  headers: { Authorization: `Bearer ${env.API_TOKEN}` }, // optional
  // allowInsecureHttp: true,                   // optional, local dev only
});

const notifier = createNotifier({ provider });

const result = await notifier.notify({
  type: 'booking.created',
  payload: { bookingId: 'bk_123' },
  idempotencyKey: 'booking-created-bk_123',
});
```

ดูตัวอย่างเต็มใน `integration.example.ts`

## Config (host project เป็นคน inject — module ห้ามอ่าน env เอง)

**Secrets (ตั้งผ่าน runtime secret manager ของ host เช่น `wrangler secret put`):**
- `NOTIFICATION_WEBHOOK_URL` — webhook endpoint ปลายทาง
- `NOTIFICATION_WEBHOOK_SECRET` — (optional) HMAC signing secret

**Non-sensitive config (ใส่ใน `wrangler.toml` [vars] หรือปล่อย default):**
- `NOTIFY_TIMEOUT_MS` (default 5000) — ms ก่อน timeout ต่อ attempt
- `NOTIFY_MAX_ATTEMPTS` (default 3) — จำนวนครั้งที่ยิงสูงสุด (รวมครั้งแรก)

**Local dev:** ใช้ `.dev.vars` (ดู `.dev.vars.example`) — ห้าม commit เข้า Git

## กติกาการแก้ module นี้

1. ห้ามให้ module อ่าน `env` / `process.env` / `globalThis` เอง — ทุก config ต้องผ่าน constructor/factory
2. ห้ามใส่ business logic เฉพาะโปรเจกต์เข้า `core/` หรือ `providers/` — ถ้าต้อง custom ให้ทำใน integration layer ฝั่ง host project
3. Provider ใหม่ (LINE/Telegram/Email) ต้อง implement `NotificationProvider` interface ใน `core/types.ts` — ห้ามแก้ interface เพื่อเอื้อ provider เดียว
4. Crypto ใช้ Web Crypto API (`crypto.subtle`) เท่านั้น — ห้ามใช้ `node:crypto` (ทำให้รันบน Cloudflare Workers ไม่ได้)

## Integration checklist (สำหรับ agent/dev ที่เอา module นี้ไป embed ในโปรเจกต์)

- [ ] Copy โฟลเดอร์ module ทั้งก้อนเข้า repo ปลายทาง
- [ ] สร้าง webhook endpoint ปลายทาง + ตั้ง secret สำหรับ verify HMAC (ดู `providers/webhook.ts` ฝั่ง sign)
- [ ] ตั้งค่า secrets: `NOTIFICATION_WEBHOOK_URL`, `NOTIFICATION_WEBHOOK_SECRET` (optional)
- [ ] Copy `.dev.vars.example` → `.dev.vars` แล้วใส่ค่าจริงสำหรับ local dev (เช็คว่าอยู่ใน `.gitignore`)
- [ ] เขียน integration layer เอง (ห้ามแก้ core/providers) — สร้าง `WebhookProvider` แล้ว `createNotifier({ provider })` ที่จุดที่ event เกิดขึ้นจริง
- [ ] รัน `npm test` ให้ผ่านก่อน deploy
- [ ] Deploy แล้วยิง event จริง 1 ครั้ง เช็คว่า destination ได้รับและ signature ตรง

## Versioning

Semver ธรรมดา — เปลี่ยนเลขใน `VERSION` ทุกครั้งที่แก้ไข ยังไม่มี CHANGELOG/migration guide
จนกว่าจะผ่านการใช้งานจริง ≥2 โปรเจกต์แล้ว contract เริ่มนิ่ง

## Promote เป็น shared package เมื่อไหร่

เมื่อ module นี้ถูก embed เข้าโปรเจกต์จริงแล้วใช้งาน ≥2-3 โปรเจกต์ โดยไม่ต้องแก้ core contract
(แก้แค่ config ที่ inject เข้ามา) — ถึงตอนนั้นค่อยแยกเป็น `@craftbikelab/notification` npm package
