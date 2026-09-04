# MODULE 8 — Error + Validation

> **Document role:** Historical implementation brief/input. Current version, maturity, public API, and limitations are governed by `../REGISTRY.md`, `../ROADMAP.md`, and the module’s `MODULE.md`/`DESIGN.md`. Do not treat old Planned/Stage labels in this brief as current status.


## Objective

ทำให้ทุก Module / Project ใช้ error language แบบเดียวกัน

---

## Base Error

```ts
type ErrorShape = {
  code: string

  message: string

  details?: unknown

  requestId?: string

  retryable: boolean
}
```

---

## Error Classes

ขั้นต่ำ:

```text
ValidationError
AuthenticationError
AuthorizationError
NotFoundError
ConflictError
RateLimitError
ExternalServiceError
InternalError
```

---

## Public vs Internal Error

ต้องแยก:

```text
Internal Error
     ↓ sanitize
Public Error
```

ตัวอย่าง:

Internal:

```text
Postgres connection failed at ...
```

Public:

```text
SERVICE_UNAVAILABLE
```

---

## Validation

รองรับ generic validator interface

ไม่จำเป็นต้องสร้าง schema library ใหม่

สามารถ adapter เข้ากับ library ภายนอกได้

Core มี helpers เช่น:

```text
required string
enum
number
URL
ISO date
serialization
```

---

## Config Validation

ต้องรองรับ startup validation:

```text
missing secret
invalid URL
invalid numeric config
```

เพื่อให้ fail-fast

---

## Secret Redaction

Redact keys เช่น:

```text
secret
token
authorization
password
apiKey
cookie
```

---

## Request ID

รองรับ:

```text
requestId
correlationId
```

แต่ Module ไม่ต้อง generate เสมอไป Host สามารถ inject

---

## Out of Scope

```text
logging platform
APM
alerting
UI validation framework
```

---

## Tests

```text
error serialization
public sanitization
stack hiding
secret redaction
validation errors
config validation
retryable classification
```

---

## Definition of Done

```text
[ ] Standard ErrorShape
[ ] Typed errors
[ ] Public sanitizer
[ ] Secret redaction
[ ] Validation helpers
[ ] Config validation
[ ] tests
[ ] MODULE.md
```

---
