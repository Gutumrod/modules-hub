import { LineMessage, LineOaConfig } from '../core/types.js';

export interface SendMessageResult {
  success: boolean;
  statusCode?: number;
  error?: string;
  responseBody?: any;
}

export class LineMessagingClient {
  private channelAccessToken: string;
  private baseUrl: string;

  constructor(config: LineOaConfig, baseUrl = 'https://api.line.me/v2/bot/message') {
    this.channelAccessToken = config.channelAccessToken;
    this.baseUrl = baseUrl;
  }

  /**
   * Reply messages to a LINE user via replyToken
   */
  public async replyMessage(
    replyToken: string,
    messages: LineMessage[]
  ): Promise<SendMessageResult> {
    if (!replyToken) {
      return { success: false, error: 'Missing replyToken' };
    }
    if (!messages || messages.length === 0) {
      return { success: false, error: 'No messages to send' };
    }

    try {
      const response = await fetch(`${this.baseUrl}/reply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.channelAccessToken}`,
        },
        body: JSON.stringify({
          replyToken,
          messages,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          statusCode: response.status,
          error: `LINE API Reply Error (${response.status}): ${errorText}`,
        };
      }

      const responseBody = await response.json().catch(() => ({}));
      return { success: true, statusCode: response.status, responseBody };
    } catch (error: any) {
      return {
        success: false,
        error: `Network/Client Error: ${error?.message || 'Unknown error'}`,
      };
    }
  }

  /**
   * Push messages directly to a LINE user or group
   */
  public async pushMessage(
    to: string,
    messages: LineMessage[]
  ): Promise<SendMessageResult> {
    if (!to) {
      return { success: false, error: 'Missing target recipient (to)' };
    }
    if (!messages || messages.length === 0) {
      return { success: false, error: 'No messages to send' };
    }

    try {
      const response = await fetch(`${this.baseUrl}/push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.channelAccessToken}`,
        },
        body: JSON.stringify({
          to,
          messages,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          statusCode: response.status,
          error: `LINE API Push Error (${response.status}): ${errorText}`,
        };
      }

      const responseBody = await response.json().catch(() => ({}));
      return { success: true, statusCode: response.status, responseBody };
    } catch (error: any) {
      return {
        success: false,
        error: `Network/Client Error: ${error?.message || 'Unknown error'}`,
      };
    }
  }

  /**
   * Helper builder for standard Flex Message Bubble
   */
  public static createFlexBubble(
    altText: string,
    title: string,
    bodyText: string,
    actionButton?: { label: string; text: string }
  ): LineMessage {
    const bubbleContents: Record<string, any> = {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: title,
            weight: 'bold',
            size: 'xl',
            color: '#1DB446',
          },
          {
            type: 'text',
            text: bodyText,
            wrap: true,
            margin: 'md',
            color: '#333333',
          },
        ],
      },
    };

    if (actionButton) {
      bubbleContents.footer = {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: '#1DB446',
            action: {
              type: 'message',
              label: actionButton.label,
              text: actionButton.text,
            },
          },
        ],
      };
    }

    return {
      type: 'flex',
      altText,
      contents: bubbleContents,
    };
  }
}
