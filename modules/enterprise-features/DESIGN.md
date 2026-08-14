# Enterprise Features — Design

**Version:** 0.3.0

## Boundary

Core ไม่มี framework, network client หรือ telemetry SDK dependency Host inject งาน async เข้า `CircuitBreaker.execute()` และเลือก tracer implementation เอง

## Circuit Breaker State Model

- `CLOSED`: นับเฉพาะ consecutive failures; success reset counter
- `OPEN`: fail fast จนถึง `resetTimeoutMs`
- `HALF_OPEN`: อนุญาต probe เดียว; success ปิด circuit และ failure เปิดใหม่

Config ต้องใช้ positive safe integer สำหรับ `failureThreshold` และ positive finite number สำหรับ `resetTimeoutMs`

## Tracing

`Tracer` และ `Span` เป็น contract ขั้นต่ำ Built-in adapters คือ:

- `NoopTracer`: ไม่เก็บข้อมูล
- `MemoryTracer`: เก็บ completed spans ใน memory เหมาะกับ tests/local diagnostics

OpenTelemetry เป็น extension point ของ host และยังไม่มี adapter ใน module นี้ จึงไม่มีการรับรอง distributed context propagation หรือ exporter lifecycle
