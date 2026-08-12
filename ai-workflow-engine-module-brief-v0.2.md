# AI Workflow Engine — Module Brief

> Version: v0.2 — Conversation + Orchestration Expansion

## 1. เป้าหมาย

สร้างโมดูลกลางชื่อ **AI Workflow Engine** สำหรับให้ AI สามารถ

- รับเหตุการณ์จากระบบ
- อ่านและทำความเข้าใจ Context
- วิเคราะห์สถานการณ์
- ทำความเข้าใจบทสนทนาและสกัด Intent ของผู้ใช้
- ตรวจจับข้อมูลที่ยังขาดและถามกลับอย่างมีเป้าหมาย
- ตัดสินใจ
- สร้างแผนการทำงาน
- แปลงการตัดสินใจเป็นคำสั่งที่ระบบปลายทางเข้าใจ
- ขออนุมัติจากมนุษย์ใน Action ที่มีความเสี่ยง
- บันทึกประวัติการทำงานทั้งหมด
- รองรับทั้ง Event-driven Workflow และ Conversation-driven Workflow

โดยโมดูลนี้ต้องเป็น **Project-Agnostic**

หมายความว่า AI Workflow Engine ต้องไม่ผูกกับโครงสร้าง Database, API, Business Logic หรือชื่อ Entity ของโปรเจกต์ใดโปรเจกต์หนึ่งโดยตรง

เป้าหมายคือสามารถนำโมดูลเดียวกันไปเสียบกับหลายระบบได้ เช่น

- Booking System
- E-commerce
- CRM
- Inventory
- Content System
- Customer Support
- Internal Automation
- SaaS อื่น ๆ

โดยไม่ต้องแก้ Core Engine ใหม่ทุกครั้ง

---

# 2. ปัญหาหลักที่ต้องแก้

AI ไม่สามารถรู้โครงสร้างของระบบปลายทางได้เองอย่างปลอดภัย

ตัวอย่างเช่น AI อาจต้องการ

> ดูจำนวน Booking ของร้านในเดือนนี้

แต่แต่ละระบบอาจเก็บข้อมูลไม่เหมือนกัน เช่น

Project A:

`bookings.shop_id`

Project B:

`appointments.tenant_id`

Project C:

เรียกผ่าน API:

`GET /shops/{id}/appointments`

ถ้าปล่อยให้ AI เดาเอง จะเกิดปัญหาเรื่อง

- Schema mismatch
- Hallucinated API
- เรียก Action ผิด
- ใช้ Field ผิด
- ข้าม Business Rule
- ทำงานกับ Tenant ผิด
- Security Risk

ดังนั้น **AI ห้ามเดาโครงสร้างระบบปลายทางเอง**

---

# 3. แนวคิดหลัก — Project Manifest

ทุก Project ที่ต้องการใช้งาน AI Workflow Engine จะต้องส่ง **Project Manifest** ให้ Engine

Manifest เปรียบเสมือน Contract ระหว่าง

`Project ↔ AI Workflow Engine`

Manifest ต้องอธิบายอย่างน้อยว่า

- Project นี้คือระบบอะไร
- มี Entity อะไรบ้าง
- Context อะไรที่ AI สามารถอ่านได้
- สามารถทำ Action อะไรได้
- Action ไหนมีความเสี่ยง
- Action ไหนต้อง Human Approval
- Input / Output ของแต่ละ Action
- Permission ที่เกี่ยวข้อง
- Tenant / User Scope
- Business Rules ที่ AI ต้องรู้
- Adapter หรือ Handler ที่ต้องเรียก

AI Workflow Engine จึงไม่จำเป็นต้องรู้ว่า Database จริงอยู่ตรงไหน

มันต้องรู้แค่ว่า

> "ถ้าต้องการข้อมูล X ให้เรียก Context Provider Y"

และ

> "ถ้าต้องการทำ Action Z ให้ส่ง Command ไปยัง Action Adapter A"

---

# 4. Architecture หลัก

Flow หลักควรเป็น

