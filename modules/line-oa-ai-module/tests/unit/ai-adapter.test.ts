import { describe, it, expect } from 'vitest';
import { PromptBasedAiAdapter, RuleBasedAiAdapter } from '../../src/adapters/ai-engine.js';
import { UserSession } from '../../src/core/types.js';

describe('LINE OA AI Engine Adapters', () => {
  const dummySession: UserSession = {
    userId: 'u_123',
    state: 'IDLE',
    contextData: {},
    history: [],
    lastInteraction: Date.now(),
  };

  describe('RuleBasedAiAdapter', () => {
    const adapter = new RuleBasedAiAdapter();

    it('should detect booking intent and propose quick replies', async () => {
      const res = await adapter.process(dummySession, 'ต้องการจองโต๊ะ 2 ที่');
      expect(res.nextState).toBe('BOOKING');
      expect(res.extractedData?.intent).toBe('BOOKING');
      expect(res.replyMessages[0].type).toBe('text');
      expect((res.replyMessages[0] as any).quickReply?.items.length).toBeGreaterThan(0);
    });

    it('should detect cancel intent and reset state', async () => {
      const res = await adapter.process({ ...dummySession, state: 'BOOKING' }, 'ขอยกเลิก');
      expect(res.nextState).toBe('IDLE');
      expect(res.extractedData?.intent).toBe('CANCEL');
    });

    it('should handle general messages with polite response', async () => {
      const res = await adapter.process(dummySession, 'เปิดกี่โมงครับ');
      expect(res.nextState).toBe('IDLE');
      expect((res.replyMessages[0] as any).text).toContain('เปิดกี่โมงครับ');
    });
  });

  describe('PromptBasedAiAdapter', () => {
    it('should delegate completions to custom completion function', async () => {
      const mockCompletion = async ({ userMessage }: { userMessage: string }) => {
        return {
          reply: `AI says: ${userMessage}`,
          nextState: 'CONFIRMED',
          extractedData: { confidence: 0.95 },
          quickReplies: ['ตกลง', 'แก้ไข'],
        };
      };

      const adapter = new PromptBasedAiAdapter(mockCompletion, 'Custom System Prompt');
      const res = await adapter.process(dummySession, 'สั่งอาหาร');

      expect(res.nextState).toBe('CONFIRMED');
      expect(res.extractedData?.confidence).toBe(0.95);
      expect((res.replyMessages[0] as any).text).toBe('AI says: สั่งอาหาร');
      expect((res.replyMessages[0] as any).quickReply?.items.length).toBe(2);
      expect((res.replyMessages[0] as any).quickReply?.items[0].action.label).toBe('ตกลง');
    });
  });
});
