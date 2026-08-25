# Module Hub — Roadmap (v0.3.0)

> Reusable Building Blocks สำหรับนำไปประกอบโปรเจกต์ใหม่ (v0.3.0 Universal & Enterprise)
> หลักการ: Reuse infrastructure, build only business logic.
> บรีฟแต่ละ module อยู่ใน [briefs/](./briefs/) — กฎกลางดู [00-common-rules.md](./briefs/00-common-rules.md)

## Status Legend
* ⬜️ Planned · 🟡 In Progress · 🧪 Pilot / Testing · ✅ Completed

---

# ✅ Notification — Completed

**Priority:** P0
**Status:** ✅ Completed
**Version:** 0.2.0
**บรีฟ:** (MODULE 1 — ทำเสร็จแล้ว)

> ระบบส่ง Notification แบบ generic โดย host project เลือก provider เอง

- ✅ Notification core
- ✅ Generic Webhook Provider
- ✅ Retry / Timeout / Idempotency / HMAC-SHA256
- ✅ Provider injection / Optional HMAC / Custom headers
- ✅ Structured errors / Input validation / HTTPS validation
- ✅ Security tests / Cloudflare integration example
- ✅ MODULE.md final / Test + typecheck ผ่าน (23 tests)

**Future Providers (รอ use case จริง):** LINE · Telegram · Email · Discord

---

# P0 — Core Infrastructure

## Config / Runtime

**Status:** ✅ Completed
**Version:** 0.1.0
**บรีฟ:** [config-runtime.md](./briefs/config-runtime.md)

> มาตรฐานกลางสำหรับ config + runtime environment ของทุก module

- ✅ defineConfig / parseConfig / validateConfig / redactConfig / createRuntimeContext
- ✅ Host inject config — Core ไม่อ่าน global env
- ✅ Explicit type coercion (boolean รับแค่ "true"/"false", numeric ตรวจ NaN/Infinity/range)
- ✅ Secret field marking + redaction → [REDACTED]
- ✅ Structured errors (CONFIG_MISSING/INVALID/TYPE_INVALID/VALUE_OUT_OF_RANGE/RUNTIME_CONTEXT_INVALID)
- ✅ Prototype-pollution-safe / ไม่ mutate input / frozen output
- ✅ RuntimeContext contract (ไม่ hard-code runtime list)
- ✅ MODULE.md + integration.example.ts + VERSION 0.1.0
- ✅ Test + typecheck ผ่าน (88 tests)

## File Storage

**Status:** ✅ Completed
**Version:** 0.1.0
**บรีฟ:** [file-storage.md](./briefs/file-storage.md)

> API กลางสำหรับจัดการไฟล์ โดยเปลี่ยน Storage Provider ได้

- ✅ upload / delete / getUrl / getMetadata / exists
- ✅ Core ไม่รู้จัก R2 — ผ่าน StorageAdapter interface
- ✅ Cloudflare R2 Adapter implement จริง
- ✅ File validation (max size, MIME allowlist, filename sanitization, empty/unsupported reject)
- ✅ Safe object key generation (uploads/{year}/{month}/{uuid}.jpg — ไม่ใช้ user filename ตรงๆ)
- ✅ Path traversal / dangerous filename / spoofed extension / oversized protection
- ✅ public/private concept
- ✅ Structured StorageError codes
- ✅ Config inject จาก host — Core ไม่อ่าน env
- ✅ MODULE.md + integration.example.ts + VERSION 0.1.0
- ✅ Test + typecheck ผ่าน (62 tests)

## Webhook Receiver

**Status:** ✅ Completed
**Version:** 0.1.0
**บรีฟ:** [module-3.md](./briefs/module-3.md)

> มาตรฐานกลางสำหรับรับ webhook จาก external services (ตรงข้ามกับ Notification)

- ✅ Core: request parsing, signature verification, timestamp validation, replay protection, idempotency, payload validation
- ✅ Adapters: Generic HMAC (implement) · LINE · Stripe · GitHub (contract placeholders — รอ use case จริง)
- ✅ Security: invalid signature rejection, timing-safe comparison, payload size limit
- ✅ Config inject จาก host — Core ไม่อ่าน env
- ✅ MODULE.md + integration.example.ts + VERSION 0.1.0
- ✅ Test + typecheck ผ่าน (121 tests)

