/**
 * modules/notification/core/types.ts
 * Core contract ของ Notification Module
 * ห้าม provider เฉพาะเจาะจง (LINE/Telegram/Email) หรือ host project รู้เรื่อง business logic ของกันและกัน
 */

export interface NotificationEvent {
  /** ชื่อ event แบบ dot-notation เช่น "booking.created", "ticket.updated" */
  type: string;
  /** ข้อมูลดิบของ event ปล่อยให้ปลายทางเป็นคน format เอง */
  payload: Record<string, unknown>;
  /** ผู้รับปลายทางแบบ generic ให้ provider/integration layer ตีความเอง */
  recipient?: string;
  /** forwarded เป็น header ให้ destination deduplicate ได้ — module ไม่ทำ dedup เอง */
  idempotencyKey?: string;
  /** timestamp ISO 8601 ของตอนที่ event เกิดขึ้นจริง (ไม่ใช่ตอนที่ยิง webhook) */
  occurredAt?: string;
}

export type NotificationErrorCode =
  | 'INVALID_EVENT'
  | 'INVALID_CONFIG'
  | 'SERIALIZATION_ERROR'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'REMOTE_4XX'
  | 'REMOTE_5XX'
  | 'UNKNOWN_ERROR';

export interface NotificationError {
  code: NotificationErrorCode;
  message: string;
  retryable: boolean;
}

export interface NotificationResult {
  ok: boolean;
  /** HTTP status code ที่ได้กลับมาจาก provider (ถ้ามี) */
  statusCode?: number;
  /** จำนวนครั้งที่ยิงจริง (รวม attempt แรก) */
  attempts: number;
  error?: NotificationError;
}

export interface NotificationProvider {
  send(event: NotificationEvent): Promise<NotificationResult>;
}

export interface NotificationConfig {
  provider: NotificationProvider;
}
