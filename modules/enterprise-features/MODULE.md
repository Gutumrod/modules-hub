# Enterprise Features Module

**Version:** 0.3.0
**Status:** ✅ Completed
**Verified:** 2026-09-27 — `npm ci && npm test` → 23 tests passing across 3 test files (`circuit-breaker.test.ts` 12 tests, `tracer.test.ts` 4 tests, `docs-contract.test.ts` 7 tests — the first 16 tests are the pre-existing suite and the last 7 are the documentation contract); `npm run typecheck` → clean, 0 errors; `npm run example` → prints `EXAMPLE_RESULT: OK` and exits 0. Module has zero runtime `dependencies` (devDependencies only: `typescript`, `vite-node`, `vitest`) and imports no `node:*` builtin.

## Scope

โมดูลนี้รวม contract และ implementation แบบ framework-agnostic สำหรับ resiliency และ tracing ภายใน process:

- `CircuitBreaker` พร้อม typed errors, consecutive-failure semantics และ single HALF_OPEN probe
- `Tracer` / `Span` contracts
- `NoopTracer` สำหรับ host ที่ไม่ต้องเก็บ trace
- `MemoryTracer` สำหรับ tests และ local diagnostics

โมดูลนี้ยังไม่มี OpenTelemetry adapter และไม่ได้อ้างว่าเป็น distributed tracing implementation สำเร็จรูป Host สามารถสร้าง adapter ที่ implement `Tracer` แล้วเชื่อม SDK ของตนเองได้

โมดูลนี้**ไม่มี** Redis lock adapter, AI provider, หรือ tenant context manager — ฟีเจอร์เหล่านั้นอยู่ใน module อื่น (`job-retry`, `scheduler`, `ai-provider`, `tenant-context`) ไม่ใช่ `enterprise-features` ดู `modules/REGISTRY.md` สำหรับ mapping ที่ถูกต้องของแต่ละ module

## Layout Note

Entry point (`index.ts`) และ source ทั้งหมดอยู่ที่ `core/` (`core/types.ts`, `core/circuit-breaker.ts`, `core/tracer.ts`) มี directory `src/` อยู่ในโมดูลแต่**ว่างเปล่า** — เป็นเศษ scaffold ที่ไม่ได้ใช้งาน อย่าสับสนว่าเป็น entry point จริง

## Circuit Breaker

```ts
import { CircuitBreaker } from './modules/enterprise-features/index.js';

const breaker = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 5_000 });
const result = await breaker.execute(() => externalService.call());
```

เมื่อ circuit เปิด `execute()` จะ throw `CircuitBreakerError` code `CIRCUIT_OPEN`; ระหว่าง recovery อนุญาต probe เดียวและ reject concurrent probes ด้วย `HALF_OPEN_PROBE_IN_PROGRESS`

## Tracing Contract

```ts
import { MemoryTracer } from './modules/enterprise-features/index.js';

const tracer = new MemoryTracer();
const span = tracer.startSpan('sync-catalog');
span.setAttribute('tenantId', 'tenant-acme');
span.end();
```

ดูตัวอย่างเต็มที่ `examples/integration.example.ts`
