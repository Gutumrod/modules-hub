# MODULE 10 — Job / Retry

## Objective

ทำ execution contract สำหรับงานที่อาจต้อง retry โดยไม่ผูกกับ queue provider

---

## Architecture

```text
Host
 ↓
Job Runner
 ↓
Job Handler
```

อนาคต:

```text
Queue Adapter
 ↓
Job Runner
```

---

## Job Contract

```ts
type Job = {
  id: string
  type: string

  payload: Record<string, unknown>

  attempt?: number

  createdAt?: string
}
```

---

## Handler

```ts
interface JobHandler {
  execute(job): Promise<JobResult>
}
```

---

## Result

```ts
type JobResult = {
  success: boolean

  retryable?: boolean

  result?: unknown

  error?: ErrorShape
}
```

---

## Retry Policy

รองรับ:

```text
maxAttempts
initialDelay
backoffMultiplier
maxDelay
timeout
```

---

## v0.1

ต้องทำได้แค่:

```text
execute
retry
timeout
attempt tracking
```

ใน process

---

## Future

ค่อยเพิ่ม:

```text
Cloudflare Queue Adapter
database jobs
Dead Letter
scheduler
```

---

## Important

ห้าม duplicate retry logic กับ Notification แบบมั่วๆ

Notification ยังสามารถมี retry ของตัวเองได้

Job/Retry เป็น generic infrastructure สำหรับ operation ที่ใหญ่กว่า

---

## Tests

```text
success first attempt
retry then success
max attempts
non-retryable
timeout
backoff
handler exception
```

---

## Definition of Done

```text
[ ] Job contract
[ ] Handler interface
[ ] Retry policy
[ ] Timeout
[ ] Structured result
[ ] tests
[ ] MODULE.md
```

---
