# Health Check Module

**Version:** 0.2.0 (P2)
**Status:** ✅ Completed

## Overview

โมดูล **Health Check** เป็นมาตรฐานกลางสำหรับตรวจสอบความพร้อมในการทำงานของแอปพลิเคชันและบริการที่เกี่ยวข้อง (Dependencies) โดยรวบรวมสถานะจากหลายแหล่งมาสรุปเป็นรายงานเดียว เพื่อใช้ในการทำ Monitoring หรือทำ Liveness/Readiness Probes ในระบบ Infrastructure

## Features

- **Status Aggregation**: รวบรวมสถานะจากหลาย Checkers และสรุปเป็นสถานะรวม (`UP`, `DOWN`, `DEGRADED`)
- **Extensible Registry**: สามารถลงทะเบียน Checker เพิ่มเติมได้ตามต้องการ (เช่น DB, Redis, External API)
- **Built-in Checkers**: มาพร้อมกับ `HttpHealthChecker` สำหรับตรวจสอบสถานะผ่าน URL
- **Structured JSON Report**: ให้ผลลัพธ์เป็นโครงสร้าง JSON มาตรฐาน พร้อมข้อมูลรายละเอียด (Details) และ Timestamp
- **Edge Runtime Compatible**: ทำงานได้บน Cloudflare Workers และสภาพแวดล้อม TypeScript อื่นๆ

## Installation

```bash
# โมดูลนี้เป็น Pure TypeScript ไม่มีการพึ่งพา external dependencies
npm install @module-hub/health-check
```

## Quick Start

```ts
import { HealthCheckRegistry, HttpHealthChecker } from '@module-hub/health-check';

// 1. สร้าง Registry
const registry = new HealthCheckRegistry('1.0.0');

// 2. ลงทะเบียน Checkers
registry.register(new HttpHealthChecker('api-gateway', 'https://api.example.com'));

// 3. ดึงรายงานสถานะ
const report = await registry.getReport();
console.log(report.status); // 'UP' | 'DOWN' | 'DEGRADED'
```

## Core API

### `HealthCheckRegistry.register(checker)`
ลงทะเบียนตัวตรวจสอบสุขภาพใหม่

### `HealthCheckRegistry.getReport()`
รันการตรวจสอบทั้งหมดและสรุปผลเป็น `HealthReport`

### `HttpHealthChecker`
Checker สำเร็จรูปสำหรับตรวจสอบ HTTP Endpoint

## Health Status Rules

| Status | Condition |
|---|---|
| `UP` | ทุก Checker มีสถานะเป็น `UP` |
| `DOWN` | มีอย่างน้อย 1 Checker มีสถานะเป็น `DOWN` |
| `DEGRADED` | ไม่มีตัวใดเป็น `DOWN` แต่มีอย่างน้อย 1 ตัวเป็น `DEGRADED` |

## Best Practices
- **Timeout**: ควรกำหนด Timeout ให้กับทุก Checker เพื่อไม่ให้การดึงรายงานค้างนานเกินไป
- **Graceful Error Handling**: ตัวโมดูลถูกออกแบบมาให้ดักจับ Error จาก Checker อัตโนมัติและรายงานเป็นสถานะ `DOWN` แทนการหยุดทำงาน
