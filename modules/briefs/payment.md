# MODULE 5 — Payment Core + Stripe Adapter

## Objective

สร้าง payment abstraction กลาง

```text
Business Project
      ↓
Payment Core
      ↓
Payment Provider
      ↓
Stripe
```

Business Project ห้ามเรียก Stripe SDK กระจายทั่วระบบ

---

## Core Responsibilities

รองรับ concept:

```text
create payment
retrieve payment
refund
payment status
provider metadata
```

---

## Payment Request

```ts
type CreatePaymentRequest = {
  amount: number
  currency: string

  referenceId: string

  customerId?: string

  description?: string

  metadata?: Record<string, string>
}
```

---

## Result

```ts
type PaymentResult = {
  success: boolean

  paymentId?: string

  status?: string

  checkoutUrl?: string

  provider?: string

  providerReference?: string

  error?: PaymentError
}
```

---

## Provider Contract

```ts
interface PaymentProvider {
  createPayment(...)
  getPayment(...)
  refundPayment(...)
}
```

---

## Stripe Adapter

v0.1 implement:

```text
Stripe
```

Secrets inject จาก Host

ห้าม hard-code Stripe secret

---

## Amount Rule

Core ต้องกำหนดให้ชัดว่าใช้:

```text
minor units
```

เช่น:

```text
10000 = 100.00 THB
```

ห้ามใช้ floating-point จำนวนเงินจริงภายใน core

---

## Payment State

Core normalized status เช่น:

```text
pending
requires_action
processing
succeeded
failed
refunded
cancelled
```

Stripe-specific status ต้องถูก map เข้า normalized status

---

## Idempotency

ทุก create/refund operation ต้องรองรับ:

```text
idempotencyKey
```

---

## Webhook

Payment Module ห้ามสร้าง webhook infrastructure ใหม่

ต้องใช้:

```text
Webhook Receiver Module
```

Stripe Adapter อาจมี:

```ts
parsePaymentEvent()
```

แต่ request verification เป็นเรื่อง Webhook Receiver/Stripe verifier

---

## Security

ห้าม:

```text
รับ card number เอง
เก็บ CVV
log payment secret
log sensitive payment method
```

ใช้ Stripe-hosted/tokenized flow ตาม use case

---

## Out of Scope

```text
subscription
plan
entitlements
invoice UI
accounting
tax engine
```

---

## Tests

ใช้ provider mocks ก่อน

อย่างน้อย:

```text
create payment success
create failure
retrieve
refund
double request/idempotency
invalid amount
unsupported currency
provider timeout
error normalization
```

Stripe integration test แยกจาก unit test

---

## Definition of Done

```text
[ ] Payment core
[ ] Provider contract
[ ] Stripe adapter
[ ] normalized states
[ ] integer amount rule
[ ] idempotency
[ ] structured errors
[ ] unit tests
[ ] integration example
[ ] MODULE.md
```

หมายเหตุ:

ก่อน implement Stripe adapter จริง ต้อง verify Stripe official API/docs รุ่นปัจจุบันก่อนเสมอ

---
