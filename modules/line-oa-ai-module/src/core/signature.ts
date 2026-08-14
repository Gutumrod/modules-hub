import { createHmac, timingSafeEqual } from 'node:crypto';
import { WebhookVerificationResult } from './types.js';

/**
 * Validates the X-Line-Signature header against the raw body using HMAC-SHA256
 */
export function verifyLineSignature(
  rawBody: string | Buffer | Uint8Array,
  signature: string | null | undefined,
  channelSecret: string
): WebhookVerificationResult {
  if (!signature) {
    return { isValid: false, reason: 'Missing X-Line-Signature header' };
  }

  if (!channelSecret) {
    return { isValid: false, reason: 'Missing channelSecret in configuration' };
  }

  try {
    const bodyBuffer = typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf-8') : Buffer.from(rawBody);
    const expectedSignature = createHmac('sha256', channelSecret)
      .update(bodyBuffer)
      .digest('base64');

    const givenBuffer = Buffer.from(signature, 'utf-8');
    const expectedBuffer = Buffer.from(expectedSignature, 'utf-8');

    if (givenBuffer.length !== expectedBuffer.length) {
      return { isValid: false, reason: 'Invalid signature length' };
    }

    const isMatch = timingSafeEqual(givenBuffer, expectedBuffer);
    return isMatch
      ? { isValid: true }
      : { isValid: false, reason: 'Signature mismatch' };
  } catch (error: any) {
    return { isValid: false, reason: `Verification error: ${error?.message || 'Unknown error'}` };
  }
}
