# Dependency Map

Module Hub ไม่ควรกลายเป็น dependency spaghetti

ความสัมพันธ์ที่อนุญาต:

```text
Error + Validation
        ↑
ใช้ได้เกือบทุก Module

Webhook Receiver
        ↓
Payment Stripe Adapter
        ↓
Subscription

Subscription
    ├──→ Notification
    └──→ Audit Log

Payment
    └──→ Audit Log

Auth Helpers
    └──→ Audit Log

Rate Limit
    └──→ Error Contract

Job Runner
    ├──→ Notification
    └──→ AI Provider
```

แต่ Core Modules ไม่ควร import กันเองโดยตรงถ้าไม่จำเป็น

Prefer:

```text
Host Project orchestrates modules
```

มากกว่า:

```text
Module A hard-depends on Module B
```

ตัวอย่างที่ถูก:

```ts
const payment = await paymentModule.createPayment(...)

await audit.record(...)

await notifier.notify(...)
```

Host เป็น orchestrator

---

# Recommended Development Sequence

## Batch A — Infrastructure Base

```text
✅ Notification
⬜ File Storage
⬜ Webhook Receiver
⬜ Audit Log
```

เมื่อจบ Batch A จะมี infrastructure หลักสำหรับ SaaS ส่วนใหญ่แล้ว

---

# Batch B — SaaS Money Layer

```text
⬜ Payment Core + Stripe
⬜ Subscription + Entitlement
```

เป้าหมาย Batch นี้:

สร้าง flow:

```text
Stripe
 ↓
Webhook Receiver
 ↓
Payment
 ↓
Subscription
 ↓
Audit
 ↓
Notification
```

ถ้าทำ flow นี้ได้โดยไม่แก้ core ของ Module ก่อนหน้า ถือว่า architecture Module Hub เริ่มพิสูจน์ตัวเองแล้ว

---

# Batch C — Application Foundation

```text
⬜ Auth Helpers
⬜ Error + Validation
⬜ Rate Limit
```

---

# Batch D — Advanced

```text
⬜ Job / Retry
⬜ AI Provider
```

---

# Global Definition of Done

ก่อน Module ใดเปลี่ยนจาก Experimental → Pilot ต้องผ่านทั้งหมด:

```text
[ ] ไม่มี business-specific logic
[ ] Host inject config/secrets
[ ] Core ไม่ผูก runtime
[ ] Provider/Adapter แยกจาก Core
[ ] Public API documented
[ ] Typed input/output
[ ] Error handling จริง
[ ] ไม่มี secret leak
[ ] Unit tests
[ ] Integration example
[ ] typecheck ผ่าน
[ ] tests ผ่าน
[ ] MODULE.md
[ ] VERSION
[ ] Known limitations
```

ก่อนเปลี่ยน Pilot → Stable:

```text
[ ] ใช้งานจริง Project 1
[ ] เก็บ feedback
[ ] แก้ contract
[ ] ใช้งานจริง Project 2
[ ] ไม่มี breaking architecture issue
[ ] ใช้งาน Project 3 หรือพิสูจน์ reuse ได้เพียงพอ
```

---

# Module Registry — Current

| # | Module | Version | Status |
|---|---|---|---|
| 1 | Notification | 0.2.x | ✅ Completed |
| 2 | File Storage | — | ⬜ Planned |
| 3 | Webhook Receiver | — | ⬜ Planned |
| 4 | Audit Log | — | ⬜ Planned |
| 5 | Payment Core + Stripe | — | ⬜ Planned |
| 6 | Subscription + Entitlement | — | ⬜ Planned |
| 7 | Supabase Auth Helpers | — | ⬜ Planned |
| 8 | Error + Validation | — | ⬜ Planned |
| 9 | Rate Limit | — | ⬜ Planned |
| 10 | Job / Retry | — | ⬜ Planned |
| 11 | AI Provider | — | ⬜ Planned |

---

# งานถัดไป

ทำทีละตัวตามนี้:

```text
NEXT
→ File Storage

THEN
→ Webhook Receiver

THEN
→ Audit Log

THEN
→ Payment + Stripe

THEN
→ Subscription
```

**ห้ามสั่ง Agent ทำทั้ง 10 Modules พร้อมกัน**

แต่ละตัวต้องผ่าน:

```text
Design
→ Implement
→ Test
→ Review
→ Freeze contract
→ ตัวถัดไป
```

เพราะ Notification Module จะเป็น Reference Module ตัวแรก และ Module หลังจากนี้ควร copy มาตรฐานการจัดโครงสร้าง การเขียน MODULE.md, VERSION, tests และ integration example จาก Reference Module เดียวกัน
