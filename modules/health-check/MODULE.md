# Health Check Module

**Version:** 0.2.0 (P2)
**Status:** ✅ Completed — verified 2026-08-22: 6/6 tests passing (`tests/unit/registry.test.ts`, `tests/unit/metrics.test.ts`), `tsc --noEmit` clean, exports match `index.ts` (`HealthCheckRegistry`, `SimpleMetricsCollector`, `HttpHealthChecker` + types).

## Overview

โมดูล **Health Check** เป็นมาตรฐานกลางสำหรับตรวจสอบความพร้อมในการทำงานของแอปพลิเคชันและบริการที่เกี่ยวข้อง (Dependencies) โดยรวบรวมสถานะจากหลายแหล่งมาสรุปเป็นรายงานเดียว เพื่อใช้ในการทำ Monitoring หรือทำ Liveness/Readiness Probes ในระบบ Infrastructure

## Features

- **Status Aggregation**: รวบรวมสถานะจากหลาย Checkers และสรุปเป็นสถานะรวม (`UP`, `DOWN`, `DEGRADED`)
- **Extensible Registry**: สามารถลงทะเบียน Checker เพิ่มเติมได้ตามต้องการ (เช่น DB, Redis, External API)
- **Built-in Checkers**: มาพร้อมกับ `HttpHealthChecker` สำหรับตรวจสอบสถานะผ่าน URL (นี่คือ built-in checker ตัวเดียวที่มีในโมดูล — ไม่มี Database/Redis checker สำเร็จรูป ต้องเขียนเอง implement `HealthChecker` interface)
- **Structured JSON Report**: ให้ผลลัพธ์เป็นโครงสร้าง JSON มาตรฐาน พร้อมข้อมูลรายละเอียด (Details) และ Timestamp
- **Edge Runtime Compatible**: ใช้เฉพาะ `fetch`/`AbortController`/`Map` (ES2022 + DOM lib, ไม่มี Node-only API) จึงรันบน Cloudflare Workers ได้ในทางทฤษฎี — ยังไม่ได้ทดสอบบน edge runtime จริงในโมดูลนี้
- **In-Memory Metrics Collector**: `SimpleMetricsCollector` เก็บ counters และ latency samples (สูงสุด 100 รายการล่าสุดต่อ key) ในหน่วยความจำ พร้อม `exportPrometheusMetrics()` สำหรับ export เป็น Prometheus text format — ไม่มี persistence และไม่มี HTTP endpoint สำเร็จรูป (ต้องต่อเอง)

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
