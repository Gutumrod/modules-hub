import { AIErrorCode, AIProvider, AIRequest, AIResponse, StructuredAIRequest, OpenAIConfig as GeminiConfig } from '../core/types';

export class GeminiProvider implements AIProvider {
  private config: GeminiConfig;

  constructor(config: GeminiConfig) {
    if (!config || !config.apiKey) {
      throw new Error('CONFIG_MISSING: Gemini apiKey is required');
    }
    this.config = config;
  }

  async generateText(request: AIRequest): Promise<AIResponse<string>> {
    const model = request.model || this.config.defaultModel || 'gemini-1.5-flash';
    const baseUrl = this.config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
    const timeoutMs = request.timeoutMs || 30000;

    const contents: any[] = [];
    if (request.system) {
      contents.push({ role: 'user', parts: [{ text: `System Instruction: ${request.system}` }] });
    }
    contents.push({ role: 'user', parts: [{ text: request.prompt }] });

    const payload = {
      contents,
      generationConfig: {
        temperature: request.temperature,
        maxOutputTokens: request.maxOutputTokens,
      },
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${baseUrl}/models/${model}:generateContent?key=${this.config.apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return this.handleHttpError(response.status, await response.text(), model);
      }

      const data: any = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const usage = data.usageMetadata
        ? {
            inputTokens: data.usageMetadata.promptTokenCount,
            outputTokens: data.usageMetadata.candidatesTokenCount,
          }
        : undefined;

      return {
        success: true,
        text,
        provider: 'gemini',
        model,
        usage,
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        return {
          success: false,
          provider: 'gemini',
          model,
          error: { code: 'TIMEOUT', message: `Request timed out after ${timeoutMs}ms` },
        };
      }
      return {
        success: false,
        provider: 'gemini',
        model,
        error: { code: 'NETWORK_ERROR', message: err.message || 'Network request failed' },
      };
    }
  }

  async generateStructured<T>(request: StructuredAIRequest<T>): Promise<AIResponse<T>> {
    const model = request.model || this.config.defaultModel || 'gemini-1.5-flash';
    const enhancedPrompt = `${request.prompt}\n\nRespond ONLY with valid JSON matching the required schema.`;

    const textResponse = await this.generateText({
      ...request,
      prompt: enhancedPrompt,
    });

    if (!textResponse.success || !textResponse.text) {
      return {
        success: false,
        provider: 'gemini',
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
          provider: 'gemini',
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
        provider: 'gemini',
        model,
        usage: textResponse.usage,
      };
    } catch (err: any) {
      return {
        success: false,
        provider: 'gemini',
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
      provider: 'gemini',
      model,
      error: {
        code,
        message: `Gemini API error (${status}): ${errorBody}`,
      },
    };
  }
}
