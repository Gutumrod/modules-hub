# 2 — HTTP CLIENT

## Classification

```text
Full Module
Priority: P0
Status: Planned
Initial Version: 0.1.0 experimental
```

---

## Objective

สร้าง HTTP client contract กลางสำหรับ reusable modules และ host integrations

รองรับ:

```text
request
timeout
request-level retry
error normalization
safe headers
response parsing
```

โดยไม่ผูกกับ Node, Deno, Cloudflare หรือ HTTP library ตัวใดตัวหนึ่ง

Architecture:

```text
Host / Module Adapter
       ↓
HTTP Client Core
       ↓
HTTP Transport
       ↓
fetch / runtime transport
```

---

## Important Boundary

HTTP Client มี retry ได้เฉพาะ:

> transient retry ของ HTTP request เดียว

ห้ามกลายเป็น Job / Retry Module ตัวที่สอง

ตัวอย่าง HTTP retry:

```text
GET external API
→ network error
→ retry 2 ครั้ง
```

Job / Retry เป็น:

```text
background operation
attempt tracking
job lifecycle
longer retry workflow
```

สองเรื่องนี้ต้องแยกกัน

---

## Public API Concept

ขั้นต่ำ:

```ts
request()
```

convenience API สามารถมี:

```ts
get()
post()
put()
patch()
delete()
```

แต่ทั้งหมดต้องวิ่งผ่าน request pipeline เดียวกัน

Concept:

```ts
type HttpRequest = {
  url: string
  method: string

  headers?: Record<string, string>

  body?: unknown

  timeoutMs?: number

  retry?: RetryPolicy

  signal?: AbortSignal

  metadata?: Record<string, unknown>
}
```

---

## Response Contract

```ts
type HttpResponse<T = unknown> = {
  status: number
  ok: boolean

  headers: Record<string, string>

  data?: T

  requestId?: string
}
```

---

## Transport Contract

Core ห้ามเรียก global `fetch` โดยตรง

สร้าง abstraction:

```ts
interface HttpTransport {
  send(request): Promise<TransportResponse>
}
```

v0.1 สามารถมี:

```text
Fetch Transport
```

โดยรับ `fetch` implementation จาก Host/runtime integration

เช่น concept:

```text
createFetchTransport({
  fetch: hostFetch
})
```

---

## Timeout

ทุก request ต้องมี timeout policy

ต้องรองรับ:

```text
per-request timeout
default client timeout
request cancellation
```

timeout ต้องคืน normalized error ไม่ใช่ปล่อย runtime-specific exception หลุดออกมา

---

## Retry Policy

รองรับขั้นต่ำ:

```text
maxAttempts
initialDelayMs
backoffMultiplier
maxDelayMs
retryableStatusCodes
```

Default retry ควร conservative

ตัวอย่าง candidate:

```text
408
429
500
502
503
504
network errors
```

แต่ต้อง configurable

---

## Idempotency Safety

ห้าม retry unsafe request แบบเงียบ ๆ

Default:

```text
GET
HEAD
OPTIONS
```

สามารถ retry ได้ตาม policy

สำหรับ:

```text
POST
PATCH
DELETE
```

ต้อง require explicit opt-in หรือ idempotency protection ตาม host/provider contract

---

## Retry-After

ถ้า response มี standard retry timing เช่น:

```text
Retry-After
```

Client ควรสามารถ respect ค่าได้โดยมี upper bound

ห้าม external server สั่ง client sleep แบบไม่จำกัด

---

## Response Parsing

รองรับอย่างน้อย:

```text
json
text
raw response / bytes ตาม transport capability
```

ต้อง handle:

```text
empty body
invalid JSON
unexpected content type
```

---

## Error Normalization

ขั้นต่ำ:

```text
HTTP_TIMEOUT
HTTP_NETWORK_ERROR
HTTP_INVALID_RESPONSE
HTTP_CLIENT_ERROR
HTTP_SERVER_ERROR
HTTP_RATE_LIMITED
HTTP_ABORTED
HTTP_RETRY_EXHAUSTED
```

ควรเก็บ:

```text
status
retryable
requestId
provider request id ถ้ามี
```

โดยไม่เก็บ sensitive headers

---

## Security

ต้อง redact อย่างน้อย:

```text
Authorization
Cookie
Set-Cookie
X-API-Key
Proxy-Authorization
```

Host สามารถเพิ่ม custom sensitive headers

ห้าม log:

```text
auth token
raw cookie
secret URL query parameters
sensitive request body
```

โดย default

---

## URL Policy

Client ควรรองรับ optional Host URL policy:

```text
allowed protocols
allowed hosts
blocked hosts
```

แต่ Core ไม่ควร hard-code allowlist ของธุรกิจ

---

## Logging Hook

Module ไม่ต้องสร้าง logging system

แต่สามารถ expose optional hook:

```ts
onRequest()
onResponse()
onError()
```

ข้อมูลที่ส่งเข้า hook ต้อง sanitized ก่อน

---

## Out of Scope

```text
browser caching
HTTP cache
CDN
API authentication framework
OAuth implementation
circuit breaker v0.1
service discovery
GraphQL client
WebSocket
SSE abstraction
background jobs
rate-limit store
```

---

## Tests

ขั้นต่ำ:

```text
GET success
POST success
JSON response
text response
empty response
invalid JSON
timeout
manual abort
network failure
500 retry then success
retry exhausted
429 handling
Retry-After
non-idempotent request not retried by default
custom retry opt-in
secret header redaction
transport error normalization
```

---

## Definition of Done

```text
[ ] Runtime-independent core
[ ] Transport interface
[ ] Fetch transport
[ ] Host-injected fetch
[ ] Timeout
[ ] Abort
[ ] Conservative retry
[ ] Idempotency-safe retry
[ ] Error normalization
[ ] Secret header redaction
[ ] Unit tests
[ ] Adapter tests
[ ] Integration example
[ ] MODULE.md
[ ] VERSION
[ ] typecheck ผ่าน
[ ] tests ผ่าน
```

---
