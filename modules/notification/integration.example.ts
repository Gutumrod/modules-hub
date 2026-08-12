/**
 * modules/notification/integration.example.ts
 * Generic Cloudflare Worker Host Example — เป็น reference ตอน integrate เข้าโปรเจกต์จริงเท่านั้น
 * ห้าม copy ทั้งไฟล์ลง production ตรงๆ
 */

import { createNotifier } from './core/client';
import { WebhookProvider, type WebhookProviderConfig } from './providers/webhook';

// ตัวอย่าง Worker env bindings — ประกาศจริงใน wrangler.toml + ตั้งค่าด้วย `wrangler secret put`
interface Env {
  NOTIFICATION_WEBHOOK_URL: string;
  NOTIFICATION_WEBHOOK_SECRET?: string;
  NOTIFY_TIMEOUT_MS?: string;
  NOTIFY_MAX_ATTEMPTS?: string;
}

function buildWebhookProviderConfig(env: Env): WebhookProviderConfig {
  const config: WebhookProviderConfig = {
    url: env.NOTIFICATION_WEBHOOK_URL,
    timeoutMs: env.NOTIFY_TIMEOUT_MS ? Number(env.NOTIFY_TIMEOUT_MS) : undefined,
    maxAttempts: env.NOTIFY_MAX_ATTEMPTS ? Number(env.NOTIFY_MAX_ATTEMPTS) : undefined,
  };

  if (env.NOTIFICATION_WEBHOOK_SECRET) {
    config.secret = env.NOTIFICATION_WEBHOOK_SECRET;
  }

  return config;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const provider = new WebhookProvider(buildWebhookProviderConfig(env));
    const notifier = createNotifier({ provider });

    // ตัวอย่าง: booking ถูกสร้าง แล้วยิง event เข้า notification module
    const result = await notifier.notify({
      type: 'booking.created',
      payload: {
        bookingId: 'bk_123',
        shopId: 'kmo',
        customerName: 'ลูกค้า A',
      },
      idempotencyKey: 'booking-created-bk_123',
      occurredAt: new Date().toISOString(),
    });

    if (!result.ok) {
      // TODO: host project ต้องต่อ proper logging เอง — module แค่ return result กลับมาให้ตัดสินใจ
    }

    return new Response(JSON.stringify(result), {
      status: result.ok ? 200 : 502,
      headers: { 'Content-Type': 'application/json' },
    });
  },
};
