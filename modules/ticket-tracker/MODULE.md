# Ticket Tracker Module

**Version:** 0.2.0
**Status:** ✅ Completed
**Documentation Authority:** Current version/status follow `../REGISTRY.md`; this document describes the module contract/design for that registered version.

**Package Name:** `@module-hub/ticket-tracker`

## Overview

โมดูล ticket lifecycle แบบ **login-agnostic และ storage-agnostic** — รองรับโครงสร้างฟิลด์ สถานะ (Statuses) เงื่อนไขการเปลี่ยนสถานะ (Allowed Transitions) และลำดับความสำคัญ (Priorities) แบบไดนามิกผ่าน `TicketSchema` (พร้อม `DEFAULT_SCHEMA` สำหรับความเข้ากันได้ย้อนหลัง) โมดูลนี้ไม่รู้จัก auth เลย ไม่มี concept เรื่อง user/role/session — host เป็นคนต่อสาย auth เอง และไม่รู้จัก multi-tenant โดยตรง

## Features

- **Dynamic `TicketSchema`**: กำหนดฟิลด์ (`TicketFieldDef`), สถานะ (`statuses`), กฎการเปลี่ยนสถานะ (`allowedTransitions`) และระดับความสำคัญ (`priorities`) ได้อย่างยืดหยุ่นตามความต้องการของโดเมน
- **Storage-agnostic ผ่าน `TicketStore` interface**: `list` / `get` / `create` / `updateStatus` — มาพร้อม `createJsonFileStore(filePath)` เป็น default
- **Route handlers แบบแยกชิ้น ไม่มัดเป็น Router**: `createTicketRoutes(store, schemaOrResolver)` คืน 4 handler เดี่ยวๆ (`createTicket`, `listTickets`, `getTicket`, `updateStatus`) host เลือกเองว่าจะครอบ middleware อะไรกับ route ไหน
- **Zero auth, zero env access**: core ไม่อ่าน `process.env`, ไม่ import auth package ใดๆ

## Installation

โมดูลนี้เป็น copy-only ตามกฎของ `modules-hub/INDEX.md` — คัดลอกทั้งโฟลเดอร์ `modules/ticket-tracker/` ไปไว้ในโปรเจกต์ปลายทาง ห้าม import ข้าม path ตรงๆ

## Quick Start (Express)

```ts
import { createJsonFileStore, createTicketRoutes, DEFAULT_SCHEMA } from './ticket-tracker/index.js';

const store = createJsonFileStore('./tickets.json');
const tickets = createTicketRoutes(store, DEFAULT_SCHEMA);

app.post('/api/tickets', tickets.createTicket);
app.get('/api/tickets/:id', tickets.getTicket);

// Host decides which routes need auth — module has no opinion here.
app.get('/api/tickets', requireHandlerAuth, tickets.listTickets);
app.patch('/api/tickets/:id/status', requireHandlerAuth, tickets.updateStatus);
```

## Repurposing for a different domain

โฮสต์สามารถกำหนด `TicketSchema` ของตัวเอง (เช่น สำหรับแจ้งซ่อมรถยนต์ โฮสต์สามารถกำหนดฟิลด์ `license_plate`, `estimated_cost` และสถานะเฉพาะได้ทันที) โดยไม่ต้องแก้ไขโค้ดภายในโมดูล
