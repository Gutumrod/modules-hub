# 8 — HEALTH CHECK

> **Document role:** Historical implementation brief/input. Current version, maturity, public API, and limitations are governed by `../REGISTRY.md`, `../ROADMAP.md`, and the module’s `MODULE.md`/`DESIGN.md`. Do not treat old Planned/Stage labels in this brief as current status.


## Classification

```text
Full Module
Priority: P2
Status: Planned
Initial Version: 0.1.0 experimental
```

---

## Objective

สร้างมาตรฐานกลางสำหรับตรวจ health ของ application/service/modules และ dependencies

โดย Core ไม่ผูกกับ:

```text
Next.js
Express
Cloudflare
Supabase
HTTP server framework
```

Architecture:

```text
Health Check Core
    ↓
Registered Checks
    ↓
Normalized Health Report
    ↓
Host HTTP Route / Monitoring
```

---

## Important Boundary

Health Check Module สร้าง:

```text
health report
```

Host Project เป็นคน expose:

```text
/health
/ready
```

Module ไม่ต้องสร้าง standalone server

---

## Health Types

รองรับอย่างน้อย:

```text
liveness
readiness
```

### Liveness

ตอบคำถาม:

> process/service ยังทำงานอยู่หรือไม่

ต้อง:

```text
cheap
fast
ไม่พึ่ง external dependency โดยไม่จำเป็น
```

### Readiness

ตอบคำถาม:

> service พร้อมรับงานจริงหรือไม่

สามารถตรวจ:

```text
database
critical provider
storage
required service
```

---

## Health Status

Normalize:

```text
healthy
degraded
unhealthy
```

---

## Check Contract

Concept:

```ts
interface HealthCheck {
  name: string
  type: "liveness" | "readiness"

  check(): Promise<HealthCheckResult>
}
```

---

## Result Contract

```ts
type HealthCheckResult = {
  name: string
  status: "healthy" | "degraded" | "unhealthy"

  latencyMs?: number

  message?: string

  metadata?: Record<string, unknown>
}
```

---

## Aggregate Report

```ts
type HealthReport = {
  status: "healthy" | "degraded" | "unhealthy"

  timestamp: string

  checks: HealthCheckResult[]

  version?: string
}
```

---

## Public API

ขั้นต่ำ:

```ts
registerCheck()
runLiveness()
runReadiness()
runAll()
```

---

## Aggregate Rule

ต้อง deterministic

ตัวอย่าง:

```text
ถ้ามี critical check unhealthy
→ unhealthy

ไม่มี unhealthy แต่มี degraded
→ degraded

ทั้งหมด healthy
→ healthy
```

ต้องรองรับ flag:

```text
critical
optional
```

ใน check registration

---

## Check Timeout

ทุก dependency health check ต้องมี timeout

ห้ามให้:

```text
database dead
```

ทำ endpoint health ค้างไม่จบ

แต่ Module ไม่ retry checks

Retry เป็นเรื่องอื่น

---

## Concurrency

Readiness checks สามารถ run parallel เพื่อไม่ให้ latency รวมเป็นผลบวกของทุก dependency

แต่ต้อง:

```text
bounded
timeout
collect all results safely
```

v0.1 ไม่ต้องสร้าง complex concurrency pool ถ้ามี checks น้อย

---

## Public vs Internal Response

ต้องรองรับ sanitized public report

ตัวอย่าง public:

```json
{
  "status": "unhealthy"
}
```

internal diagnostics สามารถมี:

```text
check names
latency
safe error codes
```

ห้าม expose:

```text
database URL
hostname ภายในที่ sensitive
tokens
stack traces
SQL errors
provider credentials
raw exception
```

---

## Version Information

สามารถรับ:

```text
application version
module version
commit id
```

จาก Host

แต่ Host เป็นคน inject

Health Module ห้ามอ่าน Git/runtime metadata เอง

---

## HTTP Mapping

Host สามารถ map เช่น:

```text
healthy → 200
degraded → 200 หรือ 503 ตาม Host policy
unhealthy → 503
```

Core ไม่ควร hard-code framework response object

---

## Check Adapter / Factory

สามารถมี helper สำหรับ common dependency check ในอนาคต เช่น:

