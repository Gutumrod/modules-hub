export type AIRequest = {
  model?: string;
  system?: string;
  prompt: string;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
  metadata?: Record<string, unknown>;
};

export type StructuredAIRequest<T> = AIRequest & {
  schemaValidator: (data: unknown) => { success: boolean; data?: T; error?: string };
};

export type AIErrorCode =
  | 'RATE_LIMITED'
  | 'MODEL_NOT_FOUND'
  | 'INVALID_RESPONSE'
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'PROVIDER_ERROR';

export type AIResponse<T = unknown> = {
  success: boolean;
  text?: string;
  structured?: T;
  provider: string;
  model?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
  error?: {
    code: AIErrorCode;
    message: string;
  };
};

export interface AIProvider {
  generateText(request: AIRequest): Promise<AIResponse<string>>;
  generateStructured<T>(request: StructuredAIRequest<T>): Promise<AIResponse<T>>;
}

export type OpenAIConfig = {
  apiKey: string;
  baseUrl?: string;
  defaultModel?: string;
};
