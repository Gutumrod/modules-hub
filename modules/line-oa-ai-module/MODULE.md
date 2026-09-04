# AI-Driven LINE OA Module (`line-oa-ai-module`)

**Version:** 0.1.0
**Status:** 🧪 Pilot / Testing
**Documentation Authority:** Current version/status follow `../REGISTRY.md`; this document describes the module contract/design for that registered version.

> โมดูลสำเร็จรูปสำหรับเชื่อมต่อ AI Chatbot และระบบธุรกิจเข้ากับ LINE Official Account (LINE OA) ตามมาตรฐาน Decoupled, Pure Config Injection, และ Zero Environment Leakage


---

## 1. คุณสมบัติเด่น (Key Features)

* 🛡️ **Cryptographic Webhook Verification:** ระบบตรวจสอบลายเซ็น `X-Line-Signature` ด้วย HMAC-SHA256 ป้องกันการโจมตีและการยิง Webhook ปลอม
* 🧠 **Decoupled AI Engine:** รองรับทั้ง `PromptBasedAiAdapter` (เชื่อมต่อ LLM / AI Provider / AI Workflow) และ `RuleBasedAiAdapter` (Keyword/Intent Fallback)
* 💾 **Pluggable Session Storage:** ระบบจัดการประวัติการสนทนา (Chat History) และ State ผู้ใช้ ผ่าน `SessionStore` interface (get/set/delete/clear) พร้อม Auto TTL — มาพร้อม `MemorySessionStore` ในตัว, backend อื่น (Postgres/Redis/ฯลฯ) implement เพิ่มเองได้โดยไม่ต้องแก้ core (ดูแผนใน [DESIGN.md](./DESIGN.md) §persistent-session-store)
* 💬 **Rich LINE Messaging Helper:** รองรับ Text, Quick Reply Buttons, และ Flex Message Bubbles / Carousels
* 🚫 **Group/Room Filtering:** ไม่ตอบข้อความจาก group/room chat โดยอัตโนมัติ (`event.source.type !== 'user'`) — เปิดกลับได้ผ่าน `respondToGroups: true` ถ้า host ต้องการให้บอทตอบในกลุ่มด้วย
* ⚡ **Zero External Runtime Dependency:** โค้ด Core ใช้ Native Web/Node API (`crypto`, `fetch`) ทำงานได้รวดเร็ว เบา และปลอดภัย

---

## 2. โครงสร้างโฟลเดอร์ (Folder Structure)

```
line-oa-ai-module/
├── src/
│   ├── index.ts                     # Main Entry Point & Factory
│   ├── core/
│   │   ├── types.ts                 # Contracts, Interfaces & Type Definitions
│   │   ├── signature.ts             # HMAC-SHA256 Timing-Safe Webhook Verifier
│   │   └── state-manager.ts         # User Session, Context & Chat History Manager
│   ├── adapters/
│   │   ├── ai-engine.ts             # Prompt & Rule-based AI Engine Adapters
│   │   └── line-client.ts           # Fetch-based Reply/Push Messaging Client & Flex Builder
│   └── handlers/
│       └── webhook-handler.ts       # Unified Webhook Pipeline & Event Dispatcher
├── tests/
│   └── unit/                        # 100% Vitest Automated Test Suites
├── examples/
│   └── integration.example.ts       # Code Example for Express / Next.js
├── package.json
├── tsconfig.json
└── MODULE.md
```

---

## 3. วิธีการนำไปใช้งาน (Quick Start)

### 3.1. ติดตั้งและการ Import
คัดลอกโฟลเดอร์ `line-oa-ai-module` ไปยังโฟลเดอร์โมดูลของโปรเจกต์ปลายทาง (เช่น `src/modules/line-oa/`):

```typescript
import {
  createLineOaModule,
  PromptBasedAiAdapter,
  LineMessagingClient
} from './modules/line-oa/src/index.js';

// 1. กำหนด Configuration ผ่าน Injection (ห้ามอ่าน env ใน module)
const lineModule = createLineOaModule({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN!,
  channelSecret: process.env.LINE_CHANNEL_SECRET!,
  sessionTtlMs: 1000 * 60 * 30, // 30 นาที
}, {
  aiAdapter: new PromptBasedAiAdapter(async ({ userMessage, session, history }) => {
    // ต่อเชื่อมกับ OpenAI / Anthropic / Gemini หรือ AI Provider Module
    return {
      reply: `ได้รับข้อความ: ${userMessage}`,
      quickReplies: ['สอบถามบริการ', 'ดูเมนู', 'จองโต๊ะ'],
    };
  }),
  businessAdapter: {
    async onIntent(intent, data, session) {
      console.log('Detected Intent:', intent, data);
    }
  }
});
```

