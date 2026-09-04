# Job / Retry Module

**Version:** 0.3.0
**Status:** ✅ Completed
**Documentation Authority:** Current version/status follow `../REGISTRY.md`; this document describes the module contract/design for that registered version.

## Overview

โมดูล **Job / Retry** เป็นมาตรฐานกลางสำหรับจัดการการรันงานเบื้องหลัง (Background Jobs) หรือกระบวนการที่ต้องการความน่าเชื่อถือสูง โดยมีระบบจัดการการลองใหม่ (Retry Logic) แบบอัตโนมัติ พร้อมกลยุทธ์ Exponential Backoff

## Features

- **Execution Contract**: กำหนดสัญญา `Job` และ `JobResult` ที่ชัดเจน แยก Logic การทำงานออกจากโครงสร้างพื้นฐาน
- **Automatic Retries**: ระบบลองใหม่อัตโนมัติเมื่อเกิดข้อผิดพลาดที่ระบุว่าเป็น `retryable`
- **Exponential Backoff**: กลยุทธ์การหน่วงเวลาการลองใหม่แบบทวีคูณ เพื่อลดภาระของระบบปลายทาง
- **Timeout Enforcement**: ระบบตัดการทำงานหาก Job ใช้เวลานานเกินกำหนด
- **Runtime Agnostic**: ทำงานได้บน Node.js, Cloudflare Workers และสภาพแวดล้อม TypeScript อื่นๆ
- **Redis Persistence & DLQ**: `RedisJobStorage` เก็บงานและ DLQ ผ่าน client ที่ host inject
- **Distributed Lock**: `RedisLockProvider` ใช้ `SET NX PX`, secure ownership token และ atomic compare-and-delete ตอน release

## Installation

```bash
# โมดูลนี้เป็น Pure TypeScript ไม่มีการพึ่งพา external dependencies
npm install @module-hub/job-retry
```

## Quick Start

```ts
import { DefaultJobRunner, Job, JobHandler } from '@module-hub/job-retry';

// 1. สร้าง Handler สำหรับงานของคุณ
class MyHandler implements JobHandler {
  async execute(job: Job) {
    // ทำงานที่นี่...
    return { success: true, result: 'done' };
  }
}

// 2. รันงานผ่าน Runner
const runner = new DefaultJobRunner();
const result = await runner.run(new MyHandler(), {
  id: 'job-1',
  type: 'task',
  payload: {},
  attempt: 1,
  createdAt: new Date().toISOString()
}, {
  maxAttempts: 5,
  initialDelayMs: 1000
});
```

## Core API

### `JobRunner.run(handler, job, policy?)`
ฟังก์ชันหลักสำหรับรัน Job พร้อมจัดการ Retry
- `handler`: ออบเจกต์ที่อิมพลีเมนต์ `JobHandler` interface
- `job`: ข้อมูลของงานที่จะรัน
- `policy`: (Optional) กำหนดค่า `maxAttempts`, `initialDelayMs`, `backoffMultiplier`, `timeoutMs`

### `calculateNextDelay(attempt, policy)`
Helper สำหรับคำนวณเวลาหน่วงสำหรับการลองใหม่ครั้งถัดไป

## Configuration (RetryPolicy)

| Property | Default | Description |
|---|---|---|
| `maxAttempts` | 3 | จำนวนครั้งสูงสุดที่จะลองทำงาน (รวมครั้งแรก) |
| `initialDelayMs` | 1000 | เวลาหน่วงเริ่มต้นก่อนลองใหม่ครั้งที่ 2 (ms) |
| `backoffMultiplier` | 2 | ตัวคูณสำหรับเพิ่มเวลาหน่วงในแต่ละรอบ |
| `maxDelayMs` | 30000 | เวลาหน่วงสูงสุดที่จะไม่เกินนี้ (ms) |
| `timeoutMs` | 60000 | เวลาทำงานสูงสุดของแต่ละ Attempt (ms) |

## Error Handling

ผลลัพธ์จาก `JobRunner.run` จะคืนค่า `JobResult` ซึ่งประกอบด้วย:
- `success`: `true` หากงานสำเร็จในรอบใดรอบหนึ่ง
- `retryable`: ระบุว่าข้อผิดพลาดที่เกิดขึ้นควรลองใหม่หรือไม่
- `error`: รายละเอียดข้อผิดพลาดล่าสุดหากงานไม่สำเร็จ

Redis adapters โยน `RedisAdapterError` พร้อม `code` ที่ตรวจสอบได้ และไม่กลืน Redis/serialization errors เงียบ ๆ
