# Supabase Auth Helpers Module

**Version:** 0.2.0 (P1)
**Status:** ✅ Completed

## Overview

โมดูล **Supabase Auth Helpers** เป็นชุดเครื่องมือสำหรับช่วยจัดการ Authentication และ Authorization รอบๆ Supabase Auth โดยเน้นการสร้างมาตรฐานกลาง (Normalized Context) เพื่อให้ Business Logic ไม่ผูกติดกับ SDK ของ Supabase โดยตรง

## Features

- **Normalized AuthContext**: แปลงข้อมูล User จาก Supabase เป็นโครงสร้างมาตรฐาน (`userId`, `roles`, `permissions`, `tenantId`)
- **Security Guards**: ชุดฟังก์ชันสำหรับตรวจสอบสิทธิ์แบบ Declarative (`requireUser`, `requireRole`, `requirePermission`)
- **Multi-tenant Isolation**: ระบบป้องกันการเข้าถึงข้อมูลข้าม Tenant (`requireTenantMembership`)
- **Structured Errors**: ระบบ Error มาตรฐาน (`UNAUTHENTICATED`, `FORBIDDEN`, `TENANT_ACCESS_DENIED`, `INVALID_SESSION`)
- **Edge Runtime Compatible**: ทำงานได้บน Cloudflare Workers และสภาพแวดล้อมที่รองรับ Web Standards

## Installation

```bash
# ติดตั้ง dependencies (หากใช้ Supabase)
npm install @supabase/supabase-js
```

## Quick Start

```ts
import { createSupabaseAuthHelpers } from '@module-hub/auth-supabase';
import { createClient } from '@supabase/supabase-js';

// 1. Initialize Supabase Client
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// 2. Create Auth Helpers
const auth = createSupabaseAuthHelpers({
  supabaseClient: supabase,
  // Optional: Custom resolvers for your database schema
  roleResolver: (user) => user.app_metadata.roles || [],
});

// 3. Use in your logic
async function handleRequest(jwt: string) {
  // Get user context
  const context = await auth.requireUser({ jwt });
  
  // Check permissions
  auth.requirePermission('reports:read');
  
  // Check tenant isolation
  auth.requireTenantMembership('tenant_123');
  
  return { data: 'Secret Data' };
}
```

## Core API

### `getCurrentUser(options?)`
ดึงข้อมูลผู้ใช้ปัจจุบันและแปลงเป็น `AuthContext` หากไม่มีการเข้าสู่ระบบจะคืนค่า `null`

### `requireUser(options?)`
เหมือน `getCurrentUser` แต่จะโยน `UNAUTHENTICATED` error หากไม่มีการเข้าสู่ระบบ

### `requireRole(role, options?)`
ตรวจสอบว่าผู้ใช้มี Role ที่กำหนดหรือไม่ หากไม่มีจะโยน `FORBIDDEN` error

### `requirePermission(permission, options?)`
ตรวจสอบว่าผู้ใช้มี Permission ที่กำหนดหรือไม่ หากไม่มีจะโยน `FORBIDDEN` error

### `requireTenantMembership(tenantId)`
ตรวจสอบว่าผู้ใช้ปัจจุบันสังกัด Tenant ที่ระบุหรือไม่ เพื่อป้องกันการเข้าถึงข้อมูลข้าม Tenant

### `hasPermission(userRole, permission)`
ตรวจสอบแบบ static ว่า Role หนึ่งมี Permission หนึ่งหรือไม่ (owner → read/write/delete/manage_billing, admin → read/write/delete, member → read/write, guest → read) Role ที่ไม่รู้จักจะถูกปฏิเสธ (fail closed)

### `buildRlsContext(tenantId, userId, role)`
สร้าง object `request.jwt.claim.*` สำหรับ Supabase RLS policy จาก tenant/user/role ที่ resolve แล้ว — Host นำไป inject ให้ Supabase client เพื่อให้ RLS policy ประเมิน tenant & role ได้

## Error Handling

โมดูลจะโยน `AuthError` ซึ่งประกอบด้วย:
- `code`: รหัสข้อผิดพลาด (เช่น `FORBIDDEN`)
- `status`: HTTP Status Code (เช่น 403)
- `message`: ข้อความอธิบายข้อผิดพลาด

## Limitations
- v0.2.0 เพิ่ม static RBAC และ Supabase RLS context helpers แต่ยังไม่ครอบคลุมการจัดการ Password หรือการออก Token ใหม่
- การจัดการ Role/Permission แบบซับซ้อน (Hierarchy) ควรทำผ่าน custom resolvers
