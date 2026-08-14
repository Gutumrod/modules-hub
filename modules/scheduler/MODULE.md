# Scheduler Module

**Version:** 0.3.0 (P2)
**Status:** ✅ Completed

## Overview

โมดูล **Scheduler** เป็นมาตรฐานกลางสำหรับจัดการการตั้งเวลาทำงาน (Scheduling) โดยทำหน้าที่เป็น Registry สำหรับเก็บข้อมูลตารางเวลาและ Trigger เหตุการณ์เมื่อถึงเวลาที่กำหนด โดยออกแบบมาให้แยกส่วนจากระบบการรันงาน (Execution Engine)

## Features

- **Schedule Registry**: ระบบลงทะเบียนงานที่ต้องการรันตามเวลา รองรับทั้งแบบ `interval` และ `cron`
- **Event-based Trigger**: แจ้งเตือนผ่าน Event เมื่อถึงกำหนดเวลา เพื่อให้ Host Application นำไปประมวลผลต่อ (เช่น ส่งให้ Job Runner)
- **Memory Engine**: ระบบ Scheduler ในหน่วยความจำสำหรับใช้งานในกระบวนการเดียวกัน
- **Edge Compatible**: ออกแบบมาให้รองรับการทำงานร่วมกับ Cloudflare Workers Cron Triggers โดยใช้โมดูลเป็นศูนย์กลางการจัดการ Task Mapping
- **Start/Stop Control**: สามารถเปิด-ปิดการทำงานของ Scheduler ทั้งหมดหรือราย Task ได้
- **Ownership-safe Locks**: Memory/Redis adapters คืน ownership token และ Redis release ใช้ atomic compare-and-delete

## Installation

```bash
# โมดูลนี้เป็น Pure TypeScript ไม่มีการพึ่งพา external dependencies
npm install @module-hub/scheduler
```

## Quick Start

```ts
import { MemorySchedulerEngine } from '@module-hub/scheduler';

// 1. สร้าง Engine
const scheduler = new MemorySchedulerEngine();

// 2. รับการแจ้งเตือนเมื่อถึงเวลา
scheduler.onTrigger((event) => {
  console.log(`Time to run: ${event.taskType}`);
});

// 3. ลงทะเบียนงาน
scheduler.register({
  id: 'sync-data',
  type: 'interval',
  value: 60000, // ทุก 1 นาที
  taskType: 'DATA_SYNC',
  enabled: true
});

// 4. เริ่มการทำงาน
scheduler.start();
```

## Core API

### `SchedulerEngine.register(schedule)`
ลงทะเบียนตารางเวลาใหม่เข้าสู่ระบบ

### `SchedulerEngine.unregister(scheduleId)`
ยกเลิกตารางเวลาที่ลงทะเบียนไว้

### `SchedulerEngine.start()` / `stop()`
เริ่มต้นหรือหยุดการทำงานของ Scheduler ทั้งหมด

### `SchedulerEngine.onTrigger(callback)`
ลงทะเบียน Callback เพื่อรับเหตุการณ์เมื่อมีงานถึงกำหนดเวลา

### `SchedulerEngine.triggerById(scheduleId)`
สั่ง Trigger งานด้วยตนเองโดยใช้ ID (มีประโยชน์สำหรับการเชื่อมต่อกับ External Cron Triggers)

## Schedule Types

| Type | Value Description |
|---|---|
| `interval` | ตัวเลขหน่วยมิลลิวินาที (ms) สำหรับการรันซ้ำตามรอบ |
| `cron` | สตริงรูปแบบ Cron Expression (v0.1 เน้นการใช้ร่วมกับ External Trigger) |

## Integration with Job / Retry

โมดูลนี้ถูกออกแบบมาให้ทำงานคู่กับโมดูล `job-retry` โดยเมื่อเกิด `onTrigger` ให้ Host Application สร้าง `Job` และส่งให้ `JobRunner` ประมวลผล เพื่อให้ได้ความน่าเชื่อถือในการทำงานสูงสุด