```
Source System / User Conversation
      │
      ▼
Trigger & Event Receiver
      │
      ▼
Workflow Runtime
      │
      ├── Project Manifest
      │
      ▼
Conversation & Intent Layer
      │
      ├── Intent Extraction
      ├── Missing Information Detection
      └── Clarification Flow
      │
      ▼
Context Resolver
      │
      ▼
AI Decision Engine
      │
      ▼
Action Planner
      │
      ▼
Policy / Risk Evaluation
      │
      ├───────────────┐
      │               │
      ▼               ▼
Auto Execute     Human Approval
      │               │
      └───────┬───────┘
              ▼
       Action Adapter
              │
              ▼
       Target System
              │
              ▼
          Audit Log

```

---

# 5. Core Components

## 5.1 Project Manifest Registry

หน้าที่เก็บและโหลด Manifest ของแต่ละ Project

Engine ต้องสามารถระบุได้ว่า Event ที่เข้ามาเป็นของ

- Project ไหน
- Tenant ไหน
- Manifest Version ไหน

Manifest ต้องสามารถ Version ได้ เพื่อรองรับการเปลี่ยน Schema หรือ Capability ของ Project ในอนาคต

ตัวอย่าง Concept:

```
project_id
manifest_version
entities
context_providers
actions
permissions
risk_policies
business_rules

```

---

## 5.2 Event Receiver

ทำหน้าที่รับ Event จากระบบปลายทาง

ตัวอย่าง Event:

```
booking.created
booking.cancelled
payment.received
inventory.low
customer.message_received
order.created
content.ready
schedule.triggered

```

Event Receiver ไม่ควรมี Business Logic ของ Project

หน้าที่หลักคือ

1. Validate Event
2. Identify Project
3. Identify Tenant
4. Normalize Event
5. ส่งเข้า Workflow Runtime

---

## 5.3 Context Resolver

หน้าที่คือดึงข้อมูลที่ AI ต้องใช้ก่อนตัดสินใจ

AI ไม่ควร Query Database หรือ API โดยตรงแบบอิสระ

แต่ต้องร้องขอ Context ผ่าน Context Resolver

ตัวอย่าง:

AI ต้องการ

```
current_booking
customer_history
shop_schedule
staff_availability
monthly_booking_count

```

Context Resolver จะอ่าน Manifest แล้วรู้ว่าต้องเรียก Provider ตัวใด

เช่น

```
monthly_booking_count
        ↓
booking_stats_provider
        ↓
Target System API

```

Context / Capability ที่ใช้กับ Conversation-driven Workflow อาจมี เช่น

```
schedule.get_availability
pricing.get_quote
service.get_catalog
customer.get_history
booking.get_current
inventory.check
```

วิธีนี้ทำให้ AI เห็นเฉพาะข้อมูลที่ Project อนุญาต

---

## 5.4 Conversation & Intent Layer

โมดูลนี้ต้องรองรับกรณีที่ Trigger ไม่ได้มาจาก System Event อย่างเดียว แต่เกิดจากบทสนทนากับผู้ใช้โดยตรง เช่น Chat, LINE, Web Chat, Voice Transcript หรือ Customer Support Inbox

หน้าที่หลักคือ

1. ทำความเข้าใจว่าผู้ใช้ต้องการอะไร
2. สกัดข้อมูลจากภาษาธรรมชาติให้อยู่ในรูป Structured Intent
3. แยกข้อมูลที่รู้แล้วออกจากข้อมูลที่ยังขาด
4. ตัดสินใจว่าต้องถามกลับหรือสามารถเดิน Workflow ต่อได้
5. ระบุ Context ที่ต้องขอจากระบบจริงก่อนตอบ
6. รักษา Conversation State ข้ามหลายข้อความ

ตัวอย่างลูกค้าพิมพ์ว่า

```
พรุ่งนี้บ่ายอยากเปลี่ยนยาง Click 160 มีคิวไหม ราคาประมาณเท่าไหร่
```

ระบบควรสกัดออกมาได้ประมาณ

