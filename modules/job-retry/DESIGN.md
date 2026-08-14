# Job / Retry Module — DESIGN.md (Enterprise v0.3.0)

**Version:** 0.3.0 (P2, Redis Persistence & Distributed Lock)
**Status:** Design & Research Complete (Phase 1).
**Language / runtime:** TypeScript, ES2022, strict mode.

---

## 1. Purpose & Architectural Objectives

The **Job / Retry Module** provides durable job execution, exponential backoff retry policies, and Dead Letter Queue (DLQ) support.

> **CRITICAL BOUNDARY:**
> - v0.2.0 introduces **Job Storage Adapter Interface** for durable persistence (Redis, PostgreSQL, or KV).
> - Adds Dead Letter Queue handling for permanently failed jobs.

---

## 2. Core Domain Models & Interfaces (v0.2.0)

### 2.1 Job Storage Interface
```ts
export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'dlq';

export interface PersistentJob<T = unknown> {
  id: string;
  name: string;
  payload: T;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export interface JobStorageAdapter {
  saveJob(job: PersistentJob): Promise<void>;
  getJob(id: string): Promise<PersistentJob | null>;
  updateJobStatus(id: string, status: JobStatus, error?: string): Promise<void>;
  moveToDlq(id: string, reason: string): Promise<void>;
}
```