## Audit Log

**Status:** ✅ Completed
**Version:** 0.1.0
**บรีฟ:** [module-4.md](./briefs/module-4.md)

> บันทึกว่าใครทำอะไรกับข้อมูลอะไร เมื่อไหร่

- ✅ Contract: actor / action / entity / entityId / before / after / metadata / timestamp
- ✅ Sensitive field redaction
- ✅ Storage adapters: InMemory + Supabase/Postgres
- ✅ Config inject จาก host — Core ไม่อ่าน env
- ✅ MODULE.md + integration.example.ts + VERSION 0.1.0
- ✅ Test + typecheck ผ่าน (126 tests)

## HTTP Client

**Status:** ✅ Completed
**Version:** 0.1.0
**บรีฟ:** [module-8.md](./briefs/module-8.md) (ถ้ามี) — ดู [briefs/](./briefs/)

> HTTP client กลางแบบ generic — timeout, retry, error normalization

- ✅ Core: timeout, exponential backoff retry, error normalization, secret header redaction
- ✅ Adapters: fetch-transport
- ✅ Config inject จาก host — Core ไม่อ่าน env
- ✅ MODULE.md + integration.example.ts + VERSION 0.1.0
- ✅ Test + typecheck ผ่าน (157 tests)

---

# P1 — SaaS Money Layer

## Event Bus

**Status:** ✅ Completed
**Version:** 0.1.0
**บรีฟ:** [event-bus.md](./briefs/event-bus.md)

> ระบบ publish/subscribe ภายในโปรเจกต์ — decouple module ต่อ module (in-process, not durable)

- ✅ Event contract (id/type/payload/timestamp/source/subject/correlationId/metadata)
- ✅ publish / subscribe / unsubscribe + async handler support
- ✅ Deterministic sequential execution (subscription order)
- ✅ Handler failure isolation — execute remaining handlers, collect failures, return PublishResult
- ✅ Duplicate subscription handling (same-handler, unsubscribe, handler identity)
- ✅ Exact event type matching (no wildcard in v0.1)
- ✅ Explicit delivery semantics (in-process, at-most-once, not durable, no restart recovery)
- ✅ Error model: EVENT_INVALID / EVENT_TYPE_INVALID / SUBSCRIBER_INVALID / HANDLER_FAILED / PUBLISH_FAILED
- ✅ Security — never auto-log payload/tokens/secrets/PII (not an audit log)
- ✅ Config inject จาก host — Core ไม่อ่าน env
- ✅ MODULE.md + integration.example.ts + VERSION 0.1.0
- ✅ Test + typecheck ผ่าน (91 tests)

## Payment Core + Stripe

**Status:** ✅ Completed
**Version:** 0.1.0
**บรีฟ:** [module-5.md](./briefs/module-5.md)

> รับเงินแบบ generic — เปลี่ยน gateway อนาคตได้โดยไม่รื้อ business logic

- ✅ Core: createPayment / getPayment / refundPayment / verifyPayment
- ✅ Stripe Adapter (`core/` + `adapters/stripe-adapter.ts`) ผ่าน Web `fetch` (Cloudflare Workers compatible)
- ✅ Integer minor units amount rule & validation (`assertValidAmount`)
- ✅ Idempotency key enforcement (`idempotencyKey`)
- ✅ Normalized 7 payment statuses & 16 structured error codes (`PaymentError`)
- ✅ Stripe webhook event parser (`parsePaymentEvent`)
- ✅ Unit tests & typecheck ผ่าน (17 tests)
- ✅ MODULE.md + integration.example.ts + VERSION 0.1.0

## Subscription + Entitlement

**Status:** ✅ Completed
**Version:** 0.1.0
**บรีฟ:** [module-6.md](./briefs/module-6.md)