```text
HTTP dependency
database ping
storage probe
```

แต่ห้าม implement provider-specific checks จำนวนมากโดยไม่มี pilot

v0.1 สามารถใช้ callback-based check:

```ts
createHealthCheck({
  name,
  check: hostFunction
})
```

---

## Error Contract

```text
HEALTH_CHECK_FAILED
HEALTH_CHECK_TIMEOUT
HEALTH_CHECK_INVALID
```

Raw provider exception ต้อง sanitize

---

## Security

ต้องป้องกัน health endpoint จากการเป็น information leak

โดยเฉพาะ:

```text
secret
stack trace
database schema
internal network
provider token
user data
```

MODULE.md ต้องแนะนำ:

```text
public liveness = minimal
internal readiness = richer diagnostics
```

---

## Out of Scope

```text
APM
metrics platform
logging platform
alerting
incident management
uptime monitoring SaaS
distributed tracing
automatic restart
load balancing
Kubernetes controller
retry engine
```

---

## Tests

```text
healthy liveness
healthy readiness
degraded check
unhealthy critical check
unhealthy optional check
aggregate healthy
aggregate degraded
aggregate unhealthy
check timeout
check exception
multiple checks
parallel checks
public sanitizer
secret leakage
version injection
```

---

## Definition of Done

```text
[ ] HealthCheck contract
[ ] liveness
[ ] readiness
[ ] healthy/degraded/unhealthy
[ ] critical/optional checks
[ ] timeout
[ ] aggregate report
[ ] sanitized public report
[ ] Host-owned HTTP integration
[ ] no framework dependency
[ ] security tests
[ ] examples
[ ] MODULE.md
[ ] VERSION
```

---

# Cross-Module Boundary Map

Agent ต้องรักษาขอบเขตนี้เพื่อไม่สร้าง functionality ซ้ำ

```text
Config / Runtime
    └── normalize config/runtime context

HTTP Client
    └── outbound HTTP request transport

Event Bus
    └── in-process publish/subscribe

Tenant Context
    └── canonical tenant scope

Feature Flags
    └── runtime feature enable/disable

Scheduler
    └── WHEN an operation triggers

Import / Export
    └── data parse/serialize

Health Check
    └── operational health reporting
```

Modules เดิม:

```text
Supabase Auth Helpers
    └── WHO user is / authorization / tenant membership

Subscription + Entitlement
    └── WHAT account is allowed to use

Rate Limit
    └── HOW OFTEN action is allowed

Job / Retry
    └── HOW retryable operation executes

File Storage
    └── WHERE file bytes live

Audit Log
    └── WHAT happened historically

Webhook Receiver
    └── inbound external HTTP events

Notification
    └── outbound notifications

AI Provider
    └── AI inference
```

---

# Dependency Guidance

หลีกเลี่ยง:

```text
Module A hard-imports Module B
```

ถ้าไม่จำเป็น

Prefer:

```text
Host wires modules together
```

ตัวอย่าง:

```text
Scheduler
    ↓
Host
    ↓
Job / Retry
```

ไม่ใช่:

```text
Scheduler imports Job / Retry core
```

---

อีกตัวอย่าง:

```text
Tenant Context
       ↓
Host
       ↓
Feature Flags
```

Feature Flags สามารถรับ:

```text
tenantId
```

จาก context

แต่ไม่ควร import Tenant Context Module เพียงเพื่ออ่าน field เดียว

---

อีกตัวอย่าง:

```text
Import / Export
      ↓
Host
      ↓
File Storage
```

Import Module ไม่ต้อง import Storage Module

---

# Recommended Dependency Direction

```text
              Config / Runtime
                    │
             Host Integration
                    │
 ┌──────────────────┼───────────────────┐
 │                  │                   │
HTTP Client    Tenant Context      Feature Flags
 │                  │                   │
 └──────────── Host Orchestration ──────┘
                    │
            ┌───────┼─────────┐
            │       │         │
        Event Bus Scheduler Health
                    │
                   Host
                    │
                Job / Retry
```

นี่เป็น conceptual relationship

ไม่ใช่ instruction ให้ทุก Module import กัน

---

# Recommended Development Sequence

