# MODULE 4 — Audit Log

> **Document role:** Historical implementation brief/input. Current version, maturity, public API, and limitations are governed by `../REGISTRY.md`, `../ROADMAP.md`, and the module’s `MODULE.md`/`DESIGN.md`. Do not treat old Planned/Stage labels in this brief as current status.


## Objective

สร้าง contract กลางสำหรับบันทึกว่า:

> ใคร ทำอะไร กับข้อมูลอะไร เมื่อไหร่ และเปลี่ยนจากอะไรเป็นอะไร

---

## Architecture

```text
Business Action
      ↓
Audit Module
      ↓
Audit Storage Adapter
```

---

## Audit Event Contract

```ts
type AuditEvent = {
  actor: {
    id?: string
    type: string
  }

  action: string

  entity: {
    type: string
    id: string
  }

  before?: unknown
  after?: unknown

  metadata?: Record<string, unknown>

  timestamp?: string
}
```

---

## Example

```ts
audit.record({
  actor: {
    id: "user_123",
    type: "user"
  },

  action: "status.changed",

  entity: {
    type: "ticket",
    id: "TKT-123"
  },

  before: {
    status: "open"
  },

  after: {
    status: "closed"
  }
})
```

Audit Core ไม่ต้องรู้ว่า Ticket คืออะไร

---

## Sensitive Data Redaction

ต้องรองรับ field redaction เช่น:

```text
password
token
secret
authorization
apiKey
creditCard
```

และ Host สามารถเพิ่ม custom sensitive fields

---

## Storage Contract

```ts
interface AuditStore {
  append(event)
  query(filters)
}
```

---

## v0.1

Implement:

```text
InMemory Adapter
```

สำหรับ tests/reference

และ:

```text
Supabase/Postgres Adapter
```

ถ้าจะใช้จริง

---

## Important Rule

Audit history ควร append-only

Host ไม่ควรแก้ audit record เดิม

---

## Query

รองรับ filter:

```text
actor
action
entity type
entity id
date range
```

---

## Out of Scope

```text
analytics
dashboard
alerting
SIEM
full event sourcing
```

---

## Tests

```text
record event
before/after
metadata
redaction
query entity
query actor
date filtering
storage failure
secret leakage
```

---

## Definition of Done

```text
[ ] Generic audit contract
[ ] Redaction
[ ] Adapter interface
[ ] At least one working storage adapter
[ ] Query
[ ] Unit tests
[ ] MODULE.md
```

---
