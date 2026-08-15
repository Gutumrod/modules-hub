export type ConversationState = string;

export interface ChatMessageHistory {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export interface UserSession {
  userId: string;
  state: ConversationState;
  contextData: Record<string, any>;
  history: ChatMessageHistory[];
  lastInteraction: number;
}

export interface SessionStore {
  get(userId: string): Promise<UserSession | null>;
  set(userId: string, session: UserSession, ttlMs?: number): Promise<void>;
  delete(userId: string): Promise<void>;
  clear?(): Promise<void>;
}

export interface LineOaConfig {
  channelAccessToken: string;
  channelSecret: string;
  sessionTtlMs?: number;
  systemPrompt?: string;
}

export type LineMessageType = 'text' | 'flex' | 'template' | 'image' | 'sticker';

export interface QuickReplyItem {
  type: 'action';
  action: {
    type: 'message' | 'postback' | 'uri' | 'datetimepicker';
    label: string;
    text?: string;
    data?: string;
    uri?: string;
  };
}

export interface QuickReply {
  items: QuickReplyItem[];
}

export interface TextLineMessage {
  type: 'text';
  text: string;
  quickReply?: QuickReply;
}

export interface FlexLineMessage {
  type: 'flex';
  altText: string;
  contents: Record<string, any>;
  quickReply?: QuickReply;
}

export type LineMessage = TextLineMessage | FlexLineMessage | { type: string; [key: string]: any };

export interface AiProcessResult {
  replyMessages: LineMessage[];
  nextState?: ConversationState;
  extractedData?: Record<string, any>;
  actionRequired?: string;
}

export interface AiChatAdapter {
  process(
    session: UserSession,
    userMessage: string,
    event?: LineWebhookEvent
  ): Promise<AiProcessResult>;
}

export interface BusinessAdapter {
  onIntent?(intent: string, data: Record<string, any>, session: UserSession): Promise<Record<string, any> | void>;
  onAction?(action: string, data: Record<string, any>, session: UserSession): Promise<Record<string, any> | void>;
}

export interface LineWebhookSource {
  type: 'user' | 'group' | 'room';
  userId?: string;
  groupId?: string;
  roomId?: string;
}

export interface LineWebhookEvent {
  type: 'message' | 'postback' | 'follow' | 'unfollow' | 'join' | 'leave';
  mode?: 'active' | 'standby';
  timestamp: number;
  source: LineWebhookSource;
  replyToken?: string;
  message?: {
    id: string;
    type: string;
    text?: string;
    [key: string]: any;
  };
  postback?: {
    data: string;
    params?: Record<string, any>;
  };
  [key: string]: any;
}

export interface LineWebhookPayload {
  destination?: string;
  events: LineWebhookEvent[];
}

export interface WebhookVerificationResult {
  isValid: boolean;
  reason?: string;
}