> จัดการ lifecycle subscription แบบ generic — host ถามสิทธิ์ผ่าน `canUseFeature()`

- ✅ Plan contract & Entitlements dictionary (`null` = unlimited)
- ✅ Subscription lifecycle state machine (`trialing`, `active`, `past_due`, `grace_period`, `cancel_at_period_end`, `cancelled`, `expired`)
- ✅ Entitlement engine (`canUseFeature`, `getLimit`, `checkUsage`)
- ✅ Storage-agnostic repository interfaces (`SubscriptionRepository`, `PlanRepository`)
- ✅ Normalized billing event handling (`handleBillingEvent`)
- ✅ Unit tests & typecheck ผ่าน (3 tests)
- ✅ MODULE.md + integration.example.ts + VERSION 0.1.0

## Supabase Auth Helpers

**Status:** ✅ Completed (Enterprise)
**Version:** 0.2.0
**บรีฟ:** [module-7.md](./briefs/module-7.md)

> ไม่สร้าง Auth ใหม่ แต่ห่อ functionality ที่ทุกโปรเจกต์ต้องเขียนซ้ำ

- ✅ createSupabaseAuthHelpers / requireRole / requirePermission / requireTenantMembership
- ✅ Tenant membership guard
- ✅ ห้าม: custom password, custom auth engine
- ✅ MODULE.md + integration.example.ts + VERSION 0.2.0
- ⚠️ ผูกกับ Supabase Auth โดยเจตนา (ดู Non-Goals ใน DESIGN.md) — โปรเจกต์ที่ไม่มี Supabase ใช้ไม่ได้ ให้ใช้โมดูล **Auth (Data/Login-Agnostic)** ด้านล่างแทน

## Auth (Data/Login-Agnostic)

**Status:** ✅ Completed
**Version:** 0.1.0
**สร้างโดย:** Agent relay (AGY Architect → Codex Builder → Qwen QA), 2026-08-15

> `auth-supabase` ผูกกับ Supabase Auth โดยเจตนา ทำให้โปรเจกต์ที่ใช้ data/login แบบอื่น (custom DB, JSON file, JWT เอง ฯลฯ) ใช้ไม่ได้เลย โมดูลนี้แก้จุดนั้น — core เป็น provider-agnostic ทั้งหมด (ไม่ import SDK/DB ใดๆ, ไม่แตะ env) ต่อกับข้อมูล/ระบบ login แบบไหนก็ได้ผ่าน adapter ที่ host เลือกเอง

- ✅ Core: `getCurrentUser` / `requireUser` / `requireRole` / `requirePermission` / `requireTenantMembership` / `createAuthHelpers` — เหมือนเดิมกับ `auth-supabase` ทุกอย่าง แต่ทำงานผ่าน `IdentityProvider` interface แทนการผูก Supabase client ตรงๆ
- ✅ Adapter 3 ตัว พิสูจน์ความ agnostic จริง: `createSupabaseAdapter` (migration path จาก auth-supabase), `createCredentialStoreAdapter` (ต่อกับ DB/JSON/memory แบบไหนก็ได้ผ่าน callback `verify()` ที่ host inject เอง), `createJwtAdapter` (verify token ผ่าน callback ที่ host inject เอง ไม่แตะ signing key)
- ✅ ห้าม: password hashing, JWT signing, env access — ทั้งหมดยังเป็นหน้าที่ host เหมือนเดิม (module นี้แก้แค่จุดที่ผูก Supabase เท่านั้น ไม่ได้กลายเป็น auth engine เต็มรูปแบบ)
- ✅ Unit + integration tests 30 ตัว (independently verified โดย Qwen QA agent, re-run เอง ไม่เชื่อรายงานของ Builder เฉยๆ), typecheck ผ่าน, agnosticism scan (grep หา env/SDK leak) ผ่าน
- ✅ MODULE.md + DESIGN.md + integration.example.ts (3 adapter flow) + VERSION 0.1.0

## Tenant Context

**Status:** ✅ Completed (Enterprise)
**Version:** 0.3.0
**บรีฟ:** ดู [briefs/](./briefs/)

