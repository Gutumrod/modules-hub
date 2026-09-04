# MODULE 6 — Subscription + Entitlement

> **Document role:** Historical implementation brief/input. Current version, maturity, public API, and limitations are governed by `../REGISTRY.md`, `../ROADMAP.md`, and the module’s `MODULE.md`/`DESIGN.md`. Do not treat old Planned/Stage labels in this brief as current status.


## Objective

แยก subscription business state ออกจาก Stripe

```text
Subscription Module
        │
        ├── Plan
        ├── Subscription
        ├── Trial
        └── Entitlement
```

Stripe เป็น billing provider

Stripe ไม่ใช่ source of truth ของ feature permissions ภายใน app โดยตรง

---

## Subscription State

Normalize เป็น:

```text
trialing
active
past_due
grace_period
cancel_at_period_end
cancelled
expired
```

---

## Plan Contract

```ts
type Plan = {
  id: string
  name: string

  billingInterval?: "month" | "year"

  entitlements: Record<string, EntitlementValue>
}
```

---

## Example

```ts
{
  id: "pro",

  entitlements: {
    max_staff: null,
    max_bookings: null,
    ai_reply: true,
    custom_line_oa: true
  }
}
```

`null` สามารถนิยามเป็น unlimited ตาม contract

---

## Entitlement API

สำคัญที่สุด:

```ts
canUseFeature()
getLimit()
checkUsage()
```

ตัวอย่าง:

```ts
canUseFeature(accountId, "ai_reply")
```

หรือ:

```ts
checkUsage({
  accountId,
  feature: "staff",
  currentUsage: 4
})
```

---

## Host Business Logic

ห้ามกระจาย:

```ts
if (plan === "pro")
```

ทั่ว project

ให้ถาม Subscription Module แทน

---

## Billing Events

รองรับ normalized events:

```text
subscription.started
subscription.renewed
subscription.payment_failed
subscription.cancelled
subscription.expired
```

Stripe adapter/payment layer เป็นคนแปลง event แล้วส่งเข้า subscription core

---

## Trial

รองรับ:

```text
trial start
trial end
trial expired
conversion
```

---

## Grace Period

Configurable:

```text
0 days
3 days
7 days
```

Core ไม่ hard-code

---

## Persistence

ต้องมี repository contract:

```ts
SubscriptionRepository
PlanRepository
```

Core ห้ามผูก Supabase

---

## Out of Scope

```text
payment collection
Stripe API calls
email notification
UI
invoice rendering
```

Notification ใช้ Notification Module

Audit ใช้ Audit Module

---

## Tests

```text
trial → active
active → past_due
past_due → grace
grace → expired
cancel_at_period_end
upgrade
downgrade
feature allowed
feature blocked
numeric limit
unlimited entitlement
```

---

## Definition of Done

```text
[ ] Plan contract
[ ] Subscription state machine
[ ] Trial
[ ] Grace period
[ ] Entitlement engine
[ ] Repository interface
[ ] Event handling
[ ] Tests
[ ] MODULE.md
```

---
