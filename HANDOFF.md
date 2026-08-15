# Module Hub — Handoff (2026-08-15)

เซสชันนี้ครอบคลุม: วางแผนสินค้าจาก module hub, merge PR ค้าง, ตรวจความเข้มงวดทั้ง repo แบบ multi-agent relay

---

## 1. สินค้าที่วางแผนไว้ (10 ไอเดีย)

ก็อป module จริงไปตั้งต้นไว้แล้วที่ `D:/AI-Workspace/projects/saas-product-hub/0{1-9,10}-*/` แต่ละโฟลเดอร์มี `modules/` (ก็อปจริง ไม่มี node_modules) + `BRIEF.md` (ใส่ข้อเท็จจริง/ความเสี่ยงไว้แล้ว เหลือ TODO ให้ไล่คุยกันทีละหัวข้อ)

**เรียงพร้อมสุด → ต้องทำเพิ่ม:**
1. `01-bulk-etl-sync` ✅ — ยังไม่ได้เริ่มเขียนบรีฟเต็ม (คิวถัดไป)
2. `02-stripe-billing-backend` ✅
3. `03-headless-commerce-api` ✅
4. `04-compliance-audit-service` ✅ (notification แจ้งเตือนได้แค่ webhook)
5. `05-feature-flag-platform` ✅
6. `06-multi-tenant-ai-starter` ⚠️ ตัด enterprise-features tracing ออกจากสัญญาที่ให้ลูกค้า
7. `07-ai-resilience-gateway` ⚠️ ตอนนี้มี CircuitBreaker จริงแล้ว (มาจาก PR #3) — บรีฟเดิมเขียนไว้ว่าไม่มี ต้องอัปเดต
8. `08-content-autopilot` ⚠️ ai-workflow-engine เป็นแค่ orchestrator ต้องเขียน AI logic เอง
9. `09-it-ops-watchdog` ⚠️ เหมือนข้อ 8
10. `10-line-oa-ai-bot` ✅ — module เขียนเสร็จจริงแล้ว (tsc+vitest ผ่าน) ก็อปเข้าไปครบ

**Action ที่ยังไม่ได้ทำ:** #7 ต้องอัปเดต BRIEF.md เพราะ enterprise-features (CircuitBreaker) มีจริงแล้วหลัง merge PR #3 — ตอนเขียนบรีฟตอนนั้นยังไม่มี

---

## 2. Module Hub — สถานะ Git

- `main` merge ครบแล้ว: PR #3 (v0.3.0 Enterprise Upgrade) + PR #4 (LINE OA → renumber เป็น Module #22 เพื่อไม่ชนกับ Enterprise Features #21)
- แก้ conflict เอง 3 ไฟล์ (INDEX.md, REGISTRY.md, ROADMAP.md) ระหว่าง merge — ล้าง diagram ที่เพี้ยนด้วย
- **⚠️ พบระหว่างเขียน handoff นี้: มี commit ใหม่ 2 ตัวบน local `main` ที่ยังไม่ push** (`08fba46`, `43d1bfa`) — เพิ่ม **Module #23 `auth`** (data/login-agnostic auth, สร้างผ่าน 3-agent relay: AGY→Codex→Qwen) ไม่รู้ว่าใครสั่ง ไม่ได้อยู่ในบทสนทนานี้ — **โมดูลนี้ยังไม่ผ่านการตรวจเข้มที่ทำในข้อ 3** ต้องตรวจเพิ่มก่อนเชื่อถือ
- branch `feat/v0.3.0-enterprise-upgrade` และ `feat/register-line-oa-module-21` merge แล้วแต่ยังไม่ลบ (repo ตั้ง `delete_branch_on_merge: false`)
- ยังไม่ได้ `git push origin main` — มี commit ค้าง local รอ push (รวม auth module ที่ยังไม่ตรวจ)

---

## 3. ผลตรวจเข้มงวด 22 modules (ผ่าน Qwen relay, 2026-08-15)

รายงานเต็ม 3 ไฟล์: `D:/AI-Workspace/projects/modules-hub-audit-2026-08-15/report-group-{a,b,c}.md`

**ผิดกฎจริง 3 จุด — ยังไม่ได้แก้:**
1. `modules/tenant-context/tests/unit/enterprise-auth-tenant.test.ts:3` — import ข้ามไปที่ `auth-supabase` (ก็อป tenant-context เดี่ยวๆ test จะพัง)
2. `modules/job-retry/tests/unit/persistence.test.ts:3` — import ข้ามไปที่ `scheduler` (เหตุผลเดียวกัน)
3. `modules/payment/adapters/stripe-adapter.ts:195,196,250,267,304,366` — hardcode fallback `'THB'` + `example.com` (ผูก use case เฉพาะ ควร throw ถ้า host ไม่ inject config แทนการ default เงียบๆ)

**Housekeeping — ไฟล์ scratch ของ agent หลงเหลือ ยังไม่ได้ลบ:**
11 modules มีไฟล์ debris (`.codex-prompt.txt`, `.qwen-*`, `.agy-*`, `.claude-*`): file-storage, webhook-receiver, audit-log, http-client, event-bus, payment, auth-supabase, tenant-context, rate-limit, feature-flags, product-catalog
- `product-catalog` มีเพิ่ม: `coverage/` dir + ไฟล์ `modules - Shortcut.lnk` (Windows shortcut หลุดเข้ามา)
- `coverage/` ติด git อยู่ใน: config-runtime, event-bus, rate-limit, product-catalog

**สะอาดสมบูรณ์ (ไม่ต้องแตะ):** scheduler, subscription, import-export, health-check, ai-provider, ai-workflow-engine, enterprise-features, line-oa-ai-module, config-runtime, notification

**ยังไม่ตรวจ:** module #23 `auth` (เพิ่งเข้ามาหลังตรวจเสร็จ — ดูข้อ 2)

---

## 4. งานถัดไปที่แนะนำ (เรียงตามลำดับ)

1. ตรวจ module `auth` (#23) ด้วยเกณฑ์เดียวกับข้อ 3 — ยังไม่มีใครเช็ค
2. แก้ 3 จุดที่ผิดกฎจริง (ตัด cross-import 2 test file, แก้ payment ให้ throw แทน default THB/example.com)
3. ลบไฟล์ scratch ทั้งหมดใน 11 modules + `.lnk` ใน product-catalog + เพิ่ม `coverage/` เข้า `.gitignore` ให้ครบ (root มีอยู่แล้วแต่บาง module ติด git ไปก่อนหน้า ต้อง `git rm --cached`)
4. `git push origin main` (มี commit ค้างอยู่ รวม module auth)
5. ตัดสินใจเรื่องลบ branch ที่ merge แล้ว (`feat/v0.3.0-enterprise-upgrade`, `feat/register-line-oa-module-21`)
6. กลับไปเขียน BRIEF.md เต็มของ `01-bulk-etl-sync` ที่ saas-product-hub (ค้างจากข้อ 1) + อัปเดต `07-ai-resilience-gateway` ให้ตรงกับ enterprise-features ที่มีจริงแล้ว

---

## 5. บริบทสำคัญที่ควรรู้ก่อนทำงานต่อ

**เซสชันนี้เจอ external agent (Manus, AGY, Codex, Qwen) เขียนไฟล์เข้า repo นี้แบบไม่ประกาศล่วงหน้าซ้ำหลายรอบ** — ก่อนเชื่อสถานะไฟล์ใดๆ ใน modules-hub ให้เช็คของจริงด้วย `git log --oneline -5` และ `git status` ก่อนเสมอ อย่าเชื่อสรุปจากบทสนทนาเก่าเพียงอย่างเดียว (รวมถึง handoff ฉบับนี้ด้วย — เช็คซ้ำก่อนอ้างอิง)
