import { AIErrorCode, AIProvider, AIRequest, AIResponse, StructuredAIRequest, OpenAIConfig as AnthropicConfig } from '../core/types';

export class AnthropicProvider implements AIProvider {
  private config: AnthropicConfig;

  constructor(config: AnthropicConfig) {
    if (!config || !config.apiKey) {
      throw new Error('CONFIG_MISSING: Anthropic apiKey is required');
    }
    this.config = config;
  }

  async generateText(request: AIRequest): Promise<AIResponse<string>> {
    const model = request.model || this.config.defaultModel || 'claude-3-5-sonnet-20241022';
    const baseUrl = this.config.baseUrl || 'https://api.anthropic.com/v1';
    const timeoutMs = request.timeoutMs || 30000;

    const payload: any = {
      model,
      max_tokens: request.maxOutputTokens || 1024,
      messages: [{ role: 'user', content: request.prompt }],
    };

    if (request.system) {
      payload.system = request.system;
    }

    if (request.temperature !== undefined) {
      payload.temperature = request.temperature;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.config.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return this.handleHttpError(response.status, await response.text(), model);
      }

      const data: any = await response.json();
      const text = data.content?.[0]?.text || '';
      const usage = data.usage
        ? {
            inputTokens: data.usage.input_tokens,
            outputTokens: data.usage.output_tokens,
          }
        : undefined;

      return {
        success: true,
        text,
        provider: 'anthropic',
        model,
        usage,
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        return {
          success: false,
          provider: 'anthropic',
          model,
          error: { code: 'TIMEOUT', message: `Request timed out after ${timeoutMs}ms` },
        };
      }
      return {
        success: false,
        provider: 'anthropic',
        model,
        error: { code: 'NETWORK_ERROR', message: err.message || 'Network request failed' },
      };
    }
  }

  async generateStructured<T>(request: StructuredAIRequest<T>): Promise<AIResponse<T>> {
    const model = request.model || this.config.defaultModel || 'claude-3-5-sonnet-20241022';
    const enhancedPrompt = `${request.prompt}\n\nRespond ONLY with valid JSON matching the required schema.`;

    const textResponse = await this.generateText({
      ...request,
      prompt: enhancedPrompt,
    });

    if (!textResponse.success || !textResponse.text) {
      return {
        success: false,
        provider: 'anthropic',
        model,
        error: textResponse.error || { code: 'PROVIDER_ERROR', message: 'Failed to generate text for structured output' },
      };
    }

    try {
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
          provider: 'anthropic',
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
        provider: 'anthropic',
        model,
        usage: textResponse.usage,
      };
    } catch (err: any) {
      return {
        success: false,
        provider: 'anthropic',
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
      provider: 'anthropic',
      model,
      error: {
        code,
        message: `Anthropic API error (${status}): ${errorBody}`,
      },
    };
  }
}
