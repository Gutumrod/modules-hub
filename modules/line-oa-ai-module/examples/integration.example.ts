/**
 * Integration Example: AI-Driven LINE Official Account Module
 * 
 * แสดงการนำ line-oa-ai-module ไปผสานร่วมกับ Web Server (Express / Next.js / Fastify)
 * และเชื่อมต่อกับ AI Engine เพื่อจัดการการสนทนาและ Action ทางธุรกิจ
 */

import {
  createLineOaModule,
  PromptBasedAiAdapter,
  LineMessagingClient,
  UserSession,
} from '../src/index.js';

// 1. กำหนด Configuration (Host Inject - ไม่อ่าน env ตรงใน module)
const config = {
  channelAccessToken: 'YOUR_LINE_CHANNEL_ACCESS_TOKEN',
  channelSecret: 'YOUR_LINE_CHANNEL_SECRET',
  sessionTtlMs: 1000 * 60 * 30, // 30 นาที
};

// 2. เสียบ AI Provider / LLM Callback (เช่น OpenAI / Claude / Gemini / AI Provider Module)
const aiAdapter = new PromptBasedAiAdapter(
  async ({ userMessage, session, history }) => {
    console.log(`[AI Engine] Processing for user: ${session.userId}, message: "${userMessage}"`);

    // จำลองการเรียก LLM เพื่อสกัด Intent และสร้างคำตอบ
    if (userMessage.includes('จอง')) {
      return {
        reply: 'รับทราบครับ ต้องการจองสำหรับกี่ท่านดีครับ?',
        nextState: 'BOOKING',
        extractedData: { intent: 'BOOKING' },
        quickReplies: ['1 ท่าน', '2 ท่าน', '4 ท่าน', 'มากกว่า 4 ท่าน'],
      };
    }

    return {
      reply: `ยินดีต้อนรับครับ คุณถามว่า "${userMessage}" มีข้อมูลใดให้ผมช่วยเพิ่มเติมไหมครับ`,
      quickReplies: ['สอบถามบริการ', 'ดูเมนู/สินค้า', 'ติดต่อเจ้าหน้าที่'],
    };
  },
  'You are a professional customer service assistant for LINE OA.'
);

// 3. กำหนด Business Adapter Hooks สำหรับจัดการ Database / Booking System
const businessAdapter = {
  async onIntent(intent: string, data: Record<string, any>, session: UserSession) {
    console.log(`[Business Hook] Intent Detected: ${intent} | User: ${session.userId}`, data);
  },
  async onAction(action: string, data: Record<string, any>, session: UserSession) {
    console.log(`[Business Hook] Action Triggered: ${action} | User: ${session.userId}`, data);
  },
};

// 4. สร้าง Instance ของ Module
const lineOaHandler = createLineOaModule(config, {
  aiAdapter,
  businessAdapter,
});

// 5. ตัวอย่างการรับ Webhook ใน Express Route Handler
/*
app.post('/api/webhook/line', async (req, res) => {
  const signature = req.headers['x-line-signature'] as string;
  const rawBody = req.body; // ต้องใช้ Raw Buffer หรือ String

  const result = await lineOaHandler.handleWebhook(rawBody, signature);

  if (!result.verification.isValid) {
    return res.status(401).json({ error: result.verification.reason });
  }

  return res.status(200).json({ status: 'OK', processed: result.eventsProcessed });
});
*/

// 6. ตัวอย่างการสร้าง Flex Message ส่งหาลูกค้า
const flexMessage = LineMessagingClient.createFlexBubble(
  'แจ้งเตือนสถานะการจอง',
  'ยืนยันการจองเรียบร้อย! 🎉',
  'หมายเลขการจอง #BK-9921\nโต๊ะ 4 ท่าน | เวลา 18:30 น.',
  { label: 'ดูรายละเอียด', text: 'ขอดูรายละเอียดการจอง' }
);

console.log('Flex Message payload generated successfully:', JSON.stringify(flexMessage, null, 2));
