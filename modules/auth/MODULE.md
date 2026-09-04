# Data-Agnostic Auth Helpers Module

**Version:** 0.1.0
**Status:** ✅ Completed
**Documentation Authority:** Current version/status follow `../REGISTRY.md`; this document describes the module contract/design for that registered version.

**Package Name:** `@module-hub/auth`  

## Overview

โมดูล **Data-Agnostic Auth Helpers** (`@module-hub/auth`) เป็นชุดเครื่องมือจัดการ Authentication และ Authorization มาตรฐานกลางสำหรับ Module Hub monorepo โดยถูกออกแบบมาให้เป็น **Data-Agnostic และ Login-Agnostic 100%**

ต่างจาก `@module-hub/auth-supabase` ที่ผูกติดกับ Supabase Auth เพียงอย่างเดียว โมดูลนี้เปิดโอกาสให้แอปพลิเคชันทุกรูปแบบ—ไม่ว่าจะเป็น Node.js/Express ที่เก็บ User ใน PostgreSQL/MySQL, Fastify/Prisma, Cloudflare Workers กับ KV/D1, หรือระบบที่ใช้ JWT/Session ทั่วไป—สามารถใช้งานโครงสร้างมาตรฐานกลาง (`AuthContext`), Security Guards (RBAC, PBAC), Multi-tenant Isolation และ Error Model ร่วมกันได้อย่างไร้รอยต่อ

## Features

- **Provider-Agnostic Identity Resolution**: เชื่อมต่อกับ Identity Source ใดๆ ได้ผ่าน `IdentityProvider` interface
- **Normalized AuthContext**: แปลงข้อมูลผู้ใช้จากทุกแหล่งข้อมูลเป็นโครงสร้างมาตรฐานเดียวกัน (`userId`, `roles`, `permissions`, `tenantId`, `email`, `metadata`)
- **Pluggable Concrete Adapters**:
  - `createCredentialStoreAdapter`: สำหรับเชื่อมต่อ Custom Database, In-Memory Store, หรือ ORM (Prisma/Drizzle/Kysely)
  - `createSupabaseAdapter`: สำหรับ Migration หรือโปรเจกต์ที่ใช้งาน Supabase Auth อยู่แล้ว (100% feature parity)
  - `createJwtAdapter`: สำหรับระบบที่ยืนยันตัวตนด้วย Bearer JWT Token
- **Declarative Security Guards**: ตรวจสอบสิทธิ์แบบ Chainable ทั้ง `requireUser`, `requireRole`, และ `requirePermission`
- **Multi-Tenant Isolation**: ระบบป้องกันการเข้าถึงข้อมูลข้าม Tenant (`requireTenantMembership`)
- **Structured Error Model**: โยน `AuthError` มาตรฐาน (`UNAUTHENTICATED`, `FORBIDDEN`, `TENANT_ACCESS_DENIED`, `INVALID_SESSION`) พร้อม HTTP Status Codes (401/403)
- **Zero Heavy SDK Dependencies**: ไม่มี dependency ผูกมัดกับ SDK ภายนอกในระดับ Core
- **Edge Runtime Compatible**: ทำงานได้บน Cloudflare Workers, Node.js, Deno, Bun และ Web Standards

## Installation

```bash
npm install @module-hub/auth
```

*(หมายเหตุ: ตัวโมดูลไม่มี runtime dependencies เพิ่มเติม หากต้องการใช้ Supabase หรือ JWT library ให้ติดตั้งตามที่ Host ต้องการ)*

## Quick Start

### 1. ใช้งานกับ Custom Database / In-Memory Store (Express, Fastify, Prisma)

```ts
import { createAuthHelpers, createCredentialStoreAdapter, AuthError } from '@module-hub/auth';

// 1. Host กำหนดฟังก์ชันตรวจสอบ Credential กับฐานข้อมูลของตนเอง
const dbAdapter = createCredentialStoreAdapter({
  verify: async (sessionToken: string) => {
    // ดึงข้อมูล User จาก Prisma, Drizzle, Postgres หรือ In-Memory Map
    const user = await myDatabase.findSession(sessionToken);
    return user; // คืนค่า raw user หรือ null
  }
});

// 2. สร้าง Auth Helpers พร้อมตัวแปลง (Normalizer)
const auth = createAuthHelpers({
  provider: dbAdapter,
  normalize: (user) => ({
    userId: user.id,
    email: user.email,
    roles: [user.role],
    tenantId: user.organizationId,
    permissions: user.permissions
  }),
  onAuthFailure: (err) => {
    console.warn(`[Auth Failure] ${err.code}: ${err.message}`);
  }
});

// 3. ใช้งานใน Route Handler / Business Logic
async function handleRequest(sessionToken: string, targetOrgId: string) {
  // A. ตรวจสอบการเข้าสู่ระบบ
  const context = await auth.requireUser({ credential: sessionToken });

  // B. ตรวจสอบ Role และ Permission
  auth.requireRole('admin');
  auth.requirePermission('billing:write');

  // C. ป้องกันการเข้าถึงข้าม Tenant / Organization
  auth.requireTenantMembership(targetOrgId);

  return { success: true, user: context.userId };
}
```

