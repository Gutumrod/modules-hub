/**
 * modules/notification/core/client.ts
 * Entry point ของ module — host project เรียก createNotifier(config) แล้วได้ client กลับมาใช้
 * ห้าม module อ่าน env/process.env/globalThis เอง — ทุก config ต้องมาจากพารามิเตอร์นี้เท่านั้น
 */

import type {
  NotificationConfig,
  NotificationEvent,
  NotificationResult,
  NotificationProvider,
} from './types';

export class NotificationClient {
  constructor(private readonly provider: NotificationProvider) {}

  async notify(event: NotificationEvent): Promise<NotificationResult> {
    const validationError = validateEvent(event);
    if (validationError) {
      return {
        ok: false,
        attempts: 0,
        error: {
          code: 'INVALID_EVENT',
          message: validationError,
          retryable: false,
        },
      };
    }

    return this.provider.send(event);
  }
}

/**
 * Factory — host project เป็นคนดึง secret จาก env ของตัวเอง (Worker Secrets/Bindings, .dev.vars ฯลฯ)
 * แล้ว map เป็น NotificationConfig ก่อนส่งเข้ามาตรงนี้
 */
export function createNotifier(config: NotificationConfig): NotificationClient {
  return new NotificationClient(config.provider);
}

function validateEvent(event: NotificationEvent): string | undefined {
  if (!event || typeof event !== 'object') {
    return 'event must be an object';
  }

  if (typeof event.type !== 'string' || event.type.trim() === '') {
    return 'event.type must be a non-empty string';
  }

  if (!isPlainObject(event.payload)) {
    return 'event.payload must be an object';
  }

  if (!isJsonSerializable(event.payload)) {
    return 'event.payload must be JSON-serializable';
  }

  if (event.idempotencyKey !== undefined) {
    if (typeof event.idempotencyKey !== 'string' || event.idempotencyKey.trim() === '') {
      return 'event.idempotencyKey must be a non-empty string';
    }
  }

  if (event.occurredAt !== undefined) {
    if (typeof event.occurredAt !== 'string' || !isValidIsoDate(event.occurredAt)) {
      return 'event.occurredAt must be a valid ISO date';
    }
  }

  return undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isJsonSerializable(value: unknown): boolean {
  try {
    JSON.stringify(value);
    return true;
  } catch {
    return false;
  }
}

function isValidIsoDate(value: string): boolean {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return false;
  }

  return new Date(timestamp).toISOString() === value;
}