> จัดการ context ของ tenant (multi-tenant) — host project ไม่ต้องเขียนซ้ำ

- ✅ createTenantContext / validateTenantContext / requireTenantContext
- ✅ Canonical tenantId rule, explicit context passing
- ✅ MODULE.md + integration.example.ts + VERSION 0.3.0

## Rate Limit

**Status:** ✅ Completed
**Version:** 0.1.0
**บรีฟ:** [rate-limit.md](./briefs/rate-limit.md)

> ป้องกัน API abuse โดย business logic ไม่ต้องรู้ implementation

- ✅ checkRateLimit({ key, limit, windowMs }) → { allowed, remaining, resetAt, retryAfterMs }
- ✅ RateLimitStore interface + Memory adapter (fixed window)
- ✅ RATE_LIMITED error + retryAfter (integrate Error Module)
- ✅ Declared limitation: NOT for distributed production
- ✅ Config inject จาก host — Core ไม่อ่าน env
- ✅ MODULE.md + integration.example.ts + VERSION 0.1.0
- ✅ Test + typecheck ผ่าน (36 tests)

## Feature Flags

**Status:** ✅ Completed
**Version:** 0.1.0
**บรีฟ:** [feature-flags.md](./briefs/feature-flags.md)

> เปิด/ปิด feature แบบ runtime โดยไม่ต้อง deploy

- ✅ Boolean Feature Flag contract — isEnabled / getFlag
- ✅ FeatureFlagContext (tenantId/userId/environment/attributes) + FeatureFlagResult
- ✅ FeatureFlagStore interface + Memory adapter
- ✅ Deterministic fallback (defaultValue, else false)
- ✅ Error model: FLAG_KEY_INVALID / FLAG_PROVIDER_ERROR / FLAG_VALUE_INVALID
- ✅ Boundary — Feature Flag ≠ Subscription Entitlement (no permission/billing logic)
- ✅ Security — no secret storage in flag values, no sensitive flag exposure to client
- ✅ Config inject จาก host — Core ไม่อ่าน env
- ✅ MODULE.md + integration.example.ts + VERSION 0.1.0
- ✅ Test + typecheck ผ่าน (130 tests)

---

# P2 — Advanced Infrastructure

## Job / Retry

**Status:** ✅ Completed (Enterprise)
**Version:** 0.3.0
**บรีฟ:** [module-10.md](./briefs/module-10.md)

> มาตรฐานสำหรับ background/retryable jobs

- ✅ DefaultJobRunner, calculateNextDelay + types
- ✅ RedisJobStorage + RedisLockProvider with atomic release and secure ownership tokens
- ✅ Job contract, attempt tracking, retry policy, exponential backoff, timeout
- ✅ MODULE.md + integration.example.ts + VERSION 0.3.0

## Scheduler

**Status:** ✅ Completed (Enterprise)
**Version:** 0.3.0
**บรีฟ:** ดู [briefs/](./briefs/)

> ระบบ scheduled/cron jobs แบบ generic

- ✅ MemorySchedulerEngine + types
- ✅ MODULE.md + integration.example.ts + VERSION 0.3.0

## Import / Export

**Status:** ✅ Completed (Enterprise)
**Version:** 0.2.0
**บรีฟ:** ดู [briefs/](./briefs/)

> มาตรฐานกลางสำหรับ import/export data

- ✅ StreamParser / StreamSerializer / StreamingParser / XLSXAdapter
- ✅ MODULE.md + integration.example.ts + VERSION 0.2.0

## Health Check

**Status:** ✅ Completed (Enterprise)
**Version:** 0.2.0
**บรีฟ:** ดู [briefs/](./briefs/)

> endpoint ตรวจสุขภาพของ service/module

- ✅ HealthCheckRegistry / SimpleMetricsCollector + types
- ✅ MODULE.md + integration.example.ts + VERSION 0.2.0

## AI Provider

**Status:** ✅ Completed (Enterprise)
**Version:** 0.3.0
**บรีฟ:** [module-11.md](./briefs/module-11.md)

> ให้ business logic เรียก AI ผ่าน contract กลาง โดยไม่ผูก provider

