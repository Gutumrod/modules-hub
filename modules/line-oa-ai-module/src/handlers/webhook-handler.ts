import { verifyLineSignature } from '../core/signature.js';
import { StateManager } from '../core/state-manager.js';
import { LineMessagingClient, SendMessageResult } from '../adapters/line-client.js';
import { RuleBasedAiAdapter } from '../adapters/ai-engine.js';
import {
  AiChatAdapter,
  BusinessAdapter,
  LineMessage,
  LineOaConfig,
  LineWebhookEvent,
  LineWebhookPayload,
  SessionStore,
  WebhookVerificationResult,
} from '../core/types.js';

export interface WebhookHandlerOptions {
  stateStore?: SessionStore;
  aiAdapter?: AiChatAdapter;
  businessAdapter?: BusinessAdapter;
  sessionTtlMs?: number;
  autoReply?: boolean;
}

export interface ProcessedEventResult {
  eventType: string;
  userId?: string;
  success: boolean;
  replied: boolean;
  replyResult?: SendMessageResult;
  replyMessages?: LineMessage[];
  error?: string;
}

export interface WebhookExecutionResult {
  verification: WebhookVerificationResult;
  eventsProcessed: ProcessedEventResult[];
}

export class LineOaWebhookHandler {
  private config: LineOaConfig;
  private stateManager: StateManager;
  private aiAdapter: AiChatAdapter;
  private businessAdapter?: BusinessAdapter;
  private lineClient: LineMessagingClient;
  private autoReply: boolean;

  constructor(config: LineOaConfig, options?: WebhookHandlerOptions) {
    this.config = config;
    this.stateManager = new StateManager(options?.stateStore, options?.sessionTtlMs || config.sessionTtlMs);
    this.aiAdapter = options?.aiAdapter || new RuleBasedAiAdapter();
    this.businessAdapter = options?.businessAdapter;
    this.lineClient = new LineMessagingClient(config);
    this.autoReply = options?.autoReply !== false; // Default true
  }

  public getStateManager(): StateManager {
    return this.stateManager;
  }

  public getLineClient(): LineMessagingClient {
    return this.lineClient;
  }

  /**
   * Primary entry point to process raw HTTP webhook request
   */
  public async handleWebhook(
    rawBody: string | Buffer,
    signature: string | null | undefined
  ): Promise<WebhookExecutionResult> {
    const verification = verifyLineSignature(rawBody, signature, this.config.channelSecret);
    if (!verification.isValid) {
      return {
        verification,
        eventsProcessed: [],
      };
    }

    let payload: LineWebhookPayload;
    try {
      const bodyStr = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf-8');
      payload = JSON.parse(bodyStr);
    } catch (e: any) {
      return {
        verification: { isValid: false, reason: `Malformed JSON: ${e.message}` },
        eventsProcessed: [],
      };
    }

    const events = payload.events || [];
    const results: ProcessedEventResult[] = [];

    for (const event of events) {
      const res = await this.processSingleEvent(event);
      results.push(res);
    }

    return {
      verification: { isValid: true },
      eventsProcessed: results,
    };
  }

  /**
   * Process a single LINE event
   */
  public async processSingleEvent(event: LineWebhookEvent): Promise<ProcessedEventResult> {
    const userId = event.source?.userId;

    try {
      if (event.type === 'message' && event.message?.type === 'text') {
        return await this.handleTextMessage(event);
      }

      if (event.type === 'postback' && event.postback) {
        return await this.handlePostback(event);
      }

      if (event.type === 'follow') {
        return await this.handleFollow(event);
      }

      return {
        eventType: event.type,
        userId,
        success: true,
        replied: false,
      };
    } catch (err: any) {
      return {
        eventType: event.type,
        userId,
        success: false,
        replied: false,
        error: err?.message || 'Unknown processing error',
      };
    }
  }

  private async handleTextMessage(event: LineWebhookEvent): Promise<ProcessedEventResult> {
    const userId = event.source.userId || 'anonymous';
    const text = event.message?.text || '';
    const replyToken = event.replyToken;

    // 1. Get or create session
    const session = await this.stateManager.getSession(userId);

    // 2. Append user message to history
    await this.stateManager.appendHistory(userId, {
      role: 'user',
      content: text,
      timestamp: event.timestamp || Date.now(),
    });

    // 3. Process via AI Adapter
    const aiResult = await this.aiAdapter.process(session, text, event);

    // 4. Update state and context data
    if (aiResult.nextState) {
      await this.stateManager.updateState(userId, aiResult.nextState);
    }
    if (aiResult.extractedData) {
      await this.stateManager.updateContext(userId, aiResult.extractedData);
    }

    // 5. Trigger business hooks if intent / action returned
    if (this.businessAdapter && aiResult.extractedData?.intent) {
      await this.businessAdapter.onIntent?.(
        aiResult.extractedData.intent,
        aiResult.extractedData,
        session
      );
    }

    if (this.businessAdapter && aiResult.actionRequired) {
      await this.businessAdapter.onAction?.(
        aiResult.actionRequired,
        aiResult.extractedData || {},
        session
      );
    }

    // 6. Append assistant message to history
    const replyText = aiResult.replyMessages
      .filter((m) => m.type === 'text')
      .map((m: any) => m.text)
      .join('\n');

    if (replyText) {
      await this.stateManager.appendHistory(userId, {
        role: 'assistant',
        content: replyText,
        timestamp: Date.now(),
      });
    }

    // 7. Send reply if autoReply enabled & replyToken present
    let replyResult: SendMessageResult | undefined;
    let replied = false;

    if (this.autoReply && replyToken && aiResult.replyMessages.length > 0) {
      replyResult = await this.lineClient.replyMessage(replyToken, aiResult.replyMessages);
      replied = replyResult.success;
    }

    return {
      eventType: 'message',
      userId,
      success: true,
      replied,
      replyResult,
      replyMessages: aiResult.replyMessages,
    };
  }

  private async handlePostback(event: LineWebhookEvent): Promise<ProcessedEventResult> {
    const userId = event.source.userId || 'anonymous';
    const postbackData = event.postback?.data || '';
    const session = await this.stateManager.getSession(userId);

    let actionRes: any;
    if (this.businessAdapter?.onAction) {
      actionRes = await this.businessAdapter.onAction(postbackData, event.postback?.params || {}, session);
    }

    return {
      eventType: 'postback',
      userId,
      success: true,
      replied: false,
      replyMessages: actionRes?.replyMessages,
    };
  }

  private async handleFollow(event: LineWebhookEvent): Promise<ProcessedEventResult> {
    const userId = event.source.userId || 'anonymous';
    const replyToken = event.replyToken;

    const welcomeMsg: LineMessage = {
      type: 'text',
      text: 'สวัสดีครับ! ยินดีต้อนรับสู่ LINE Official Account มีอะไรให้ช่วยสอบถามได้เลยครับ 🎉',
    };

    let replyResult: SendMessageResult | undefined;
    let replied = false;

    if (this.autoReply && replyToken) {
      replyResult = await this.lineClient.replyMessage(replyToken, [welcomeMsg]);
      replied = replyResult.success;
    }

    return {
      eventType: 'follow',
      userId,
      success: true,
      replied,
      replyResult,
      replyMessages: [welcomeMsg],
    };
  }
}
