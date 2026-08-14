# Niche Projects Blueprints — Module Hub v0.3.0

> แผน commercialize Module Hub — ประกอบ modules ที่มีอยู่เป็นโปรเจกต์จริง (Composition)
> ผู้จัดทำ: **Manus AI** (2026)

## เอกสาร
- **PDF:** [Niche-Projects-Blueprints.pdf](./Niche-Projects-Blueprints.pdf)
- **Markdown:** [Niche-Projects-Blueprints.md](./Niche-Projects-Blueprints.md)
- **เกี่ยวข้อง:** [../reports/Module_Hub_v0.3.0_Enhancement_Proposal.md](../reports/Module_Hub_v0.3.0_Enhancement_Proposal.md) (enhancement proposal — Manus AI)

## 5 Niche Projects

| # | Niche Project | Modules ที่ใช้ |
|---|---|---|
| 1 | **AI Resilience Gateway** | ai-provider, **enterprise-features (CircuitBreaker)**, tenant-context |
| 2 | Smart Content Auto-Pilot | scheduler, ai-workflow-engine, ai-provider |
| 3 | Enterprise Bulk ETL & Sync | import-export, job-retry, health-check |
| 4 | **Multi-Tenant AI Micro-SaaS** | tenant-context, ai-provider, **enterprise-features (TracingTracer)** |
| 5 | Autonomous IT Ops Watchdog | job-retry, ai-workflow-engine, health-check |

## ⚠️ ข้อสังเกต (ตรวจสอบ 2026-08-13)
Blueprint อ้าง module ต่อไปนี้แต่**โค้ดยังไม่มีใน repo**:
- `FallbackAIProvider` (blueprint #1) — ai-provider ยังไม่มี
- `CircuitBreaker` (blueprint #1) — ยังไม่มี implementation
- `TracingTracer` / `UniversalTracer` (blueprint #4) — ยังไม่มี implementation
- `PersistentMemoryStore` (blueprint #2) — ai-workflow-engine ยังไม่มี

**ก่อนทำ blueprint ใด ต้องสร้าง module ที่ขาดจาก use case จริงก่อน** โดยเอกสารนี้ไม่ถือเป็นหลักฐานว่า module ดังกล่าว Completed

## หมายเหตุ
- ไม่มี `modules/enterprise-features/` เพราะ placeholder เดิมไม่มี source หรือ public API; แนวคิดยังอยู่ใน blueprint ในสถานะ Planned เท่านั้น
- บางโค้ดใน blueprint (เช่น `TenantContextManager`, `JobQueue`, `Scheduler.cron`) ชื่อ API ไม่ตรงกับ module จริง ต้องปรับตอน implement
