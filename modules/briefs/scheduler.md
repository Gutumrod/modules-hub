# 6 — SCHEDULER

## Classification

```text
Full Module
Priority: P2
Status: Planned
Initial Version: 0.1.0 experimental
```

---

## Objective

สร้าง contract กลางสำหรับ scheduled execution / cron trigger โดยไม่ผูก business logic กับ scheduler provider/runtime

Architecture:

```text
Scheduler Provider
       ↓
Scheduler Adapter
       ↓
Scheduled Trigger
       ↓
Host
       ↓
Handler / Job
```

---

## Important Boundary

Scheduler มีหน้าที่:

> งานควรถูก trigger เมื่อไหร่

Job / Retry มีหน้าที่:

> งานถูก execute/retry อย่างไร

ตัวอย่าง:

```text
Scheduler:
ทุกวัน 09:00 trigger job X

Job / Retry:
job X retry สูงสุด 3 ครั้ง
```

Scheduler ห้ามสร้าง retry engine ซ้ำ

---

## Schedule Contract

รองรับ v0.1:

```text
cron
one-time
```

Concept:

```ts
type Schedule =
  | {
      type: "cron"
      expression: string
      timezone?: string
    }
  | {
      type: "at"
      at: string
    }
```

---

## Scheduled Task

```ts
type ScheduledTask = {
  id: string

  schedule: Schedule

  enabled?: boolean

  payload?: Record<string, unknown>

  metadata?: Record<string, unknown>
}
```

Core ห้ามรู้จัก business task type

---

## Handler Contract

```ts
interface ScheduledTaskHandler {
  handle(trigger): Promise<void>
}
```

Trigger ควรมี:

```text
taskId
scheduledAt
triggeredAt
payload
metadata
```

---

## Scheduler Adapter

```ts
interface SchedulerAdapter {
  register(task)
  update(task)
  remove(task)
}
```

ถ้า provider ไม่รองรับ dynamic registration contract ต้อง document capability

อย่าฝืน provider ให้มี capability ที่มันไม่มี

---

## Provider Capabilities

ควรมี capability information เช่น:

```ts
type SchedulerCapabilities = {
  dynamicSchedules: boolean
  timezoneSupport: boolean
  oneTimeSchedules: boolean
}
```

เพื่อให้ Host fail fast แทนการ assume

---

## v0.1 Adapter

ถ้ายังไม่มี production pilot:

```text
InMemory / Manual Scheduler Adapter
```

สำหรับ:

```text
tests
contract proof
manual trigger
```

และทำ integration example สำหรับ runtime ที่ใช้งานจริง

ห้ามเรียก Memory Adapter ว่า production-ready

---

## Cron Parsing

ห้ามเขียน cron parser ใหม่เองถ้าไม่จำเป็น

ใช้ battle-tested parser/library หรือ delegate validation ไป adapter

Contract ต้องประกาศ cron dialect ที่รองรับ

ห้าม assume ว่า cron ทุก provider syntax เหมือนกัน

---

## Timezone

ต้อง explicit

ห้าม silently ใช้ local machine timezone

ถ้า provider รองรับ UTC เท่านั้น:

```text
reject unsupported timezone
```

หรือ normalize ที่ Host อย่างชัดเจน

ห้าม silently shift เวลา

---

## Missed Trigger

v0.1:

```text
ไม่มี automatic catch-up
```

ถ้า process/provider offline แล้ว missed schedule:

> behavior เป็น provider responsibility และต้อง documented

ยังไม่ทำ complex misfire policy

---

## Idempotency

Scheduler trigger ควรมี deterministic trigger identity ที่ Host สามารถใช้สร้าง job idempotency key ได้ เช่น:

```text
taskId + scheduledAt
```

แต่ Scheduler ไม่ทำ database dedup เองใน v0.1

---

## Error Contract

```text
SCHEDULE_INVALID
SCHEDULE_UNSUPPORTED
TIMEZONE_UNSUPPORTED
TASK_NOT_FOUND
SCHEDULER_PROVIDER_ERROR
```

---

## Security

Scheduled payload:

```text
ห้ามเก็บ secret โดย default
```

ให้ schedule reference identifier แล้ว Host ไป resolve secret/config ตอน runtime

ห้าม log full sensitive payload

---

## Out of Scope

```text
job retry
queue
dead letter
workflow orchestration
distributed lock
calendar UI
human reminder application
timezone database implementation
complex misfire handling
business task registry
```

---

## Tests

```text
valid cron
invalid cron
one-time schedule
register
update
remove
disabled task
manual trigger
trigger metadata
timezone support
unsupported timezone
provider failure
deterministic trigger identity
```

---

## Definition of Done

```text
[ ] Schedule contract
[ ] cron + one-time concept
[ ] SchedulerAdapter
[ ] capability contract
[ ] explicit timezone behavior
[ ] manual/test adapter
[ ] deterministic trigger identity
[ ] no retry duplication
[ ] tests
[ ] integration example
[ ] MODULE.md
[ ] VERSION
```

---
