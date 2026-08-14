# Enterprise Features Module

**Version:** 0.3.0  
**Status:** ✅ Completed

## Overview

โมดูลที่รวบรวมฟีเจอร์ระดับ Enterprise เพื่อเพิ่มความทนทาน (Resiliency) และความสามารถในการตรวจสอบ (Observability) ให้กับระบบ โดยยังคงรักษาปรัชญา Framework-agnostic และ Dependency Injection

## Features

1. **Circuit Breaker:** ป้องกันการเรียกใช้งาน Service ที่ล่มซ้ำๆ (Fail-fast) และรองรับการกู้คืนอัตโนมัติ (Auto-recovery)
2. **Distributed Tracing:** สัญญา (Contract) มาตรฐานสำหรับ OpenTelemetry เพื่อใช้ในการ Trace การทำงานแบบ End-to-End
3. **Resiliency Patterns:** โครงสร้างสำหรับสร้าง Fallback mechanisms

## Usage

### Circuit Breaker

```ts
import { CircuitBreaker } from './modules/enterprise-features';

const breaker = new CircuitBreaker({
  failureThreshold: 3,
  resetTimeoutMs: 5000
});

try {
  const result = await breaker.execute(async () => {
    return await externalService.call();
  });
} catch (error) {
  // Handle failure or "Circuit breaker is OPEN" error
}
```

### Tracing

```ts
import { TracingTracer } from './modules/enterprise-features';

const tracer = new TracingTracer({ serviceName: 'my-service' });
const span = tracer.startSpan('operation-name');
try {
  // do work
} finally {
  span.end();
}
```

## Integration with AI Provider

โมดูลนี้ถูกนำไปใช้ใน `ai-provider` เพื่อสร้าง `FallbackAIProvider` ที่มี Circuit Breaker ในตัว

## Testing

รันเทสต์ด้วย Vitest:
```bash
npm test
```
