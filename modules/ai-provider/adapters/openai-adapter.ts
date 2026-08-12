import { AIErrorCode, AIProvider, AIRequest, AIResponse, OpenAIConfig, StructuredAIRequest } from '../core/types';

export class OpenAIProvider implements AIProvider {
  private config: OpenAIConfig;

  constructor(config: OpenAIConfig) {
    if (!config || !config.apiKey) {
      throw new Error('CONFIG_MISSING: OpenAI apiKey is required');
    }
    this.config = config;
  }

  async generateText(request: AIRequest): Promise<AIResponse<string>> {
    const model = request.model || this.config.defaultModel || 'gpt-4o-mini';
    const baseUrl = this.config.baseUrl || 'https://api.openai.com/v1';
    const timeoutMs = request.timeoutMs || 30000;

    const messages: Array<{ role: string; content: string }> = [];
    if (request.system) {
      messages.push({ role: 'system', content: request.system });
    }
    messages.push({ role: 'user', content: request.prompt });

    const payload = {
      model,
      messages,
      temperature: request.temperature,
      max_tokens: request.maxOutputTokens,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return this.handleHttpError(response.status, await response.text(), model);
      }

      const data: any = await response.json();
      const text = data.choices?.[0]?.message?.content || '';
      const usage = data.usage
        ? {
            inputTokens: data.usage.prompt_tokens,
            outputTokens: data.usage.completion_tokens,
          }
        : undefined;

      return {
        success: true,
        text,
        provider: 'openai',
        model,
        usage,
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        return {
          success: false,
          provider: 'openai',
          model,
          error: { code: 'TIMEOUT', message: `Request timed out after ${timeoutMs}ms` },
        };
      }
      return {
        success: false,
        provider: 'openai',
        model,
        error: { code: 'NETWORK_ERROR', message: err.message || 'Network request failed' },
      };
    }
  }

  async generateStructured<T>(request: StructuredAIRequest<T>): Promise<AIResponse<T>> {
    const model = request.model || this.config.defaultModel || 'gpt-4o-mini';
    const enhancedPrompt = `${request.prompt}\n\nRespond ONLY with valid JSON matching the required schema.`;

    const textResponse = await this.generateText({
      ...request,
      prompt: enhancedPrompt,
    });

    if (!textResponse.success || !textResponse.text) {
      return {
        success: false,
        provider: 'openai',
        model,
        error: textResponse.error || { code: 'PROVIDER_ERROR', message: 'Failed to generate text for structured output' },
      };
    }

    try {
      // Clean potential markdown fences
      let cleaned = textResponse.text.trim();
      if (cleaned.startsWith('```json')) {
        cleaned = cleaned.slice(7);
      } else if (cleaned.startsWith('```')) {
        cleaned = cleaned.slice(3);
      }
      if (cleaned.endsWith('```')) {
        cleaned = cleaned.slice(0, -3);
      }
      cleaned = cleaned.trim();

      const parsedJson = JSON.parse(cleaned);
      const validation = request.schemaValidator(parsedJson);

      if (!validation.success || validation.data === undefined) {
        return {
          success: false,
          provider: 'openai',
          model,
          usage: textResponse.usage,
          error: {
            code: 'INVALID_RESPONSE',
            message: `Schema validation failed: ${validation.error || 'Unknown validation error'}`,
          },
        };
      }

      return {
        success: true,
        structured: validation.data,
        provider: 'openai',
        model,
        usage: textResponse.usage,
      };
    } catch (err: any) {
      return {
        success: false,
        provider: 'openai',
        model,
        usage: textResponse.usage,
        error: {
          code: 'INVALID_RESPONSE',
          message: `Failed to parse JSON response: ${err.message}`,
        },
      };
    }
  }

  private handleHttpError(status: number, errorBody: string, model: string): AIResponse<any> {
    let code: AIErrorCode = 'PROVIDER_ERROR';
    if (status === 429) code = 'RATE_LIMITED';
    else if (status === 404) code = 'MODEL_NOT_FOUND';

    return {
      success: false,
      provider: 'openai',
      model,
      error: {
        code,
        message: `OpenAI API error (${status}): ${errorBody}`,
      },
    };
  }
}
