/**
 * modules/notification/providers/webhook.ts
 * Generic Webhook Provider — v0.2.0 transport provider
 * ใช้ Web Crypto API (crypto.subtle) ล้วนๆ เพื่อให้รันได้ทั้ง Cloudflare Workers / Node 18+ / Supabase Edge Functions (Deno)
 * ห้ามใช้ node:crypto — ทำให้ portable ข้าม runtime ไม่ได้
 */

import type {
  NotificationEvent,
  NotificationProvider,
  NotificationResult,
} from '../core/types';

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_ATTEMPTS = 3;
const RESERVED_HEADERS = new Set(['content-type', 'x-signature', 'x-idempotency-key']);

export interface WebhookProviderConfig {
  url: string;
  secret?: string;
  /** ms ก่อน timeout การยิง request แต่ละครั้ง (default 5000) */
  timeoutMs?: number;
  /** จำนวนครั้งที่ยิงสูงสุดเมื่อ network fail หรือ 5xx/429 (default 3) */
  maxAttempts?: number;
  /** header เพิ่มเติมจาก host project เช่น Authorization หรือ X-API-Key */
  headers?: Record<string, string>;
  /** อนุญาต http: สำหรับ local dev เท่านั้น (default false) */
  allowInsecureHttp?: boolean;
}

export class WebhookProvider implements NotificationProvider {
  private readonly url: string;
  private readonly secret?: string;
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;
  private readonly headers: Record<string, string>;

  constructor(config: WebhookProviderConfig) {
    if (!config.url || config.url.trim().length === 0) {
      throw new Error('INVALID_CONFIG: WebhookProviderConfig.url is required');
    }

    const parsedUrl = parseWebhookUrl(config.url);
    if (parsedUrl.protocol !== 'https:' && config.allowInsecureHttp !== true) {
      throw new Error('INVALID_CONFIG: WebhookProviderConfig.url must use https: unless allowInsecureHttp is true');
    }

    this.assertAllowedHeaders(config.headers);

    this.url = parsedUrl.toString();
    this.secret = config.secret;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxAttempts = config.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.headers = config.headers ?? {};
  }

  async send(event: NotificationEvent): Promise<NotificationResult> {
    let body: string;
    try {
      body = JSON.stringify(event);
    } catch (err) {
      return {
        ok: false,
        attempts: 0,
        error: {
          code: 'SERIALIZATION_ERROR',
          message: err instanceof Error ? err.message : String(err),
          retryable: false,
        },
      };
    }

    const signature = this.secret ? await this.sign(body) : undefined;

    let lastError: NotificationResult['error'];

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const headers = {
          'Content-Type': 'application/json',
          ...this.headers,
          ...(signature ? { 'X-Signature': signature } : {}),
          ...(event.idempotencyKey ? { 'X-Idempotency-Key': event.idempotencyKey } : {}),
        };

        const res = await fetch(this.url, {
          method: 'POST',
          headers,
          body,
          signal: controller.signal,
        });

        if (res.ok) {
          return { ok: true, statusCode: res.status, attempts: attempt };
        }

        // 4xx (ยกเว้น 429 rate-limit) = client error, retry ไปก็พังเหมือนเดิม ไม่ต้องเสียเวลา
        if (res.status >= 400 && res.status < 500 && res.status !== 429) {
          return {
            ok: false,
            statusCode: res.status,
            attempts: attempt,
            error: {
              code: 'REMOTE_4XX',
              message: `webhook rejected: ${res.status}`,
              retryable: false,
            },
          };
        }

        lastError = {
          code: res.status === 429 ? 'RATE_LIMITED' : 'REMOTE_5XX',
          message: `webhook returned ${res.status}`,
          retryable: true,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        lastError = {
          code: err instanceof DOMException && err.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR',
          message,
          retryable: true,
        };
      } finally {
        clearTimeout(timer);
      }

      if (attempt < this.maxAttempts) {
        await sleep(backoffMs(attempt));
      }
    }

    return {
      ok: false,
      attempts: this.maxAttempts,
      error: lastError ?? {
        code: 'UNKNOWN_ERROR',
        message: 'webhook failed without an error message',
        retryable: true,
      },
    };
  }

  private async sign(body: string): Promise<string> {
    if (!this.secret) {
      throw new Error('INVALID_CONFIG: WebhookProviderConfig.secret is required for signing');
    }

    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(this.secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const sigBuffer = await crypto.subtle.sign('HMAC', key, enc.encode(body));
    return bufferToHex(sigBuffer);
  }

  private assertAllowedHeaders(headers?: Record<string, string>): void {
    for (const headerName of Object.keys(headers ?? {})) {
      if (RESERVED_HEADERS.has(headerName.toLowerCase())) {
        throw new Error(`INVALID_CONFIG: custom header "${headerName}" is reserved`);
      }
    }
  }
}

function parseWebhookUrl(url: string): URL {
  try {
    return new URL(url);
  } catch {
    throw new Error('INVALID_CONFIG: WebhookProviderConfig.url must be a valid URL');
  }
}

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function backoffMs(attempt: number): number {
  // exponential backoff: 500ms, 1000ms, 2000ms...
  return 500 * 2 ** (attempt - 1);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