### 2. ใช้งานกับ Supabase Auth (Migration / Parity Path)

```ts
import { createAuthHelpers, createSupabaseAdapter } from '@module-hub/auth';
import { createClient } from '@supabase/supabase-js';

// 1. Host สร้าง Supabase client
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);

// 2. เชื่อมต่อผ่าน Supabase Adapter
const supabaseAdapter = createSupabaseAdapter(supabase);
const auth = createAuthHelpers({
  provider: supabaseAdapter
});

// 3. ใช้งานใน Middleware / Endpoint
async function handleSupabaseRequest(jwt: string) {
  const context = await auth.requireUser({ credential: jwt });
  auth.requirePermission('reports:read');
  auth.requireTenantMembership('tenant_123');
  return { data: 'Secret Reports' };
}
```

## Core API

### Factory & Configuration

- `createAuthHelpers(config)`: สร้างชุด Helpers ผูกกับ `IdentityProvider` และ Resolver ที่กำหนด
- `createCredentialStoreAdapter(options)`: สร้าง Adapter สำหรับ custom database/store ผ่าน callback `verify(credential)`
- `createSupabaseAdapter(client)`: สร้าง Adapter สำหรับ Supabase client (`client.auth.getUser`)
- `createJwtAdapter(options)`: สร้าง Adapter สำหรับ JWT token ผ่าน callback `verifyToken(token)`

### Standalone & Helper Methods

- `getCurrentUser(options?)`: ดึงข้อมูลผู้ใช้ปัจจุบันและแปลงเป็น `AuthContext` หากไม่มี session หรือ invalid จะคืนค่า `null`
- `requireUser(options?)`: เหมือน `getCurrentUser` แต่จะโยน `AuthError` (`UNAUTHENTICATED`, 401) หากไม่มีผู้ใช้
- `requireRole(requiredRole, options?)`: ตรวจสอบว่าผู้ใช้มี Role ที่กำหนดหรือไม่ (`mode: 'ANY' | 'ALL'`) หากไม่ผ่านจะโยน `FORBIDDEN` (403)
- `requirePermission(requiredPermission, options?)`: ตรวจสอบว่าผู้ใช้มี Permission ที่กำหนดหรือไม่ (`mode: 'ANY' | 'ALL'`) หากไม่ผ่านจะโยน `FORBIDDEN` (403)
- `requireTenantMembership(tenantId)`: ตรวจสอบว่าผู้ใช้ปัจจุบันสังกัด Tenant ที่ระบุหรือไม่ ป้องกันการเจาะข้อมูลข้าม Tenant หากไม่ตรงจะโยน `TENANT_ACCESS_DENIED` (403)

## Error Handling

ทุกข้อผิดพลาดจากโมดูลจะถูกโยนในรูป `AuthError` (สืบทอดมาจาก `Error`):

```ts
try {
  await auth.requireUser({ credential: token });
  auth.requireRole('admin');
} catch (error) {
  if (error instanceof AuthError) {
    console.error(error.code);   // 'UNAUTHENTICATED' | 'FORBIDDEN' | 'TENANT_ACCESS_DENIED' | 'INVALID_SESSION'
    console.error(error.status); // 401 หรือ 403
    console.error(error.message);
  }
}
```

## Limitations & Architectural Non-Goals

- **ไม่มีการเก็บ Password หรือ Hash รหัสผ่านในโมดูล:** การตรวจสอบ Password หรือ Hashing (เช่น bcrypt/argon2) เป็นหน้าที่ของ Host ภายใน callback `verify`
- **ไม่มีการ Sign Token หรือเก็บ Secret Key:** การ sign/verify JWT หรือ crypto secrets อยู่ในการดูแลของ Host ภายใน callback `verifyToken`
- **ไม่มี Direct DB Drivers:** โมดูลไม่รวม Database Driver หรือ ORM มาในตัวเพื่อรักษาความเบาและปลอดภัยระดับสูงสุด
