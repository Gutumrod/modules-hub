# Module Hub — Index Map

> แผนที่ทุก Module ฝั่งใช้งาน — กวาดตามองเดียวรู้: path จริงอยู่ไหน, import อะไร, เรียกยังไง
> ไม่ต้องไล่อ่านโค้ดทีละ folder ดูโครงสร้างแบบละเอียดได้ที่ [ROADMAP.md](./modules/ROADMAP.md) และสถานะเร็วที่ [REGISTRY.md](./modules/REGISTRY.md)

---

## ⛔ กฎการใช้งาน — ห้ามรันงานจริงในนี้

**`modules-hub` เป็นคลัง (library) เก็บ module ไว้เผื่อสร้างโปรเจกต์ใหม่เท่านั้น**

- ❌ ห้าม import module จากที่นี่ตรงๆ เข้าโปรเจกต์อื่นข้าม path (`../modules-hub/...`)
- ❌ ห้าม build / deploy / รันแอปจริงจากในโฟลเดอร์นี้
- ❌ ห้ามแก้โค้ดในนี้เพื่อ "แก้ด่วน" ให้โปรเจกต์ใดโปรเจกต์หนึ่งใช้งานได้ — จะทำให้ module เพี้ยนไปตาม use case เดียว แล้ว project อื่นพังตาม
- ✅ ถ้าจะใช้ module ไหน → **ก็อปโฟลเดอร์นั้นทั้งก้อนไปไว้ในโปรเจกต์ปลายทาง** แล้วแก้/ต่อยอดที่สำเนานั้น

**Why:** ที่นี่คือจุดกลางที่ทุกโปรเจกต์ในอนาคตจะมาหยิบของ ถ้าปล่อยให้โปรเจกต์ใดโปรเจกต์หนึ่งเขียนทับหรือรันตรงนี้ จะไม่มี "ต้นฉบับสะอาด" เหลือให้โปรเจกต์ถัดไปก็อปอีก

### ✅ Checklist ก่อนเอา module ไปใช้

1. [ ] เปิด INDEX.md นี้ หา module + path จริง
2. [ ] `cp -r <module>-module/ <ปลายทางโปรเจกต์>/src/modules/<module>/` (หรือเทียบเท่าบน Windows)
3. [ ] อ่าน `MODULE.md` ในสำเนาที่ก็อปไป (ไม่ใช่อันในนี้) — spec + ข้อควรระวัง
4. [ ] ดู `integration.example.ts` ประกอบ
5. [ ] เช็ค config ที่ host ต้อง inject เอง (module ไม่อ่าน env ตรง)
6. [ ] แก้/ต่อยอดเฉพาะในสำเนาที่โปรเจกต์ปลายทาง — ห้ามย้อนมาแก้ในนี้เพื่อ hack ให้ใช้งานได้เร็วๆ

## Status Legend
* ⬜️ Planned · 🟡 In Progress · 🧪 Pilot / Testing · ✅ Completed (พร้อมใช้)

---

## ✅ Completed Modules (พร้อมใช้จริง)