- ✅ AIProvider interface + OpenAIProvider / AnthropicProvider / GeminiProvider
- ✅ Core: generateText / generateStructured
- ✅ FallbackAIProvider with per-provider circuit breaker routing
- ✅ MODULE.md + integration.example.ts + VERSION 0.3.0

---

# P1 — Product Catalog Module (Registry #19)

## Product Catalog

**Status:** ✅ Completed (MVP Phase 0+1)
**Version:** 0.1.0
**บรีฟ:** [product-catalog/BRIEF.md](./product-catalog/BRIEF.md)

> โมดูลกลางจัดการสินค้าแบบ Reusable — เลือก Data Storage กับ Image Storage แยกกันได้ ไม่ผูก Provider

**Priority:** P1 · **Status:** ✅ Completed (MVP Phase 0 + 1 — Core + CSV Data + Local Image)

**MVP ที่ทำแล้ว (ตามบรีฟ Section 38):**
- ✅ Phase 0 — Core: domain models (Product/Variant/Brand/Category/ProductImage), ProductService, ProductRepository + MediaStorage interfaces, validators, errors (12 codes), config. NO provider SDK in core.
- ✅ Phase 1 — CSV Data Adapter (5-file layout, atomic write, file locking, .bak backup, UTF-8/Thai, header/schema/duplicate-SKU validation) + Local Image Adapter (path layout, sanitization, traversal protection, size/MIME validation) + CRUD + Brand/Category/Variant + Search/Filter/Pagination.
- ✅ NO hard delete as default (archive), ProductImage entity (no base64 array), custom attributes (string/number/boolean/date/enum/multi_enum), category hierarchy with circular-parent protection, SKU/slug unique rules, CatalogContext multi-tenant.
- ✅ Adapter Contract Tests ชุดเดียว (product-repository suite) — ทุก Storage Adapter ต้องผ่านชุดเดียวกัน
- ✅ MODULE.md + integration.example.ts + VERSION 0.1.0
- ✅ Test + typecheck ผ่าน (213 tests)

**Later Phases (ยังไม่ทำ — รอ use case จริง):** Phase 2 Import/Export · Phase 3 Supabase · Phase 4 Cloudflare R2 · Phase 5 Advanced (Postgres, S3, Supabase Storage, Custom API)

---

# P2 — AI Workflow Engine (Registry #20)

## AI Workflow Engine

**Status:** ✅ Completed
**Version:** 0.3.0
**บรีฟ:** [ai-workflow-engine-module-brief-v0.2.md](./ai-workflow-engine/ai-workflow-engine-module-brief-v0.2.md)

> Reusable workflow engine สำหรับ AI-driven automation — adaptive intent resolution + default adapters

- ✅ AdaptiveWorkflowRuntime (export เป็น AIWorkflowRuntime)
- ✅ Adaptive intent resolver + default adapters
- ✅ PersistentStateStore (Memory/Redis) added in v0.3.0
- ✅ Generic Memory/Redis state stores with structured errors
- ✅ MODULE.md + integration.example.ts + VERSION 0.3.0
- ✅ รวมเข้า Module Hub แล้ว ไม่มี Git repository ซ้อน

---

# P1 — Enterprise Features (Registry #21)

## Enterprise Features

**Status:** ✅ Completed
**Version:** 0.3.0

> ฟีเจอร์ระดับ Enterprise สำหรับความทนทานและการตรวจสอบได้ (Resiliency & Observability)

- ✅ Circuit Breaker pattern implementation
- ✅ Tracing contract with Noop/Memory adapters (no OpenTelemetry adapter yet)
- ✅ Ownership-safe Redis lock adapters for Job/Retry and Scheduler
- ✅ Resilient AI Provider (Fallback + Circuit Breaker)
- ✅ Middleware-agnostic Tenant Context Manager
- ✅ MODULE.md + VERSION 0.3.0

---

# P1 — LINE OA AI Module (Registry #22)

## LINE OA AI Module

