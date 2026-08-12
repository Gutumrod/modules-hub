# Module Hub — Master Implementation Brief Pack

**Status:** Notification Module ✅ Completed  
**Purpose:** สร้าง reusable infrastructure modules สำหรับหยิบไปประกอบโปรเจกต์ใหม่ โดยไม่ต้องเขียน infrastructure เดิมซ้ำ

---

# กฎกลางสำหรับทุก Module

ทุก Module ต้องถือกฎนี้เหมือนกัน

## Architecture

Module เป็น:

```text
Host Project
    ↓
Reusable Module
    ↓
Adapter / Provider
```

ไม่ใช่:

```text
Central Service
```

และไม่ deploy แยกเอง เว้นแต่ Module นั้นประกาศชัดว่าเป็น infrastructure service

---

## Module ต้องไม่รู้จัก Business Domain

Core ห้าม hard-code:

```text
booking
ticket
shop
order
customer
KMO
Queueeasy
```

ใช้ generic identifiers เช่น:

```text
entity
resource
actor
event
subject
account
```

---

## Config / Secrets

Host Project เป็นเจ้าของทั้งหมด

```text
Runtime Environment
       ↓
Host Integration
       ↓
Typed Config
       ↓
Module
```

Module ห้ามอ่าน global env เอง

---

## Provider / Adapter

Core ห้ามผูก implementation

```text
Core
 ├── Adapter A
 ├── Adapter B
 └── Adapter C
```

เพิ่ม adapter ใหม่แล้ว core ไม่ควรต้องเปลี่ยน

---

## Required Files

ทุก Module ต้องมี:

```text
MODULE.md
VERSION
index.ts
core/
adapters/ หรือ providers/
tests/
examples/
```

---

## Version

Module ใหม่เริ่ม:

```text
0.1.0
Status: experimental
```

ผ่าน project จริงอย่างน้อย 1 ตัว:

```text
Status: pilot
```

ผ่านอย่างน้อย 2–3 project และ contract นิ่ง:

```text
1.0.0
Status: stable
```

---

# Execution Order

```text
✅ 1. Notification
      ↓
2. File Storage
      ↓
3. Webhook Receiver
      ↓
4. Audit Log
      ↓
5. Payment Core + Stripe
      ↓
6. Subscription + Entitlement
      ↓
7. Supabase Auth Helpers
      ↓
8. Error + Validation
      ↓
9. Rate Limit
      ↓
10. Job / Retry
      ↓
11. AI Provider
```

Payment ควรทำหลัง Webhook Receiver เพราะ Stripe event จะใช้ webhook infrastructure ได้พอดี

---