| Module | Priority | Version | Path จริง | Entry point | API หลักที่ export |
|--------|:--:|:--:|-----------|-------------|-------------------|
| **Notification** | P0 | 0.2.0 | `modules/notification/` | `core/client.ts` | `NotificationClient`, `createNotifier(config)` |
| **Config / Runtime** | P0 | 0.1.0 | `modules/config-runtime/` | `core/index.ts` | `defineConfig`, `parseConfig`, `validateConfig`, `redactConfig`, `createRuntimeContext` |
| **File Storage** | P0 | 0.1.0 | `modules/file-storage/` | `core/index.ts` | `createFileStorage(config)` + types (`StorageAdapter`, `StorageError` ฯลฯ) |
| **Webhook Receiver** | P0 | 0.1.0 | `modules/webhook-receiver/` | `core/index.ts` | `createWebhookReceiver(config)` + types |
| **Audit Log** | P0 | 0.1.0 | `modules/audit-log/` | `core/index.ts` | ดู MODULE.md (contract actor/action/entity/...) |
| **HTTP Client** | P0 | 0.1.0 | `modules/http-client/` | `index.ts` | `createHttpClient`, `HttpError`, `createFetchTransport` + types |
| **Event Bus** | P1 | 0.1.0 | `modules/event-bus/` | `index.ts` | `createEventBus(config)`, `publish`, `subscribe`, `unsubscribe` + types (`Event`, `EventHandler`, `PublishResult`) |
| **Payment Core + Stripe** | P1 | 0.1.0 | `modules/payment/` | `index.ts` | `createPaymentCore` + types (`PaymentError`, `assertValidAmount` ฯลฯ) |
| **Subscription + Entitlement** | P1 | 0.1.0 | `modules/subscription/` | `index.ts` | `createSubscriptionCore`, `createEntitlementEngine` + types |
| **Supabase Auth Helpers** | P1 | 0.2.0 | `modules/auth-supabase/` | `index.ts` | `createSupabaseAuthHelpers`, `requireRole`, `requirePermission`, `requireTenantMembership`, `hasPermission`, `buildRlsContext` |
| **Auth (Data/Login-Agnostic)** | P1 | 0.1.0 | `modules/auth/` | `index.ts` | `createAuthHelpers`, `getCurrentUser`, `requireUser`, `requireRole`, `requirePermission`, `requireTenantMembership`, `createSupabaseAdapter`, `createCredentialStoreAdapter`, `createJwtAdapter` |
| **Ticket Tracker** | P2 | 0.2.0 | `modules/ticket-tracker/` | `index.ts` | `createTicketRoutes(store, schema)`, `createJsonFileStore(filePath)`, `DEFAULT_SCHEMA`, `validateCreatePayload` + types (`TicketSchema`, `TicketStore`) |
| **Tenant Context** | P1 | 0.3.0 | `modules/tenant-context/` | `index.ts` | `createTenantContext`, `TenantContextManager`, `createExpressLikeTenantMiddleware` |
| **Rate Limit** | P1 | 0.1.0 | `modules/rate-limit/` | `index.ts` | `createRateLimiter(config)`, `checkRateLimit`, `createMemoryStore` + types |
| **Feature Flags** | P1 | 0.1.0 | `modules/feature-flags/` | `index.ts` | `createFeatureFlagClient(config)`, `createMemoryFlagStore()` + types |
| **Product Catalog** | P1 | 0.1.0 | `modules/product-catalog/` | `index.ts` | `createProductCatalogService(config)` + types (ProductRepository, MediaStorage) |
| **Job / Retry** | P2 | 0.3.0 | `modules/job-retry/` | `index.ts` | `DefaultJobRunner`, `RedisJobStorage`, `RedisLockProvider`, `calculateNextDelay` + types |
| **Scheduler** | P2 | 0.3.0 | `modules/scheduler/` | `index.ts` | `MemorySchedulerEngine`, `MemoryDistributedLock`, `RedisDistributedLock` |
| **Import / Export** | P2 | 0.2.0 | `modules/import-export/` | `index.ts` | `StreamParser`, `StreamSerializer`, `StreamingParser`, `XLSXAdapter` |
| **Health Check** | P2 | 0.2.0 | `modules/health-check/` | `index.ts` | `HealthCheckRegistry`, `SimpleMetricsCollector` + types |
| **AI Provider** | P2 | 0.3.0 | `modules/ai-provider/` | `index.ts` | `AIProvider`, `FallbackAIProvider`, provider adapters |
| **AI Workflow Engine** | P2 | 0.3.0 | `modules/ai-workflow-engine/` | `index.ts` | `AIWorkflowRuntime`, `PersistentMemoryStore`, `RedisStateStore` |
| **Enterprise Features** | P1 | 0.3.0 | `modules/enterprise-features/` | `index.ts` | `CircuitBreaker`, `Tracer`, `NoopTracer`, `MemoryTracer` |

## 🧪 Pilot / Testing Modules

| Module | Priority | Version | Path จริง | Entry point | API หลักที่ export |
|--------|:--:|:--:|-----------|-------------|-------------------|
| **LINE OA AI Module** | P1 | 0.1.0 | `modules/line-oa-ai-module/` | `src/index.ts` | `createLineOaModule`, `LineOaWebhookHandler`, `PromptBasedAiAdapter`, `RuleBasedAiAdapter`, `LineMessagingClient`, `MemorySessionStore`, `RedisSessionStore` + types |

### ใช้ยังไง (ตัวอย่าง import)