```json
{
  "intent": "book_service",
  "service": "tire_replacement",
  "vehicle": "Honda Click 160",
  "preferred_date": "2026-08-11",
  "preferred_period": "afternoon",
  "known_information": [
    "service",
    "vehicle",
    "preferred_date",
    "preferred_period"
  ],
  "missing_information": [],
  "context_needed": [
    "service_price",
    "available_slots"
  ]
}
```

หลักสำคัญคือ AI สามารถตีความ Intent ได้ แต่ห้ามเดาข้อมูลที่เป็น System Truth เช่น

- คิวว่างจริงหรือไม่
- ราคาจริง
- Inventory จริง
- สิทธิ์ของ User
- สถานะ Booking / Order จริง

ข้อมูลเหล่านี้ต้องขอผ่าน Context Resolver หรือ Capability ที่ Manifest อนุญาตเท่านั้น

### Conversation State

Workflow ต้องสามารถจำ State ของบทสนทนา เช่น

```
conversation_id
workflow_id
project_id
tenant_id
user_id
current_intent
known_facts
missing_fields
context_snapshot
last_question
last_answer
status
```

### Clarification Flow

ถ้าข้อมูลไม่พอ AI ต้องถามเฉพาะข้อมูลที่จำเป็นต่อ Step ถัดไป เช่น

> ต้องการจองวันไหน

> ใช้รถรุ่นอะไร

> ต้องการบริการอะไร

แต่ไม่ควรถามทุกอย่างล่วงหน้าถ้ายังไม่จำเป็น

---

# 6. AI Decision Engine

AI Decision Engine มีหน้าที่

- วิเคราะห์ Event
- วิเคราะห์ Context
- ประเมินสถานการณ์
- เลือกสิ่งที่ควรทำ
- อธิบายเหตุผล
- สร้าง Intent / Proposed Actions

สิ่งสำคัญคือ AI **ไม่ควรสร้าง Database Query หรือ API Call จริง**

AI ควรสร้างเพียง Structured Decision เช่น

```
{
  "decision": "reschedule_booking",
  "reason": "assigned_staff_unavailable",
  "actions": [
    {
      "action": "booking.reschedule",
      "booking_id": "xxx",
      "target_slot": "..."
    }
  ]
}

```

จากนั้นระบบจึงนำ Intent นี้ไปตรวจสอบต่อ

---

# 7. Action Planner / Command Builder

Action Planner ทำหน้าที่แปลง AI Intent ให้เป็น Command ที่ระบบสามารถ Execute ได้

ตัวอย่าง AI บอกว่า

```
cancel_booking

```

Planner จะตรวจ Manifest ว่า Action จริงคือ

```
booking.cancel

```

และต้องใช้ Input อะไร

เช่น

```
{
  "booking_id": "...",
  "reason": "...",
  "actor": "ai_workflow"
}

```

AI จึงไม่ต้องรู้รายละเอียด Implementation ของระบบปลายทาง

---

# 8. Action Adapter

Action Adapter เป็น Integration Layer ระหว่าง Engine กับระบบจริง

Adapter อาจเป็น

- HTTP API
- Internal Function
- Supabase Edge Function
- RPC
- Queue
- Event Bus
- Webhook
- Database Adapter

แต่ AI Workflow Engine ต้องมองทุกอย่างเป็น Abstract Action

เช่น

```
booking.cancel
customer.notify
inventory.update
content.publish
refund.create

```

Implementation จริงเป็นหน้าที่ของ Adapter

---

# 9. Risk & Policy Engine

ก่อน Execute ทุก Action ต้องผ่าน Policy Evaluation

แต่ละ Action ควรกำหนด Risk Level เช่น

```
LOW
MEDIUM
HIGH
CRITICAL

```

ตัวอย่าง:

LOW

- อ่านข้อมูล
- สร้าง Draft
- ส่ง Internal Notification

MEDIUM

- เปลี่ยนสถานะบางอย่าง
- Reschedule

HIGH

- Cancel Booking
- Publish Content
- ส่งข้อความหาลูกค้า

CRITICAL

