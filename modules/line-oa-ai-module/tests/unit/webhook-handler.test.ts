import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { LineOaWebhookHandler } from '../../src/handlers/webhook-handler.js';
import { LineOaConfig } from '../../src/core/types.js';

describe('LINE OA Webhook Handler', () => {
  const config: LineOaConfig = {
    channelAccessToken: 'mock_access_token',
    channelSecret: 'mock_secret_key_123',
  };

  function sign(body: string, secret: string) {
    return createHmac('sha256', secret).update(Buffer.from(body, 'utf-8')).digest('base64');
  }

  beforeEach(() => {
    // Mock global fetch for LINE API calls
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
      text: async () => '',
    }) as any;
  });

  it('should reject requests with invalid signature without executing events', async () => {
    const handler = new LineOaWebhookHandler(config);
    const rawBody = JSON.stringify({ events: [] });
    const result = await handler.handleWebhook(rawBody, 'invalid_sig');

    expect(result.verification.isValid).toBe(false);
    expect(result.eventsProcessed.length).toBe(0);
  });

  it('should process text message event end-to-end and reply', async () => {
    const handler = new LineOaWebhookHandler(config);
    const payload = {
      events: [
        {
          type: 'message',
          replyToken: 'mock_reply_token_1',
          timestamp: Date.now(),
          source: { type: 'user', userId: 'user_test_1' },
          message: { id: 'msg_1', type: 'text', text: 'สวัสดีครับ' },
        },
      ],
    };

    const rawBody = JSON.stringify(payload);
    const signature = sign(rawBody, config.channelSecret);

    const result = await handler.handleWebhook(rawBody, signature);

    expect(result.verification.isValid).toBe(true);
    expect(result.eventsProcessed.length).toBe(1);
    expect(result.eventsProcessed[0].success).toBe(true);
    expect(result.eventsProcessed[0].replied).toBe(true);

    // Verify session recorded history
    const session = await handler.getStateManager().getSession('user_test_1');
    expect(session.history.length).toBe(2); // user msg + assistant reply
    expect(session.history[0].role).toBe('user');
    expect(session.history[1].role).toBe('assistant');
  });

  it('should trigger businessAdapter onIntent and onAction hooks', async () => {
    const onIntentMock = vi.fn();
    const onActionMock = vi.fn();

    const handler = new LineOaWebhookHandler(config, {
      businessAdapter: {
        onIntent: onIntentMock,
        onAction: onActionMock,
      },
    });

    const payload = {
      events: [
        {
          type: 'message',
          replyToken: 'mock_reply_token_2',
          timestamp: Date.now(),
          source: { type: 'user', userId: 'user_test_2' },
          message: { id: 'msg_2', type: 'text', text: 'จองห้องประชุม' },
        },
        {
          type: 'postback',
          timestamp: Date.now(),
          source: { type: 'user', userId: 'user_test_2' },
          postback: { data: 'CONFIRM_ROOM_A' },
        },
      ],
    };

    const rawBody = JSON.stringify(payload);
    const signature = sign(rawBody, config.channelSecret);

    const result = await handler.handleWebhook(rawBody, signature);

    expect(result.verification.isValid).toBe(true);
    expect(result.eventsProcessed.length).toBe(2);
    expect(onIntentMock).toHaveBeenCalledWith('BOOKING', expect.any(Object), expect.any(Object));
    expect(onActionMock).toHaveBeenCalledWith('CONFIRM_ROOM_A', expect.any(Object), expect.any(Object));
  });

  it('should skip group/room text messages by default (no AI reply, no session)', async () => {
    const handler = new LineOaWebhookHandler(config);
    const payload = {
      events: [
        {
          type: 'message',
          replyToken: 'mock_reply_token_group',
          timestamp: Date.now(),
          source: { type: 'group', groupId: 'group_test_1', userId: 'user_in_group_1' },
          message: { id: 'msg_group_1', type: 'text', text: 'สวัสดีครับ' },
        },
      ],
    };

    const rawBody = JSON.stringify(payload);
    const signature = sign(rawBody, config.channelSecret);

    const result = await handler.handleWebhook(rawBody, signature);

    expect(result.eventsProcessed[0].success).toBe(true);
    expect(result.eventsProcessed[0].replied).toBe(false);

    const session = await handler.getStateManager().getSession('user_in_group_1');
    expect(session.history.length).toBe(0);
  });

  it('should process group/room text messages when respondToGroups is enabled', async () => {
    const handler = new LineOaWebhookHandler(config, { respondToGroups: true });
    const payload = {
      events: [
        {
          type: 'message',
          replyToken: 'mock_reply_token_group_2',
          timestamp: Date.now(),
          source: { type: 'group', groupId: 'group_test_2', userId: 'user_in_group_2' },
          message: { id: 'msg_group_2', type: 'text', text: 'สวัสดีครับ' },
        },
      ],
    };

    const rawBody = JSON.stringify(payload);
    const signature = sign(rawBody, config.channelSecret);

    const result = await handler.handleWebhook(rawBody, signature);

    expect(result.eventsProcessed[0].replied).toBe(true);
    const session = await handler.getStateManager().getSession('user_in_group_2');
    expect(session.history.length).toBe(2);
  });

  it('should still process 1-1 user messages normally regardless of respondToGroups', async () => {
    const handlerDefault = new LineOaWebhookHandler(config);
    const handlerGroupsOn = new LineOaWebhookHandler(config, { respondToGroups: true });

    for (const [handler, userId] of [
      [handlerDefault, 'user_regression_1'],
      [handlerGroupsOn, 'user_regression_2'],
    ] as const) {
      const payload = {
        events: [
          {
            type: 'message',
            replyToken: `mock_reply_token_${userId}`,
            timestamp: Date.now(),
            source: { type: 'user', userId },
            message: { id: `msg_${userId}`, type: 'text', text: 'สวัสดีครับ' },
          },
        ],
      };
      const rawBody = JSON.stringify(payload);
      const signature = sign(rawBody, config.channelSecret);
      const result = await handler.handleWebhook(rawBody, signature);

      expect(result.eventsProcessed[0].replied).toBe(true);
    }
  });

  it('should handle follow event and send welcome message', async () => {
    const handler = new LineOaWebhookHandler(config);
    const payload = {
      events: [
        {
          type: 'follow',
          replyToken: 'mock_follow_token',
          timestamp: Date.now(),
          source: { type: 'user', userId: 'new_follower' },
        },
      ],
    };

    const rawBody = JSON.stringify(payload);
    const signature = sign(rawBody, config.channelSecret);

    const result = await handler.handleWebhook(rawBody, signature);

    expect(result.eventsProcessed[0].eventType).toBe('follow');
    expect(result.eventsProcessed[0].replied).toBe(true);
    expect(result.eventsProcessed[0].replyMessages?.[0].type).toBe('text');
  });
});