```ts
// HTTP Client — มี index.ts กลาง
import { createHttpClient, createFetchTransport } from './modules/http-client/index.js';

// File Storage — อยู่ root module
import { createFileStorage } from './modules/file-storage/core/index.js';

// Config / Runtime
import { defineConfig, createRuntimeContext } from './modules/config-runtime/core/index.js';

// Notification — ไม่มี index กลาง ใช้ core/client.ts
import { createNotifier } from './modules/notification/core/client.js';

// Webhook Receiver
import { createWebhookReceiver } from './modules/webhook-receiver/core/index.js';

// Audit Log
import { createAuditLog } from './modules/audit-log/core/index.js';

// Event Bus
import { createEventBus } from './modules/event-bus/index.js';

// Payment Core
import { createPaymentCore } from './modules/payment/index.js';

// Subscription + Entitlement
import { createSubscriptionCore, createEntitlementEngine } from './modules/subscription/index.js';

// Supabase Auth Helpers (locked to Supabase Auth — use for existing Supabase projects)
import { createSupabaseAuthHelpers, requireRole } from './modules/auth-supabase/index.js';

// Auth — data/login-agnostic (any DB, any credential store, any JWT — host injects the adapter)
import { createAuthHelpers, createCredentialStoreAdapter, createSupabaseAdapter, createJwtAdapter } from './modules/auth/index.js';

// Ticket Tracker — login-agnostic, storage-agnostic ticket lifecycle (pair with auth module for gating)
import { createJsonFileStore, createTicketRoutes } from './modules/ticket-tracker/index.js';

// Tenant Context
import { createTenantContext, TenantContextManager } from './modules/tenant-context/index.js';

// Rate Limit
import { createRateLimiter, createMemoryStore } from './modules/rate-limit/index.js';

// Feature Flags
import { createFeatureFlagClient, createMemoryFlagStore } from './modules/feature-flags/index.js';

// Product Catalog
import { createProductCatalogService } from './modules/product-catalog/index.js';

// Job / Retry
import { DefaultJobRunner, RedisJobStorage, RedisLockProvider } from './modules/job-retry/index.js';

// Scheduler
import { MemorySchedulerEngine, RedisDistributedLock } from './modules/scheduler/index.js';

// Import / Export
import { StreamParser, StreamSerializer } from './modules/import-export/index.js';

// Health Check
import { HealthCheckRegistry } from './modules/health-check/index.js';

// AI Provider
import { OpenAIProvider, FallbackAIProvider } from './modules/ai-provider/index.js';

// AI Workflow Engine
import { AIWorkflowRuntime, RedisStateStore } from './modules/ai-workflow-engine/index.js';

// Enterprise Features
import { CircuitBreaker, MemoryTracer } from './modules/enterprise-features/index.js';

// LINE OA AI Module (Pilot)
import { createLineOaModule, PromptBasedAiAdapter } from './modules/line-oa-ai-module/src/index.js';
```

> 💡 ตัวที่เสร็จแล้วส่วนใหญ่ใช้ entry point = `core/index.ts` หรือ `index.ts` ยกเว้น **Notification** ที่ต้องชี้ `core/client.ts` ตรงๆ

---

## 📁 โครงสร้างจริง (ไม่ consistent — สังเกต path)

| ที่อยู่ | หมายถึง |
|--------|---------|
| `modules/<name>/` | Module แต่ละตัว รวม source, tests, design และตัวอย่าง integration |
| `modules/briefs/` | บรีฟกลางและ dependency map |
| `modules/ai-workflow-engine/` | AI workflow module ที่รวมเข้า Module Hub แล้ว และไม่มี Git repository ซ้อน |
| `modules/docs/blueprints/` | Niche Projects Blueprints (Manus AI) — แผน commercialize + วิธีประกอบ modules |
| `modules/docs/reports/` | รายงาน security/stress testing + enhancement proposal |

---

## 🧭 วิธีนำไปใช้ในโปรเจกต์ใหม่

> ดูกฎเต็มๆ + checklist ที่หัวไฟล์ ([⛔ กฎการใช้งาน](#-กฎการใช้งาน--ห้ามรันงานจริงในนี้)) — สรุปคือ **ก็อปออกไปก่อนเสมอ** ห้าม import ข้าม path เข้ามาที่นี่ตรงๆ

1. เปิด [INDEX.md](./INDEX.md) นี้ → หา module ที่ต้องการ + **Path จริง** + **Entry point**
2. ก็อปโฟลเดอร์ module นั้นทั้งก้อนไปไว้ในโปรเจกต์ปลายทาง
3. import ตามตัวอย่างด้านบน แต่ชี้ path ไปยังสำเนาในโปรเจกต์ตัวเอง ไม่ใช่ path ในนี้
4. อ่าน `MODULE.md` ของสำเนานั้น (spec + ข้อควรระวัง)
5. ดู `integration.example.ts` (ตัวอย่างประกอบครบ) — เช่น `http-client/examples/integration.example.ts`
6. เช็ค Config ที่ host ต้อง inject — Core ไม่อ่าน env (ทุก module ทำตามนี้)

---

## 🔗 Reference

- **REGISTRY.md** — ตารางสถานะเร็ว 22 modules → `modules/REGISTRY.md`
- **ROADMAP.md** — spec ละเอียดทุก module + ลำดับทำต่อ → `modules/ROADMAP.md`
- **briefs/** — บรีฟแยกต่อ module → `modules/briefs/`
- **blueprints/** — แผน commercialize 5 niche projects (Manus AI) → `modules/docs/blueprints/`
- **utilities/** — shared utilities drafts (ยังไม่ implement) → `utilities/`
