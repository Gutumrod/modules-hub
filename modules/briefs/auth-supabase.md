# MODULE 7 — Supabase Auth Helpers

## Objective

ไม่สร้าง authentication engine ใหม่

สร้าง reusable integration helpers รอบ Supabase Auth

---

## Responsibilities

```text
get current user
require login
require role
require permission
tenant membership
normalized errors
```

---

## Core API

ตัวอย่าง:

```ts
getCurrentUser()
requireUser()
requireRole()
requirePermission()
requireTenantMembership()
```

---

## Auth Context

Normalized:

```ts
type AuthContext = {
  userId: string

  roles?: string[]

  tenantId?: string

  permissions?: string[]
}
```

---

## Important Rule

Browser/session/API differences ต้องอยู่ adapter/integration layer

Business logic ควรได้ AuthContext ที่ normalized แล้ว

---

## Tenant Guard

ต้องรองรับ multi-tenant:

```text
User
 ↓
Membership
 ↓
Tenant
```

และต้องป้องกัน user จาก tenant A เข้าข้อมูล tenant B

---

## Error Types

```text
UNAUTHENTICATED
FORBIDDEN
TENANT_ACCESS_DENIED
INVALID_SESSION
```

---

## Out of Scope

```text
password storage
custom JWT issuer
OAuth provider implementation
custom authentication database
```

---

## Tests

```text
authenticated
not authenticated
role allowed
role denied
permission allowed
tenant allowed
tenant denied
expired session
```

---

## Definition of Done

```text
[ ] AuthContext
[ ] requireUser
[ ] role guard
[ ] permission guard
[ ] tenant guard
[ ] normalized errors
[ ] tests
[ ] example
[ ] MODULE.md
```

---