- Refund
- Delete Data
- Financial Transaction
- Account / Permission Change

Policy Engine ต้องเป็น deterministic logic

**ห้ามให้ AI เป็นผู้ตัดสินเองว่า Action ของตัวเองปลอดภัยหรือไม่**

---

# 10. Human Approval

Action บางประเภทต้องหยุดรอมนุษย์อนุมัติ

สถานะ Workflow เช่น

```
pending
running
awaiting_approval
approved
rejected
executing
completed
failed

```

Approval Request ควรแสดงอย่างน้อย

- AI ต้องการทำอะไร
- กับ Resource ไหน
- เหตุผล
- Context สำคัญ
- ผลกระทบ
- Risk Level
- Proposed Parameters

มนุษย์สามารถ

```
Approve
Reject

```

และอาจรองรับ

```
Approve with modification

```

ในอนาคต

---

# 11. Audit Log

ทุกขั้นตอนของ AI Workflow ต้องตรวจสอบย้อนหลังได้

Audit Log ควรบันทึกอย่างน้อย

```
workflow_id
project_id
tenant_id
event_id
event_type

manifest_version

context_requested
context_received

model
prompt/version

ai_decision
reasoning_summary

proposed_actions

risk_level
policy_result

approval_required
approved_by
approval_time

executed_action
execution_result

error

created_at
completed_at

```

เป้าหมายคือสามารถตอบคำถามย้อนหลังได้ว่า

> เกิดอะไรขึ้น

> AI เห็นข้อมูลอะไร

> AI ตัดสินใจอะไร

> เพราะอะไร

> ใครอนุมัติ

> ระบบ Execute อะไรจริง

> ผลลัพธ์คืออะไร

---

# 12. หลักการสำคัญ

## AI ไม่รู้ Infrastructure

AI ไม่ควรรู้โดยตรงว่า

- Table ชื่ออะไร
- Database อยู่ที่ไหน
- API Endpoint คืออะไร
- Service ใช้อะไร
- Secret อยู่ไหน

AI รู้เฉพาะ Capability ที่ Manifest เปิดให้ใช้

---

## Manifest คือ Contract

ทุก Interaction ระหว่าง AI Workflow Engine และ Project ต้องอิง Manifest

AI ห้ามสร้าง Capability ที่ไม่มีอยู่ใน Manifest

---

## Separate Decision from Execution

ต้องแยก

```
AI Decision

```

ออกจาก

```
System Execution

```

อย่างชัดเจน

AI เสนอสิ่งที่จะทำ

Engine เป็นผู้ตรวจสอบและ Execute

---

## Least Privilege

AI ต้องได้รับ Context และ Action เท่าที่ Workflow นั้นจำเป็นต้องใช้

ห้ามเปิด Database หรือ System Permission ทั้งหมดให้ AI

---

## Human-in-the-loop

Action ที่มีผลกระทบสูงต้องรองรับ Human Approval

แต่ Action ความเสี่ยงต่ำควรสามารถ Execute อัตโนมัติได้

---

## Everything Traceable

ทุก Decision และ Action ต้องตรวจสอบย้อนหลังได้

---

# 13. สิ่งที่ Module นี้ไม่ควรทำ

AI Workflow Engine ไม่ควร

- ผูกกับ Business Domain ใด Domain หนึ่ง
- Query Database ของ Project โดยตรง
- Hard-code Table Name ของ Project
- Hard-code API Endpoint ของ Project
- ให้ AI Execute External Action โดยตรง
- ให้ AI ตัดสิน Risk Policy เอง
- ให้ AI อ่าน Secret
- ให้ AI สร้าง Action ที่ไม่มีใน Manifest

---

# 14. เป้าหมายสุดท้าย

ต้องสามารถเกิด Scenario แบบนี้ได้

Project A:

```
Booking SaaS

```

ส่ง Manifest มา

AI Workflow Engine สามารถ

```
ดู Booking
วิเคราะห์ Capacity
เสนอ Reschedule
ส่งข้อความ

```

Project B:

```
E-commerce

```

