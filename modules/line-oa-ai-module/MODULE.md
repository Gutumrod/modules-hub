# AI-Driven LINE OA Module (`line-oa-ai-module`)

> โมดูลสำเร็จรูปสำหรับเชื่อมต่อ AI Chatbot และระบบธุรกิจเข้ากับ LINE Official Account (LINE OA) ตามมาตรฐาน Decoupled, Pure Config Injection, และ Zero Environment Leakage

---

## 1. คุณสมบัติเด่น (Key Features)

* 🛡️ **Cryptographic Webhook Verification:** ระบบตรวจสอบลายเซ็น `X-Line-Signature` ด้วย HMAC-SHA256 ป้องกันการโจมตีและการยิง Webhook ปลอม
* 🧠 **Decoupled AI Engine:** รองรับทั้ง `PromptBasedAiAdapter` (เชื่อมต่อ LLM / AI Provider / AI Workflow) และ `RuleBasedAiAdapter` (Keyword/Intent Fallback)
* 💾 **Pluggable Session Storage:** ระบบจัดการประวัติการสนทนา (Chat History) และ State ผู้ใช้ รองรับทั้ง `MemorySessionStore` และ `RedisSessionStore` พร้อม Auto TTL
* 💬 **Rich LINE Messaging Helper:** รองรับ Text, Quick Reply Buttons, และ Flex Message Bubbles / Carousels
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
3. **Session Expiration:** กำหนด `sessionTtlMs` ให้เหมาะสมเพื่อคืน Memory หรือใช้ Redis Storage Adapter เมื่อขยายระบบเป็น Multi-instance

---

## 5. การทดสอบ (Testing)

```bash
npm test         # รัน Automated Unit Tests ทั้งหมด (Vitest)
npm run typecheck # ตรวจสอบความถูกต้องของ Type ด้วย TypeScript Compiler
```
