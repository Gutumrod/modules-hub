# Ticket Tracker Module

**Package Name:** `@module-hub/ticket-tracker`
**Version:** 0.1.0
**Status:** ✅ Completed (extracted from `products/ticket-tracking-relay`)

## Overview

โมดูล ticket lifecycle แบบ **login-agnostic และ storage-agnostic** — reporter เปิด ticket, handler ทำงานผ่าน status flow คงที่ (`REPORTED → RECEIVED → IN_PROGRESS → DONE → CLOSED`) โมดูลนี้ไม่รู้จัก auth เลย ไม่มี concept เรื่อง user/role/session — host เป็นคนต่อสาย auth เอง (ดู `@module-hub/auth` สำหรับตัวช่วยฝั่งนั้น) และไม่รู้จัก multi-tenant

**ไม่เกี่ยวกับ `products/booking`** — Booking มีระบบ ticket/claim ของตัวเองอยู่แล้ว (Supabase RLS + RPC, 8 status, ผูก `shop_id`/`booking_id`) โมดูลนี้แยกออกมาเผื่อ host อื่นในอนาคตที่ต้องการ flow แบบง่ายกว่านี้ตามที่มีอยู่ใน `ticket-tracking-relay` เท่านั้น

## Features

- **Status state machine คงที่**: `STATUSES`, `PRIORITIES`, `ALLOWED_TRANSITIONS` เป็น constants — host ที่ต้องการ flow อื่นแก้ในสำเนาของตัวเองตรงๆ (ไม่มี config schema ให้ปรับ runtime)
- **Storage-agnostic ผ่าน `TicketStore` interface**: `list` / `get` / `create` / `updateStatus` — มาพร้อม `createJsonFileStore(filePath)` เป็น default
- **Route handlers แบบแยกชิ้น ไม่มัดเป็น Router**: `createTicketRoutes(store)` คืน 4 handler เดี่ยวๆ (`createTicket`, `listTickets`, `getTicket`, `updateStatus`) host เลือกเองว่าจะครอบ middleware อะไรกับ route ไหน
- **Zero auth, zero env access**: core ไม่อ่าน `process.env`, ไม่ import auth package ใดๆ

## Installation

โมดูลนี้เป็น copy-only ตามกฎของ `modules-hub/INDEX.md` — คัดลอกทั้งโฟลเดอร์ `modules/ticket-tracker/` ไปไว้ในโปรเจกต์ปลายทาง ห้าม import ข้าม path ตรงๆ

## Quick Start (Express)

```ts
import { createJsonFileStore, createTicketRoutes } from './ticket-tracker/index.js';

const store = createJsonFileStore('./tickets.json');
const tickets = createTicketRoutes(store);

app.post('/api/tickets', tickets.createTicket);
app.get('/api/tickets/:id', tickets.getTicket);

// Host decides which routes need auth — module has no opinion here.
app.get('/api/tickets', requireHandlerAuth, tickets.listTickets);
app.patch('/api/tickets/:id/status', requireHandlerAuth, tickets.updateStatus);
```

## Swapping the store

Implement `TicketStore` (see `store/types.ts`) against any backend — Postgres, Supabase, in-memory for tests — and pass it to `createTicketRoutes` instead of `createJsonFileStore`. Core and routes never construct a store themselves.

## Repurposing for a different domain

The `Ticket` shape, statuses, and transitions are this module's default use case (reporter files an issue, handler works it). A host with a different domain (e.g. product claims, support cases) edits its own copy of `core/constants.ts`/`core/types.ts` — see DESIGN.md § Non-Goals for why this is intentional rather than a generic config object.
