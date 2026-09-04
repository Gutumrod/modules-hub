# Tenant Context Module

**Version:** 0.3.0
**Status:** ✅ Completed
**Documentation Authority:** Current version/status follow `../REGISTRY.md`; this document describes the module contract/design for that registered version.

## Overview

โมดูล **Tenant Context** เป็นมาตรฐานกลางสำหรับจัดการข้อมูลบริบทของ Tenant (Tenant Context) ในแอปพลิเคชันแบบ Multi-tenant โดยเน้นความปลอดภัย ความไม่เปลี่ยนแปลงของข้อมูล (Immutability) และการแยกขอบเขตข้อมูลลูกค้าอย่างชัดเจน

## Features

- **Standardized Contract**: กำหนดโครงสร้าง `TenantContext` ที่ชัดเจน (`tenantId`, `actorId`, `requestId`, `environment`)
- **Deep Immutability**: ข้อมูล Context ทั้งหมดจะถูก Freeze เพื่อป้องกันการแก้ไขระหว่างการส่งต่อในชั้น Business Logic
- **Canonical Protection**: ระบบป้องกัน Metadata ไม่ให้เขียนทับฟิลด์สำคัญ (เช่น `tenantId`)
- **Explicit Context Passing**: ออกแบบมาเพื่อส่งต่อผ่าน Parameter โดยตรง (Zero Global State) เพื่อความปลอดภัยในสภาพแวดล้อมแบบ Async/Edge
- **Validation Helpers**: เครื่องมือตรวจสอบความถูกต้องของ Context ที่รับมาจากภายนอก
- **Framework-neutral Manager**: Core รับ `TenantHeaderReader`; HTTP response mapping อยู่ใน adapter แยก

## Installation

```bash
# โมดูลนี้เป็น Pure TypeScript ไม่มีการพึ่งพา external dependencies
npm install @module-hub/tenant-context
```

## Quick Start

```ts
import { createTenantContext, requireTenantContext } from '@module-hub/tenant-context';

// 1. Host resolves tenant and creates context
const context = createTenantContext({
  tenantId: 'tenant_acme',
  actorId: 'user_123',
  environment: 'production'
});

// 2. Pass context to your services
async function saveInvoice(ctx: TenantContext, data: any) {
  // 3. Assert context validity at boundary
  const validCtx = requireTenantContext(ctx);
  
  console.log(`Saving for tenant: ${validCtx.tenantId}`);
  // db.invoices.create({ ...data, tenantId: validCtx.tenantId });
}
```

## Core API

### `createTenantContext(input, config?)`
สร้าง `TenantContext` ที่ผ่านการตรวจสอบและ Freeze แล้ว
- `input`: ข้อมูล Tenant, Actor, Request ID ฯลฯ
- `config`: (Optional) กำหนดรูปแบบ `tenantIdPattern` หรือ `allowedEnvironments`

### `validateTenantContext(input)`
ตรวจสอบโครงสร้างของ Object ว่าเป็นไปตามสัญญาของ `TenantContext` หรือไม่ โดยไม่โยน Error (คืนค่าเป็น result object)

### `requireTenantContext(input)`
ตรวจสอบและยืนยันว่าข้อมูลเป็น `TenantContext` ที่ถูกต้อง หากไม่ใช่จะโยน `TenantContextError`

### `withTenantContext(context, callback)`
Helper สำหรับรัน Logic ภายใต้บริบทของ Tenant ที่กำหนด (เน้นการส่งต่อแบบ Explicit)

## Security Rules
- **Immutability**: Context ทุกชิ้นที่สร้างผ่านโมดูลนี้จะไม่สามารถแก้ไขได้ (Frozen)
- **Isolation**: ห้ามใช้ Global Singleton สำหรับเก็บ Context เพื่อป้องกันข้อมูลรั่วไหลระหว่าง Request ใน Edge Runtime
- **Metadata Protection**: ฟิลด์หลักอย่าง `tenantId` จะไม่สามารถถูก Override ผ่าน metadata payload ได้

## Error Handling
โมดูลจะโยน `TenantContextError` พร้อมรหัส:
- `TENANT_ID_INVALID`: รูปแบบ Tenant ID ไม่ถูกต้อง
- `TENANT_CONTEXT_REQUIRED`: ไม่มีการส่ง Context เข้ามาในจุดที่จำเป็น
- `TENANT_CONTEXT_INVALID`: โครงสร้างข้อมูลไม่ถูกต้องตามสัญญา