**Status:** 🧪 Pilot / Testing
**Version:** 0.1.0
**บรีฟ:** (MODULE 22 — เขียนเสร็จโดย Manus AI, ตรวจสอบผ่านจริง 14 ส.ค. 2026)

> โมดูลสำเร็จรูปเชื่อมต่อ AI Chatbot + ระบบธุรกิจเข้ากับ LINE Official Account (LINE OA) — Decoupled, Pure Config Injection, Zero Environment Leakage

**Priority:** P1 · **Status:** 🧪 Pilot / Testing

**ที่ทำแล้ว:**
- ✅ Cryptographic webhook verification — HMAC-SHA256, timing-safe, `X-Line-Signature`
- ✅ Decoupled AI engine — `PromptBasedAiAdapter` + `RuleBasedAiAdapter` (keyword/intent fallback)
- ✅ Pluggable session storage — `SessionStore` interface + `MemorySessionStore` (auto TTL)
- ✅ Rich LINE messaging helper — Text / Quick Reply / Flex Message (bubble/carousel)
- ✅ Zero external runtime dependency — core ใช้ native `crypto` + `fetch`
- ✅ `createLineOaModule` factory + `LineOaWebhookHandler` unified pipeline
- ✅ State machine: IDLE / ORDERING / BOOKING / CONFIRMING / COMPLETED
- ✅ MODULE.md + integration.example.ts + package.json (version 0.1.0)
- ✅ `tsc --noEmit` ผ่าน (0 errors) + `vitest run` ผ่าน (20/20 tests)

**ยังต้องทำก่อนเป็น ✅ Completed:**
- [ ] ทดสอบ end-to-end กับ LINE Messaging API / OA sandbox จริง (ตอนนี้แค่ unit test ผ่าน — ยังไม่ e2e กับ LINE server)
- [ ] ลงทะเบียนใน `modules/REGISTRY.md` แล้ว (Module #22) — รอ pilot ผ่านแล้วอัปเดตเป็น ✅ Completed
- [ ] Persistent `SessionStore` reference implementation (แผนเต็มใน [DESIGN.md](./line-oa-ai-module/DESIGN.md) §persistent-session-store) — generic, ไม่ผูก backend ไหนเป็นการเฉพาะ, แยกจากของที่ปลายทางใดๆ implement เองแล้ว

---

# Dependency Map

ดู [99-dependency-map-and-sequence.md](./briefs/99-dependency-map-and-sequence.md)

# Recommended Development Sequence

ดู [99-dependency-map-and-sequence.md](./briefs/99-dependency-map-and-sequence.md)

# Global Definition of Done

ดู [99-dependency-map-and-sequence.md](./briefs/99-dependency-map-and-sequence.md)

# Module Registry

ดู [REGISTRY.md](./REGISTRY.md)

---

# Current Next Action

```
Notification ✅
        ↓
Config / Runtime ✅
        ↓
File Storage ✅
        ↓
Webhook Receiver ✅
        ↓
Audit Log ✅
        ↓
HTTP Client ✅
        ↓
Event Bus ✅
        ↓
Rate Limit ✅
        ↓
Feature Flags ✅
        ↓
Product Catalog (MVP) ✅
        ↓
Payment Core + Stripe ✅
        ↓
Subscription + Entitlement ✅
        ↓
Supabase Auth Helpers ✅
        ↓
Auth (Data/Login-Agnostic) ✅
        ↓
Tenant Context ✅
        ↓
Job / Retry ✅
        ↓
Scheduler ✅
        ↓
Import / Export ✅
        ↓
Health Check ✅
        ↓
AI Provider ✅
        ↓
AI Workflow Engine ✅
        ↓
Enterprise Features ✅
        ↓
LINE OA AI Module 🧪 (Pilot — รอ e2e กับ LINE จริง)
```

> ✅ ทุก Module ใน Registry (22 ตัว) — 21 ตัว Completed, 1 ตัว (LINE OA AI) อยู่ระหว่าง Pilot
> ตัวถัดไป (ถ้ามี): รอ use case จริงจากโปรเจกต์ pilot ก่อนเริ่ม module ใหม่
