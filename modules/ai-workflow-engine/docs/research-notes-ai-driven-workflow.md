# AI-Driven Workflow — Research Notes

> เก็บข้อมูลที่หามาได้ (2026-08-10) สำหรับประกอบการออกแบบ ai-workflow-engine
> แหล่ง: DZone, IBM, Neuwark, Celigo, Wikipedia

---

## 1. Architecture Pattern — "Shell and Node" (จาก DZone)

**ที่มา:** https://dzone.com/articles/building-state-driven-ai-workflow-engine
**ใช้จริงใน:** Banana AI (AI creative platform — LLM calls + image gen + video processing)

### 4 Core Components
| Component | Responsibility | Analogy |
|-----------|---------------|---------|
| **State** | Global context object ไหลผ่าน pipeline | Tray งาน |
| **Node** | Pure function ทำ 1 งาน | Worker |
| **Router** | Pure function ตัดสินใจ node ถัดไป | Dispatcher |
| **Engine** | Loop รัน nodes จนจบ | Conveyor belt |

### ทำไมเหมาะกับ AI
AI workflow เป็น multi-step, branching, asynchronous — request เดียวอาจต้อง:
intent analysis → prompt refinement → credit check → task submit → result delivery
แต่ละ step มี latency/failure mode ต่างกัน

### ข้อดี
- เพิ่ม feature ใหม่ = เพิ่ม node + อัปเดต router เท่านั้น ไม่แตะ engine
- แต่ละ node เป็น pure function → test ได้ใน isolation
- Router รวมอยู่ที่เดียว → เห็นทุก path ของระบบ

### State Bus Design (TypeScript)
```ts
export interface AgentState {
  input: { messages: ModelMessage[]; userUuid: string; ... };
  evaluation?: { intent: 'GENERATE_MEDIA' | 'GENERAL_CHAT' | 'ASK_FOR_INFO'; ... };
  credit?: { reservationId: string; amount: number };
  submit?: { predictionId: string; messageUuid: string };
  upload?: { uploadedMedia: UploadedMedia[] };
  error?: { code: string; message: string };
  nextStep: NodeName;  // control flow
}
```
- แต่ละ sub-object เขียนโดย node เดียว
- Engine ใช้ shallow merge: `state = { ...state, ...nodeOutput }`

---

## 2. Definition + สถิติ (จาก IBM)

**ที่มา:** https://www.ibm.com/think/topics/ai-workflow

- **AI workflow** = ใช้ AI automate/coordinate/enhance กระบวนการ — อัตโนมัติหรือร่วมกับมนุษย์
- 82% ของ operations executives คาดว่า process automation จะมีประสิทธิภาพขึ้นเพราะ AI agents ภายใน 2027
- AI-enabled workflows คาดว่าจะเพิ่มจาก 3% → 25% ภายในสิ้นปี 2025
- ตัวอย่าง: simple = LLM classify support ticket / complex = multi-agent ทำงาน research+draft+review

---

## 3. 10 Enterprise Use Cases (จาก Neuwark)

**ที่มา:** https://neuwark.com/blog/ai-workflow-automation-examples-10-real-enterprise-use-cases

### Pattern ที่ยั่งยืน: intake → reasoning → action → review
ถ้า use case อธิบาย 4 ขั้นนี้ไม่ได้ → มันคือ feature demo ไม่ใช่ workflow automation

### 10 Use Cases
| # | Use Case | ตัวอย่าง |
|---|----------|---------|
| 1 | Support ticket triage | classify + retrieve context + route (ServiceNow) |
| 2 | Security alert triage | enrich + summarize + recommend (MS Security Copilot) |
| 3 | IT incident correlation | จับคู่ incident + เตรียม response |
| 4-10 | Sales follow-up, Finance, HR, Procurement, Legal, Customer ops, Data collection | — |

### จุดที่ AI เพิ่มค่ามากสุด
- งาน high-volume, repetitive, context-heavy
- **"The workflow matters more than the model"** — ตัว workflow สำคัญกว่าโมเดล

---

## 4. Workflow Engine พื้นฐาน (จาก Wikipedia)

**ที่มา:** https://en.wikipedia.org/wiki/Workflow_engine

- ซอฟต์แวร์จัดการ business processes — คุม state ของ activity ใน workflow
- 3 ฟังก์ชันหลัก:
  1. ตรวจสถานะปัจจุบันว่าทำ task นี้ได้ไหม
  2. เช็คสิทธิ์ผู้ใช้
  3. Execute task + rollback ถ้าผิดพลาด
- เรียกอีกชื่อ: **Workflow Orchestration Engine**

### แนวคิดที่เกี่ยวข้อง
- **State machine** — หัวใจ (สถานะ + transition)
- **Orchestration vs Choreography** — ตัวกลางคุม flow vs แต่ละ service คุยกันเอง
- **DAG (Directed Acyclic Graph)** — งานที่ต้องเรียงลำดับ dependency
- **Idempotency / retry / rollback** — กันงานซ้ำ + กู้คืน
- **Event-driven** — trigger จาก event แทน polling

---

## 5. AI Workflow Automation (จาก Celigo)

**ที่มา:** https://www.celigo.com/blog/ai-workflow/

- AI workflow = orchestrated, integrated automation
- ใช้ได้หลาย function: Commerce, Customer Support, Finance, IT, PeopleOps, Supply Chain
- Use cases: Order-to-Cash, Procure-to-Pay, Lead Lifecycle, Employee Onboarding, AP/AR, Demand Planning

---

## หมายเหตุ
- web search backend (ddgs) ยังพังใน runtime — ใช้ curl + browser ดึงข้อมูลแทน
- ddgs ติดตั้งใน `.venv` แล้ว แต่ต้อง restart Hermes process ถึงจะโหลด
- แหล่งข้อมูลนี้เป็น background research — ยังไม่ใช่ spec/design ของ ai-workflow-engine
