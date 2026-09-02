# Scheduler Module — DESIGN.md

**Version:** 0.3.0
**Status:** Implemented (verified against source + tests 2026-08-22 — see MODULE.md).
**Language / runtime:** TypeScript, ES2022, strict mode. Compatible with Cloudflare Workers (via Cron Triggers).

---

## 1. Purpose & Architectural Boundaries

The **Scheduler Module** provides a standardized contract and registry for time-based task execution. It defines how tasks are scheduled (Interval, Cron) and triggers them without being coupled to a specific execution engine.

> **CRITICAL BOUNDARY:**
> - It is a **Registry and Trigger Contract**, not a persistent job store — there is no DB/Redis-backed schedule storage.
> - It does **NOT** include a full-featured Cron parser. `cron`-type schedules are not self-triggering on a timer; they rely on an external trigger (e.g. Cloudflare Workers Cron Trigger) calling `triggerById()`.
> - It does **NOT** manage OS-level crontabs.
> - Out of scope: timezone-aware complex scheduling, persistent/distributed schedule storage.
> - Distributed **locking** (mutual exclusion across processes) IS in scope as of v0.3.0 — see the Distributed Lock Contract below. This supersedes the earlier v0.1 boundary that excluded locking.

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
Implemented by `MemorySchedulerEngine` (`core/engine.ts`), which also exposes a non-interface helper `triggerById(scheduleId)` for manually firing a schedule (used to bridge external/cron triggers).

### 3.2 Distributed Lock Adapter
```ts
export interface DistributedLockAdapter {
  acquireLock(key: string, ttlMs: number): Promise<string | null>;
  releaseLock(key: string, token: string): Promise<boolean>;
}
```
Two implementations ship in `adapters/distributed-lock.ts`:
- `MemoryDistributedLock` — in-process `Map`-backed lock, ownership tokens via `crypto.randomUUID()`.
- `RedisDistributedLock` — takes an injected client conforming to `RedisDistributedLockClient` (`set`/`eval` methods); does not bundle an ioredis dependency itself. Acquire uses `SET key token PX ttlMs NX`; release uses an atomic Lua compare-and-delete script so a caller can only release a lock it currently owns.

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
- [x] `Schedule` and `ScheduleTriggerEvent` types
- [x] `MemorySchedulerEngine` implementation for in-process scheduling
- [x] Basic Interval support (ms)
- [x] Cron-type schedules supported via manual/external trigger (`triggerById`) — no built-in cron string parser
- [x] Event emitter for trigger notifications
- [x] Unit tests covering: register/unregister, interval triggering, start/stop behavior, manual trigger by ID (`tests/unit/engine.test.ts`, 4 tests)
- [x] `MemoryDistributedLock` / `RedisDistributedLock` with ownership tokens and atomic release (`tests/unit/redis-distributed-lock.test.ts`, 12 tests)
- [x] `MODULE.md` and integration example (`examples/integration.example.ts`) — example covers `MemorySchedulerEngine` only, not the lock adapters
- [ ] Integration example with `Job / Retry` module — not present; `examples/integration.example.ts` only logs a simulated hookup, it does not import or call into `job-retry`

Verified 2026-08-22: `npm test` → 16/16 passing (2 test files); `npm run typecheck` → no errors.
