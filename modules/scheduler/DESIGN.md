# Scheduler Module — DESIGN.md

**Version:** 0.3.0

**Version:** 0.1.0 (P2, experimental)
**Status:** Design (Stage 1 — Architect).
**Language / runtime:** TypeScript, ES2022, strict mode. Compatible with Cloudflare Workers (via Cron Triggers).

---

## 1. Purpose & Architectural Boundaries

The **Scheduler Module** provides a standardized contract and registry for time-based task execution. It defines how tasks are scheduled (Interval, Cron) and triggers them without being coupled to a specific execution engine.

> **CRITICAL BOUNDARY:**
> - v0.1.0 is a **Registry and Trigger Contract**.
> - It does **NOT** include a persistent job store (DB/Redis).
> - It does **NOT** include a full-featured Cron parser (supports basic cron-like strings or standard intervals).
> - It does **NOT** manage OS-level crontabs.
> - Out of Scope: Distributed scheduling, overlap prevention (locking), timezone-aware complex scheduling.

---

## 2. Core Domain Models & Types

### 2.1 Schedule Definition
```ts
export type ScheduleType = 'interval' | 'cron';

export type Schedule = {
  readonly id: string;
  readonly type: ScheduleType;
  readonly value: string | number; // cron string or ms interval
  readonly taskType: string;
  readonly payload?: Record<string, unknown>;
  readonly enabled: boolean;
};
```

### 2.2 Schedule Event
```ts
export type ScheduleTriggerEvent = {
  readonly scheduleId: string;
  readonly taskType: string;
  readonly payload?: Record<string, unknown>;
  readonly triggeredAt: string; // ISO-8601
};
```

---

## 3. Core API (Interfaces)

### 3.1 Scheduler Engine
```ts
export interface SchedulerEngine {
  register(schedule: Schedule): void;
  unregister(scheduleId: string): void;
  start(): void;
  stop(): void;
  onTrigger(callback: (event: ScheduleTriggerEvent) => void): void;
}
```

---

## 4. Execution Principles

### 4.1 Trigger Mechanism
The Scheduler emits events when a schedule is due. The Host application listens to these events and routes them to the `Job / Retry` module or other execution handlers.

### 4.2 Cloudflare Workers Integration
For Cloudflare Workers, the Scheduler can be used to map `scheduled` events to internal task types based on the registry.

## Distributed Lock Contract (v0.3.0)

`acquireLock(key, ttlMs)` คืน ownership token หรือ `null` เมื่อ lock ถูกถืออยู่ และ `releaseLock(key, token)` คืน boolean ตามผล compare-and-delete ห้าม release โดยไม่มี token Redis adapter ใช้ `SET ... PX ... NX` และ Lua compare-and-delete แบบ atomic เพื่อป้องกัน expired owner ลบ lock ของ owner ใหม่

---

## 5. Acceptance Criteria for Implementation
- [ ] `Schedule` and `ScheduleTriggerEvent` types
- [ ] `MemorySchedulerEngine` implementation for in-process scheduling
- [ ] Basic Interval support (ms)
- [ ] Simple Cron-like string support (v0.1: simple mapping or external parser if lightweight)
- [ ] Event emitter for trigger notifications
- [ ] Unit tests covering:
    - Register/Unregister
    - Interval triggering
    - Start/Stop behavior
- [ ] `MODULE.md` and integration example with `Job / Retry`
