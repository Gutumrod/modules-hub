# 5 — FEATURE FLAGS

> **Document role:** Historical implementation brief/input. Current version, maturity, public API, and limitations are governed by `../REGISTRY.md`, `../ROADMAP.md`, and the module’s `MODULE.md`/`DESIGN.md`. Do not treat old Planned/Stage labels in this brief as current status.


## Classification

```text
Full Module
Priority: P1
Status: Planned
Initial Version: 0.1.0 experimental
```

---

## Objective

สร้าง contract กลางสำหรับเปิด/ปิด feature แบบ runtime โดยไม่ให้ business logic ผูกกับ storage/provider

Architecture:

```text
Business Logic
      ↓
Feature Flag Core
      ↓
Flag Store / Provider
```

---

## Important Boundary

Feature Flag **ไม่ใช่ Subscription Entitlement**

Feature Flag ใช้กับ:

```text
rollout
kill switch
pilot feature
temporary enable/disable
internal test
runtime control
```

Entitlement ใช้กับ:

```text
user/tenant มีสิทธิ์ใช้ feature ตาม plan หรือไม่
```

ตัวอย่าง:

```text
Feature Flag:
new_dashboard_enabled

Entitlement:
can_use_ai_reply
```

ห้ามใช้ Feature Flag แทน permission/billing entitlement

---

## Public API

v0.1 เน้น boolean flag

ขั้นต่ำ:

```ts
isEnabled()
getFlag()
```

Concept:

```ts
type FeatureFlagContext = {
  tenantId?: string
  userId?: string
  environment?: string

  attributes?: Record<string, string | number | boolean>
}
```

Call:

```ts
isEnabled({
  key,
  context,
  defaultValue
})
```

---

## Result

```ts
type FeatureFlagResult = {
  key: string
  enabled: boolean

  source?: string

  reason?: string
}
```

`reason` ต้องไม่ expose internal secrets/query details

---

## Store Contract

```ts
interface FeatureFlagStore {
  getFlag(key, context): Promise<StoredFlag | null>
}
```

Core ไม่รู้ว่า storage คือ:

```text
memory
Postgres
Supabase
remote flag service
config service
```

---

## v0.1 Adapter

Implement:

```text
Memory Adapter
```

เพื่อ:

```text
tests
local development
contract validation
```

Memory Adapter ต้องประกาศชัด:

> ไม่ใช่ distributed production flag store

Production adapter รอ project pilot จริง

---

## Default Behavior

ทุก flag query ต้องมี deterministic fallback

เช่น:

```text
flag missing
provider unavailable
```

ต้องมี policy ชัด

Default ที่ปลอดภัย:

```text
use explicitly supplied defaultValue
```

ถ้าไม่มี default:

```text
false
```

เว้นแต่ contract หลัง review กำหนดต่างออกไป

---

## Targeting

v0.1 ห้ามสร้าง experimentation engine ใหญ่

รองรับ context เพื่อเตรียม contract ได้ แต่ Memory Adapter ไม่จำเป็นต้อง implement complex rule language

ถ้าจำเป็น อนุญาต simple exact matching:

```text
tenantId
userId
environment
```

ก่อน

---

## Runtime Updates

Core ต้องไม่ cache แบบไม่มี invalidation จนทำให้:

```text
แก้ flag แล้วต้อง deploy ใหม่
```

ถ้ามี cache ให้เป็น optional adapter concern พร้อม TTL/invalidations ชัดเจน

v0.1 ไม่จำเป็นต้อง cache

---

## Error Contract

```text
FLAG_KEY_INVALID
FLAG_PROVIDER_ERROR
FLAG_VALUE_INVALID
```

Provider failure ไม่ควร crash application ถ้า fallback policy มีอยู่

แต่ต้อง expose diagnostics ผ่าน result/hook อย่างเหมาะสม

---

## Security

ห้ามใส่:

```text
API secrets
password
access tokens
private credentials
```

ลง feature flag values

Feature flag ไม่ใช่ secret storage

Server-side flags ที่ sensitive ห้าม expose full flag definitions ไป client โดย default

---

## Out of Scope

```text
A/B test analytics
conversion tracking
experiment statistics
billing entitlement
permission engine
remote admin dashboard
secret management
complex segmentation language
percentage rollout v0.1
multivariate flags v0.1
```

---

## Tests

```text
flag true
flag false
missing flag
default true
default false
tenant context
user context
environment context
provider failure
invalid value
memory update visible at runtime
independent contexts
```

---

## Definition of Done

```text
[ ] Boolean Feature Flag contract
[ ] FeatureFlagContext
[ ] Store interface
[ ] Memory adapter
[ ] Deterministic fallback
[ ] Runtime mutable behavior proven
[ ] No entitlement duplication
[ ] No secret storage
[ ] Tests
[ ] Integration example
[ ] MODULE.md
[ ] VERSION
```

---
