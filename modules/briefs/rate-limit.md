# MODULE 9 — Rate Limit

## Objective

สร้าง rate-limit contract กลางที่เปลี่ยน storage/backend ได้

---

## Public API

```ts
checkRateLimit({
  key,
  limit,
  windowMs
})
```

คืน:

```ts
{
  allowed: true,
  remaining: 9,
  resetAt: "...",
  retryAfterMs: 0
}
```

---

## Key

Host เป็นคนสร้าง เช่น:

```text
IP
user id
tenant id
API key
phone
endpoint
```

Module ไม่ตัดสิน business identity

---

## Adapter Contract

```ts
interface RateLimitStore {
  consume(...)
}
```

---

## v0.1

Implement:

```text
Memory Adapter
```

เพื่อพิสูจน์ contract/tests

แต่ต้องประกาศชัด:

> ไม่เหมาะกับ distributed production

---

## Production Adapter

เพิ่มเมื่อมี use case จริง

อาจเป็น:

```text
Cloudflare-native store
Redis-compatible service
Postgres
```

อย่าเลือกก่อนมี project pilot

---

## Policies

รองรับ:

```text
fixed window
```

v0.1 อย่างเดียวพอ

ยังไม่ต้อง sliding window/token bucket

---

## Error Integration

เมื่อ blocked:

```text
RATE_LIMITED
retryAfter
```

เข้ากับ Error Module

---

## Tests

```text
first request
remaining count
limit reached
window reset
independent keys
invalid config
concurrent consume behavior
```

---

## Definition of Done

```text
[ ] Core contract
[ ] fixed window
[ ] memory adapter
[ ] standardized result
[ ] tests
[ ] MODULE.md
```

---
