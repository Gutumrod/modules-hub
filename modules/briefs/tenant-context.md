# 4 — TENANT CONTEXT

## Classification

```text
Full Module
Priority: P1
Status: Planned
Initial Version: 0.1.0 experimental
```

---

## Objective

สร้างมาตรฐานกลางสำหรับ represent และส่งต่อ current tenant context ภายใน multi-tenant application

Host และ Modules ควรได้รับ context รูปเดียวกัน เช่น:

```text
Tenant
Actor
Request
Runtime
```

โดยไม่ต้องสร้าง object format ใหม่ทุก project

---

## Important Boundary

Tenant Context **ไม่ใช่ Authentication Module**

Supabase Auth Helpers มีหน้าที่:

```text
authenticate user
require user
role
permission
tenant membership guard
```

Tenant Context มีหน้าที่:

```text
represent resolved tenant
validate context shape
pass tenant scope through application
```

ห้าม duplicate:

```text
password
JWT
session verification
role engine
permission engine
membership database queries
```

---

## Architecture

```text
Authentication / Request
        ↓
Host resolves tenant
        ↓
Tenant Context
        ↓
Business Logic / Modules
```

---

## Tenant Context Contract

Concept:

```ts
type TenantContext = {
  tenantId: string

  actorId?: string

  requestId?: string
  correlationId?: string

  environment?: string

  metadata?: Record<string, unknown>
}
```

สามารถเพิ่ม generic tenant key/slug ในอนาคตได้ถ้ามี use caseจริง

แต่ `tenantId` ต้องเป็น canonical identifier

---

## Public API

ขั้นต่ำ:

```ts
createTenantContext()
validateTenantContext()
requireTenantContext()
```

อาจมี helper:

```ts
withTenantContext()
```

แต่ต้องไม่ใช้ global mutable variable

---

## Explicit Context First

v0.1 ต้องใช้:

```text
explicit context passing
```

เป็น default

ตัวอย่าง architecture:

```text
request
  ↓
TenantContext
  ↓
service(context, input)
```

ห้ามสร้าง dependency กับ:

```text
Node AsyncLocalStorage
Cloudflare-specific context
Deno-specific runtime storage
```

ใน Core

ถ้าต้องการ implicit request context ในอนาคต ให้ทำ runtime adapter แยก

---

## Tenant Resolution

Tenant Context Module ไม่ควรเดา tenant เองจาก:

```text
hostname
subdomain
header
JWT
URL
```

Host เป็นคน resolve

ถ้าต้องสร้าง abstraction:

```ts
interface TenantContextResolver {
  resolve(input): Promise<TenantContext | null>
}
```

แต่ source-specific resolver ต้องอยู่ adapter

---

## Membership Authorization

Flow ที่ถูกต้อง:

```text
Auth Helper
    ↓
verify membership
    ↓
Host
    ↓
create TenantContext
```

ไม่ใช่:

```text
Tenant Context
→ query Supabase users
→ inspect roles
```

---

## Tenant Isolation Rule

ทุก operation ที่ tenant-scoped ต้องได้รับ canonical:

```text
tenantId
```

Host ไม่ควรใช้ arbitrary tenant id จาก user input โดยยังไม่ verify

Module ต้อง document ชัด:

> Valid TenantContext หมายถึง shape ถูกต้อง ไม่ได้หมายความว่า actor ได้รับ authorization แล้ว

Authorization เป็นหน้าที่ Host/Auth layer

---

## Error Contract

```text
TENANT_CONTEXT_REQUIRED
TENANT_CONTEXT_INVALID
TENANT_ID_INVALID
TENANT_RESOLUTION_FAILED
```

อย่าใช้:

```text
TENANT_ACCESS_DENIED
```

ใน Core ถ้า Module ไม่ได้เป็นคน authorize

---

## Security

ต้องป้องกัน:

```text
context mutation
tenant id confusion
untrusted metadata overriding canonical fields
cross-request context leak
global singleton tenant state
```

canonical fields ห้ามถูก metadata override

---

## Out of Scope

```text
authentication
authorization
membership database
tenant CRUD
billing
subscription
tenant settings
RLS policy generation
database connection routing
subdomain routing
```

---

## Tests

```text
valid context
missing tenant
invalid tenant id
metadata
canonical field protection
context immutable behavior
context passed between layers
resolver success
resolver missing
resolver failure
no global tenant leakage
```

---

## Definition of Done

```text
[ ] TenantContext contract
[ ] Explicit context passing
[ ] create/validate/require helpers
[ ] Resolver contract ถ้าจำเป็น
[ ] No auth implementation
[ ] No membership duplication
[ ] Canonical tenantId rule
[ ] Cross-request safety documented
[ ] Tests
[ ] Integration example with Auth Helpers
[ ] MODULE.md
[ ] VERSION
```

---