### 3.2. เชื่อมต่อ Webhook Route (Express / Next.js)

```typescript
// Express Route
app.post('/webhook/line', async (req, res) => {
  const signature = req.headers['x-line-signature'] as string;
  const rawBody = req.body; // Raw body Buffer หรือ string

  const result = await lineModule.handleWebhook(rawBody, signature);

  if (!result.verification.isValid) {
    return res.status(401).json({ error: result.verification.reason });
  }

  return res.status(200).json({ status: 'OK', processed: result.eventsProcessed });
});
```

---

## 4. มาตรฐานความปลอดภัย (Security & Best Practices)

1. **ห้ามปิด Signature Verification ใน Production:** ตรวจสอบ `X-Line-Signature` ทุกครั้งก่อนประมวลผลข้อความ
2. **ใช้ Raw Body ในการ Verify:** ต้องส่ง Body ดิบ (Unparsed Buffer/String) เข้าฟังก์ชัน `handleWebhook` เพื่อให้ผล Hash ถูกต้อง
3. **Session Expiration:** กำหนด `sessionTtlMs` ให้เหมาะสมเพื่อคืน Memory หรือ implement `SessionStore` ด้วย backend ที่ persist ได้เองเมื่อขยายระบบเป็น Multi-instance (ดูแผนใน [DESIGN.md](./DESIGN.md))

---

## 5. การทดสอบ (Testing)

```bash
npm test         # รัน Automated Unit Tests ทั้งหมด (Vitest)
npm run typecheck # ตรวจสอบความถูกต้องของ Type ด้วย TypeScript Compiler
```

---

## 6. Production Validation

โมดูลนี้ถูกใช้งานจริงใน production project แรก (2026-08): LINE OA ของร้านอะไหล่/แต่งมอเตอร์ไซค์ (KMO), live ตั้งแต่ 2026-08-15, รองรับลูกค้าจริงทุกวัน — สนับสนุน checklist Pilot→Stable ใน `modules/briefs/99-dependency-map-and-sequence.md`

**บั๊กที่เจอจากการใช้งานจริงและแก้แล้วในโมดูลนี้:**
- `processSingleEvent()` เดิมไม่เช็ค `event.source.type` — บอทตอบข้อความในกลุ่ม LINE ที่ OA ถูกเชิญเข้าไป (เช่น กลุ่มอัปเดตงานภายในของร้าน) เหมือนเป็นแชทลูกค้า 1-1 ทั้งที่ไม่ควร แก้ด้วย config option `respondToGroups` (default `false`) — ดูข้อ 1

**Known limitations (ยังไม่ทำในรอบนี้):**
- **Core module มี `SessionStore` implementation เดียวคือ `MemorySessionStore`** (เก็บใน memory ของ process เดียว — restart แล้วข้อมูลหาย, scale เป็นหลาย instance ไม่ได้) — เดิม MODULE.md เคยเขียนว่ามี `RedisSessionStore` มาด้วย ไม่จริง แก้ข้อความแล้ว (2026-08-20) ดูแผนปรับปรุงใน [DESIGN.md](./DESIGN.md)
- ยังไม่มี end-to-end test กับ LINE Messaging API / OA sandbox จริง ตามที่ระบุไว้ใน `modules/ROADMAP.md` (Registry #22) — มีแค่ unit test + production usage เป็นหลักฐาน
- `StateManager.appendHistory` ไม่ได้บังคับ cap จำนวนข้อความในตัวโมดูลเอง (`maxHistory` เป็น parameter ที่ host กำหนดเอง) — โปรเจกต์จริงที่ใช้อยู่ตั้งค่าไว้ที่ 40 ไม่ใช่ default 20 เพื่อให้ AI จำบทสนทนาลูกค้าที่คุยยาวได้นานขึ้น
