# MODULE 3 — Webhook Receiver

> **Document role:** Historical implementation brief/input. Current version, maturity, public API, and limitations are governed by `../REGISTRY.md`, `../ROADMAP.md`, and the module’s `MODULE.md`/`DESIGN.md`. Do not treat old Planned/Stage labels in this brief as current status.


## Objective

สร้าง reusable module สำหรับรับ webhook จาก external systems อย่างปลอดภัย

```text
External Provider
       ↓
Webhook Receiver
       ↓
Verified Event
       ↓
Host Business Logic
```

Notification คือ outbound

Webhook Receiver คือ inbound

---

## Responsibilities

Module รับผิดชอบ:

```text
request parsing
payload size validation
signature verification
timestamp validation
replay protection
idempotency
error normalization
standard response
```

Module ไม่ทำ business action

---

## Public API Concept

```ts
const receiver = createWebhookReceiver({
  verifier
})

const result = await receiver.verify(request)
```

คืน:

```ts
{
  valid: true,
  event,
  idempotencyKey
}
```

หรือ structured error

---

## Signature Verifier Contract

```ts
interface WebhookVerifier {
  verify(input): Promise<VerificationResult>
}
```

---

## v0.1 Adapter

สร้าง:

```text
Generic HMAC-SHA256 Verifier
```

Config:

```ts
secret
signatureHeader
timestampHeader?
toleranceSeconds?
```

---

## Future Adapters

```text
LINE
Stripe
GitHub
```

แต่ยังไม่ implement จนมี use case

---

## Replay Protection

ต้องรองรับ timestamp tolerance

ตัวอย่าง:

```text
timestamp เก่ากว่า 5 นาที
→ reject
```

ต้องทำ configurable

---

## Idempotency

Module ต้อง expose event identifier/idempotency key ให้ Host

v0.1 ยังไม่จำเป็นต้องมี database dedup store

แต่ต้องมี adapter interface เผื่ออนาคต

---

## Security

ต้องใช้ constant-time comparison เมื่อเหมาะสม

ห้าม:

```text
log raw secrets
log signature secret
return verification internals
```

จำกัด payload size ก่อน process

---

## Standard Result

```ts
type WebhookResult = {
  valid: boolean
  eventId?: string
  eventType?: string
  payload?: unknown

  error?: {
    code: string
    message: string
  }
}
```

---

## Tests

```text
valid signature
invalid signature
missing signature
invalid timestamp
expired timestamp
malformed JSON
oversized payload
replayed event
idempotency extraction
secret leakage test
```

---

## Out of Scope

```text
business logic
database writes
LINE reply
Stripe subscription update
notification
queue
```

---

## Definition of Done

```text
[ ] Generic receiver core
[ ] HMAC adapter
[ ] Signature verification
[ ] Timestamp validation
[ ] Payload limit
[ ] Idempotency contract
[ ] Standard errors
[ ] Security tests
[ ] Integration example
[ ] MODULE.md
```

---