ยึด Registry/Roadmap ล่าสุดเป็นหลัก

Current P0 sequence:

```text
Notification ✅
      ↓
Config / Runtime
      ↓
File Storage
      ↓
Webhook Receiver
      ↓
Audit Log
      ↓
HTTP Client
```

ดังนั้นจาก 8 ตัวในเอกสารนี้:

## First

```text
Config / Runtime
```

ต้องทำและ freeze contract ก่อน

---

## After existing P0 sequence reaches HTTP Client

```text
HTTP Client
```

---

## P1

แนะนำ:

```text
Event Bus
Tenant Context
Feature Flags
```

แต่ก่อนเริ่มต้องดู dependency map และสถานะ Modules P1 อื่นจริงอีกครั้ง

---

## P2

```text
Scheduler
Import / Export
Health Check
```

ลำดับระหว่างสามตัวนี้สามารถเปลี่ยนตาม project pilot จริง

ห้ามสร้างเพียงเพราะอยู่ใน Roadmap ถ้ายังไม่มี use case

---

# Module-by-Module Pilot Guidance

ก่อนเปลี่ยน Experimental → Pilot ต้องเอาไปใช้จริงอย่างน้อยหนึ่ง project

Candidate proof:

```text
Config / Runtime
→ ใช้กับ Module ใหม่หนึ่งตัวหรือ Host Project จริง

HTTP Client
→ ใช้กับ external API adapter จริง

Event Bus
→ ใช้ decouple side-effect จริง

Tenant Context
→ ใช้ใน multi-tenant Host จริง

Feature Flags
→ ใช้ kill switch / pilot feature จริง

Scheduler
→ ใช้ scheduled task จริง

Import / Export
→ ใช้ import/export dataset จริง

Health Check
→ expose health/readiness ใน service จริง
```

---

# Global Definition of Done for These 8 Modules

ก่อน Module เปลี่ยนจาก Experimental → Pilot:

```text
[ ] Agent inspect repository จริงก่อน implement
[ ] ไม่มี business-specific logic
[ ] Public contract ถูก review ก่อน implementation
[ ] Host inject config/secrets
[ ] Core ไม่อ่าน runtime globals โดยตรง
[ ] Core ไม่ผูก provider
[ ] Adapter/provider แยกจาก Core
[ ] Typed input/output
[ ] Structured errors
[ ] Secret redaction ตามบริบท
[ ] Security failure cases tested
[ ] Unit tests
[ ] Adapter tests ถ้ามี adapter
[ ] Integration example
[ ] MODULE.md
[ ] VERSION
[ ] Known limitations
[ ] typecheck ผ่าน
[ ] tests ผ่าน
[ ] ไม่มี breaking change ต่อ Modules ก่อนหน้า
```

---

# Agent Handoff — Required Final Report Per Module

หลัง implement Module ใดเสร็จ Coding Agent ต้องรายงาน:

```text
1. Files created
2. Files modified
3. Public API implemented
4. Adapter/provider implemented
5. Tests added
6. Test results
7. Typecheck result
8. Security checks
9. Known limitations
10. Any deviation from brief
11. Any contract decision that needs review
12. Suggested REGISTRY.md update
13. Suggested ROADMAP.md update
```

ห้าม update Module เป็น Completed เพียงเพราะ code compile ได้

สถานะควรประมาณ:

```text
Planned
→ In Progress
→ Pilot / Testing
→ Completed/Stable ตามมาตรฐานของ Hub
```

---

# Final Instruction to Coding Agent

เอกสารนี้มี 8 briefs เพื่อเตรียม backlog เท่านั้น

**งานแรกคือ:**

```text
Config / Runtime
```

ก่อน implement:

```text
inspect actual repository
inspect Notification reference module
inspect current common rules
inspect dependency map
present implementation plan
```

จากนั้น implement เฉพาะ Config / Runtime

อย่าเริ่ม HTTP Client หรือ Module ตัวอื่นจนกว่า:

```text
Config / Runtime
→ tests ผ่าน
→ review ผ่าน
→ public contract ถูก freeze
→ Registry/Roadmap ถูกอัปเดตตามสถานะจริง
```

แล้วจึงเดิน Module ถัดไปตาม Roadmap
