# 3 — EVENT BUS

> **Document role:** Historical implementation brief/input. Current version, maturity, public API, and limitations are governed by `../REGISTRY.md`, `../ROADMAP.md`, and the module’s `MODULE.md`/`DESIGN.md`. Do not treat old Planned/Stage labels in this brief as current status.


## Classification

```text
Full Module
Priority: P1
Status: Planned
Initial Version: 0.1.0 experimental
```

---

## Objective

สร้าง publish/subscribe contract ภายใน Host Project เพื่อ decouple components และ Modules

Architecture:

```text
Producer
   ↓
Event Bus
   ↓
Subscribers
```

เช่น:

```text
Business Action
      ↓
domain event
      ↓
Host Event Bus
   ├── Audit
   ├── Notification
   └── Other side effects
```

---

## Important Boundary

v0.1 Event Bus คือ:

```text
in-process event bus
```

ไม่ใช่:

```text
distributed queue
message broker
Kafka
Cloudflare Queue
RabbitMQ
durable event store
```

---

## Event Contract

Concept:

```ts
type Event<T = unknown> = {
  id: string
  type: string

  payload: T

  timestamp: string

  source?: string
  subject?: string

  correlationId?: string

  metadata?: Record<string, unknown>
}
```

Core ห้ามรู้ว่า event เกี่ยวกับ business อะไร

---

## Public API

ขั้นต่ำ:

```ts
publish(event)
subscribe(eventType, handler)
unsubscribe(...)
```

Concept:

```ts
interface EventHandler<T = unknown> {
  handle(event: Event<T>): Promise<void> | void
}
```

---

## Event Type

ใช้ string ที่มี namespace ได้ เช่น:

```text
resource.created
resource.updated
payment.succeeded
subscription.expired
```

Core ห้าม enforce business event names

---

## Delivery Semantics

v0.1 ต้องประกาศชัด:

```text
in-process
at-most once per publish invocation
not durable
no restart recovery
```

ห้าม claim exactly-once

---

## Subscriber Execution

v0.1 ใช้ deterministic behavior

แนะนำ:

```text
subscription order
→ sequential execution
```

เพื่อให้ tests และ debugging predictable

ถ้าจะเพิ่ม parallel handlers ในอนาคต ให้เป็น explicit mode

---

## Handler Failure

Default สำหรับ Event Bus side-effects:

```text
execute remaining handlers
collect failures
return PublishResult
```

เพราะ subscriber หนึ่งพังไม่ควรทำให้ subscriber อื่นหาย

Concept:

```ts
type PublishResult = {
  delivered: number
  failed: number

  failures?: Array<{
    subscriberId?: string
    error: EventBusError
  }>
}
```

ถ้า workflow ต้องการ transaction-critical sequence:

> Host ต้อง orchestrate โดยตรง ไม่ควรใช้ Event Bus ซ่อน critical transaction

---

## Duplicate Subscription

ต้องจัดการ:

```text
same handler registration
unsubscribe
handler identity
```

อย่าง deterministic

---

## Wildcard

v0.1:

```text
Exact event type only
```

ยังไม่ต้องทำ:

```text
*
payment.*
pattern routing
```

จนกว่าจะมี use case

---

## Errors

ขั้นต่ำ:

```text
EVENT_INVALID
EVENT_TYPE_INVALID
SUBSCRIBER_INVALID
HANDLER_FAILED
PUBLISH_FAILED
```

Handler exceptions ต้องถูก normalize

---

## Security

Event metadata อาจมี sensitive information

ห้าม Event Bus automatically log:

```text
payload
tokens
password
secret
PII
```

เต็มก้อน

Event Bus ไม่ใช่ Audit Log

---

## Out of Scope

```text
distributed messaging
persistent events
queue retries
dead letter queue
cron
event sourcing
cross-service transport
Kafka abstraction
webhook delivery
transaction manager
```

---

## Tests

```text
subscribe
publish one event
multiple subscribers
unsubscribe
event with no subscriber
async subscriber
handler failure
remaining handlers still execute
failure collection
duplicate handler registration
event validation
correlation id preservation
```

---

## Definition of Done

```text
[ ] Generic Event contract
[ ] publish
[ ] subscribe
[ ] unsubscribe
[ ] async handler support
[ ] deterministic execution
[ ] explicit delivery semantics
[ ] handler failure isolation
[ ] structured PublishResult
[ ] no durable-queue claims
[ ] tests
[ ] example
[ ] MODULE.md
[ ] VERSION
```

---
