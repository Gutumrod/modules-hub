import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyLineSignature } from '../../src/core/signature.js';

describe('LINE OA Signature Verification', () => {
  const channelSecret = 'test_channel_secret_12345';
  const samplePayload = JSON.stringify({
    destination: 'U1234567890',
    events: [
      {
        type: 'message',
        message: { type: 'text', text: 'Hello LINE' },
        timestamp: 1625000000000,
        source: { type: 'user', userId: 'Uuser1' },
      },
    ],
  });

  function generateSignature(body: string, secret: string): string {
    return createHmac('sha256', secret).update(Buffer.from(body, 'utf-8')).digest('base64');
  }

  it('should successfully verify a valid signature with string body', () => {
    const signature = generateSignature(samplePayload, channelSecret);
    const result = verifyLineSignature(samplePayload, signature, channelSecret);

    expect(result.isValid).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('should successfully verify a valid signature with Buffer body', () => {
    const buffer = Buffer.from(samplePayload, 'utf-8');
    const signature = generateSignature(samplePayload, channelSecret);
    const result = verifyLineSignature(buffer, signature, channelSecret);

    expect(result.isValid).toBe(true);
  });

  it('should reject when signature is missing or null', () => {
    const result = verifyLineSignature(samplePayload, null, channelSecret);
    expect(result.isValid).toBe(false);
    expect(result.reason).toContain('Missing X-Line-Signature');
  });

  it('should reject when channelSecret is empty', () => {
    const signature = generateSignature(samplePayload, channelSecret);
    const result = verifyLineSignature(samplePayload, signature, '');
    expect(result.isValid).toBe(false);
    expect(result.reason).toContain('Missing channelSecret');
  });

  it('should reject when signature does not match (tampered payload)', () => {
    const signature = generateSignature(samplePayload, channelSecret);
    const tamperedPayload = samplePayload + ' ';
    const result = verifyLineSignature(tamperedPayload, signature, channelSecret);

    expect(result.isValid).toBe(false);
    expect(result.reason).toContain('Signature mismatch');
  });

  it('should reject when signature is signed with a wrong secret', () => {
    const wrongSignature = generateSignature(samplePayload, 'wrong_secret');
    const result = verifyLineSignature(samplePayload, wrongSignature, channelSecret);

    expect(result.isValid).toBe(false);
  });
});