ใช้ Engine ตัวเดิม แต่ Manifest ต่างกัน

AI สามารถ

```
วิเคราะห์ Order
ตรวจ Inventory
สร้าง Restock Request
แจ้ง Admin

```

Project C:

```
Content Platform

```

ใช้ Engine ตัวเดิม

AI สามารถ

```
วิเคราะห์ Content
สร้าง Draft
Schedule Post
ขออนุมัติก่อน Publish

```

โดย **Core AI Workflow Engine ไม่ต้องแก้ตามแต่ละ Project**

สิ่งที่แตกต่างระหว่างแต่ละ Project มีเพียง

```
Manifest
Context Providers
Action Adapters
Policies

```

---

# 15. Workflow Definition & Orchestration Model

Engine ต้องมีวิธีนิยาม Workflow ที่ไม่ผูกกับ Business Domain โดย Workflow Definition ต้องรองรับอย่างน้อย

- Step
- Condition / Branch
- Wait / Resume
- Human Approval
- Parallel Step
- Timeout
- Retry
- Failure Route
- Compensation Step
- Completion Condition

Workflow Definition ต้อง Version ได้ และ Workflow Instance ที่กำลังรันต้องผูกกับ Version ที่เริ่มต้นไว้ เพื่อป้องกัน Definition เปลี่ยนกลางทาง

---

# 16. Trigger & Subscription Model

Workflow ต้องสามารถเริ่มจากหลาย Trigger เช่น

- System Event
- User Message
- Manual Trigger
- Webhook
- Schedule / Cron
- API Request

ต้องมี Subscription Rule ว่า Workflow ใดรับ Trigger ประเภทไหน และรองรับ Filter เช่น tenant, entity type, event property หรือ channel

Event หนึ่งรายการอาจ Trigger ได้มากกว่าหนึ่ง Workflow แต่แต่ละ Workflow ต้องมี Idempotency Boundary ของตัวเอง

---

# 17. AI Model Gateway

AI Decision Engine ไม่ควรผูกกับ Model Provider รายใดรายหนึ่ง

ควรมี Model Gateway ที่รับผิดชอบ

- Provider abstraction
- Model selection
- Structured Output validation
- Timeout
- Retry / fallback
- Token / context budget
- Cost limit
- Prompt version
- Model capability requirement
- Provider error normalization

Workflow หรือ Project สามารถกำหนด Policy ได้ว่า Step ใดต้องใช้ Model ระดับใด โดย Core Engine ไม่ต้องรู้ implementation ของ Provider

---

# 18. Context Governance

Context Resolver ต้องควบคุมไม่ใช่แค่ Permission แต่รวมถึงการจัดการข้อมูลที่ส่งเข้า AI

ต้องออกแบบเรื่อง

- Data classification
- PII masking / redaction
- Secret filtering
- Tenant isolation
- Context freshness
- Cache policy
- Context size limit
- Token budget
- Retention policy
- Sensitive data logging policy

Context ที่เป็น System Truth ควรมี metadata เช่น source, fetched_at และ version เมื่อเหมาะสม

---

# 19. Execution Semantics & Recovery

ระบบต้องกำหนด semantics สำหรับกรณี distributed failure อย่างชัดเจน

ต้องรองรับอย่างน้อย

- Idempotency Key
- Duplicate Event Detection
- At-least-once Delivery
- Retry with Backoff
- Timeout
- Partial Success
- Action Result Reconciliation
- Dead-letter / Failed Workflow Handling
- Compensation Action เมื่อ rollback ทางเทคนิคทำไม่ได้

ตัวอย่างสำคัญคือ Action สำเร็จที่ Target System แต่ response กลับไม่ถึง Engine ระบบต้องไม่ยิง Action ซ้ำแบบไม่ตรวจสอบ

---

# 20. Capability Lifecycle & Manifest Validation

Manifest ต้องมี lifecycle และ validation ที่ชัดเจน

ควรรองรับ

- Schema validation
- Manifest registration
- Activation / deactivation
- Version compatibility
- Deprecated capability
- Adapter availability check
- Capability health check
- Migration rule
- Trust / signature mechanism ในกรณีที่ Manifest มาจากภายนอก

