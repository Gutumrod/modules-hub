import { AiChatAdapter, AiProcessResult, LineMessage, LineWebhookEvent, UserSession } from '../core/types.js';

export interface PromptCompletionFn {
  (params: {
    systemPrompt?: string;
    userMessage: string;
    session: UserSession;
    history: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  }): Promise<{
    reply: string;
    nextState?: string;
    extractedData?: Record<string, any>;
    actionRequired?: string;
    quickReplies?: string[];
  }>;
}

/**
 * Standard AI Engine Adapter that delegates completions to a LLM provider or workflow runtime
 */
export class PromptBasedAiAdapter implements AiChatAdapter {
  private completionFn: PromptCompletionFn;
  private defaultSystemPrompt: string;

  constructor(completionFn: PromptCompletionFn, defaultSystemPrompt = 'You are a helpful LINE OA business assistant.') {
    this.completionFn = completionFn;
    this.defaultSystemPrompt = defaultSystemPrompt;
  }

  public async process(
    session: UserSession,
    userMessage: string,
    _event?: LineWebhookEvent
  ): Promise<AiProcessResult> {
    const result = await this.completionFn({
      systemPrompt: this.defaultSystemPrompt,
      userMessage,
      session,
      history: session.history,
    });

    const replyMessages: LineMessage[] = [];

    const textMsg: LineMessage = {
      type: 'text',
      text: result.reply,
    };

    if (result.quickReplies && result.quickReplies.length > 0) {
      textMsg.quickReply = {
        items: result.quickReplies.map((label) => ({
          type: 'action',
          action: {
            type: 'message',
            label: label.substring(0, 20),
            text: label,
          },
        })),
      };
    }

    replyMessages.push(textMsg);

    return {
      replyMessages,
      nextState: result.nextState || session.state,
      extractedData: result.extractedData,
      actionRequired: result.actionRequired,
    };
  }
}

/**
 * Rule-based / Intent-based fallback AI adapter
 */
export class RuleBasedAiAdapter implements AiChatAdapter {
  public async process(
    session: UserSession,
    userMessage: string
  ): Promise<AiProcessResult> {
    const normalized = userMessage.trim().toLowerCase();

    if (normalized.includes('จอง') || normalized.includes('booking')) {
      return {
        replyMessages: [
          {
            type: 'text',
            text: 'ยินดีให้บริการจองครับ กรุณาระบุวันที่และเวลาที่ต้องการ',
            quickReply: {
              items: [
                { type: 'action', action: { type: 'message', label: 'วันนี้', text: 'จองวันนี้' } },
                { type: 'action', action: { type: 'message', label: 'พรุ่งนี้', text: 'จองพรุ่งนี้' } },
                { type: 'action', action: { type: 'message', label: 'ยกเลิก', text: 'ยกเลิกการจอง' } },
              ],
            },
          },
        ],
        nextState: 'BOOKING',
        extractedData: { intent: 'BOOKING' },
      };
    }

    if (normalized.includes('ยกเลิก') || normalized.includes('cancel')) {
      return {
        replyMessages: [{ type: 'text', text: 'ดำเนินการยกเลิกรายการเรียบร้อยแล้วครับ หากต้องการเริ่มต้นใหม่พิมพ์สอบถามได้เลยครับ' }],
        nextState: 'IDLE',
        extractedData: { intent: 'CANCEL' },
      };
    }

    return {
      replyMessages: [
        {
          type: 'text',
          text: `ได้รับข้อความ "${userMessage}" เรียบร้อยแล้วครับ มีอะไรให้ผู้ช่วยดูแลเพิ่มเติมไหมครับ`,
        },
      ],
      nextState: session.state,
      extractedData: {},
    };
  }
}
