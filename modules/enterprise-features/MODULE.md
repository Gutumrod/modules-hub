# Enterprise Features Module

**Version:** 0.3.0
**Status:** ✅ Completed

## Scope

โมดูลนี้รวม contract และ implementation แบบ framework-agnostic สำหรับ resiliency และ tracing ภายใน process:

- `CircuitBreaker` พร้อม typed errors, consecutive-failure semantics และ single HALF_OPEN probe
- `Tracer` / `Span` contracts
- `NoopTracer` สำหรับ host ที่ไม่ต้องเก็บ trace
- `MemoryTracer` สำหรับ tests และ local diagnostics

โมดูลนี้ยังไม่มี OpenTelemetry adapter และไม่ได้อ้างว่าเป็น distributed tracing implementation สำเร็จรูป Host สามารถสร้าง adapter ที่ implement `Tracer` แล้วเชื่อม SDK ของตนเองได้

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