Engine ต้องไม่ถือว่า Capability ใช้งานได้เพียงเพราะถูกประกาศใน Manifest แต่ต้องตรวจสอบว่า Adapter หรือ Provider ที่เกี่ยวข้องพร้อมใช้งานจริง

---

# 21. Rate Limit, Quota & Cost Control

เพื่อให้โมดูลใช้ได้กับ SaaS หลาย Tenant ต้องมี resource control เช่น

- Request rate limit
- Workflow concurrency limit
- AI token / cost quota
- Action frequency limit
- Per-project / per-tenant quota
- Circuit breaker

Policy เหล่านี้ควร deterministic และไม่ให้ AI เปลี่ยนเอง

---

# 22. Dry-run / Simulation Mode

Engine ควรรองรับโหมดที่ Workflow เดินครบกระบวนการ แต่ไม่ Execute External Action จริง

Dry-run ควรแสดง

- Event ที่ได้รับ
- Context ที่ร้องขอ
- AI Decision
- Proposed Actions
- Policy Result
- Action ที่จะ Execute
- Expected Side Effects

โหมดนี้สำคัญสำหรับการทดสอบ Manifest, Prompt, Policy และ Adapter ก่อนเปิดใช้จริง

---

# 23. Conversation-driven Capability Requirements

เพื่อรองรับ use case เช่น Booking, Sales, Support และ Service Consultation แต่ละ Project สามารถประกาศ Capability ที่ AI ใช้ตอบคำถามและเดิน Workflow ได้ เช่น

```
schedule.get_availability
pricing.get_quote
service.get_catalog
booking.create
booking.reschedule
customer.get_history
customer.update_profile
notification.send
```

จาก Capability เหล่านี้ AI Workflow Engine ต้องสามารถทำ Scenario เช่น

1. เข้าใจว่าลูกค้าต้องการจองวันไหน
2. ตรวจสอบว่าช่วงเวลานั้นว่างจริงหรือไม่
3. ขอราคา / quotation จากระบบจริง
4. ให้คำแนะนำจากข้อมูลบริการและ Context ที่อนุญาต
5. ถามข้อมูลเพิ่มเมื่อข้อมูลไม่ครบ
6. สรุปความต้องการของลูกค้าเป็น Structured Intent
7. เสนอ Action เช่นสร้าง Booking
8. Execute เฉพาะเมื่อผ่าน Policy และ Approval ที่กำหนด

AI สามารถวิเคราะห์และแนะนำได้ แต่ System Truth ทุกประเภทต้องมาจาก Context Provider หรือ Capability ของ Project

---

# 24. งานที่ต้องออกแบบต่อ

ให้ Agent วิเคราะห์และออกแบบต่ออย่างน้อยเรื่องต่อไปนี้

1. Project Manifest Specification
2. Manifest Versioning
3. Event Schema
4. Workflow Runtime
5. Context Resolver
6. Context Provider Interface
7. AI Decision Contract
8. Structured Output Schema
9. Action Planner
10. Action Adapter Interface
11. Risk / Policy Engine
12. Human Approval Flow
13. Workflow State Machine
14. Audit Log Schema
15. Idempotency
16. Retry / Timeout / Failure Handling
17. Permission / Tenant Isolation
18. Security Boundary
19. Observability / Logging
20. Testing Strategy
21. Workflow Definition Schema
22. Trigger & Subscription Model
23. Conversation State / Intent Contract
24. Model Gateway
25. Context Governance
26. Compensation / Recovery
27. Capability Lifecycle / Manifest Validation
28. Rate Limit / Cost Control / Dry-run Mode

เป้าหมายของการออกแบบรอบถัดไปคือทำให้ AI Workflow Engine สามารถเป็น **Reusable Infrastructure Module** ที่ Project อื่นนำไปใช้ได้โดยเพียงประกาศความสามารถของตัวเองผ่าน Manifest และ Adapter โดยไม่ต้องแก้ Core Engine