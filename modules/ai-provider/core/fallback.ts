import { AIProvider, AIRequest, AIResponse, StructuredAIRequest } from './types.js';

export interface CircuitBreakerLike {
  execute<T>(fn: () => Promise<T>): Promise<T>;
}

export interface FallbackConfig {
  providers: AIProvider[];
  circuitBreaker?: CircuitBreakerLike;
}

export class FallbackAIProvider implements AIProvider {
  constructor(private config: FallbackConfig) {}

  async generateText(request: AIRequest): Promise<AIResponse<string>> {
    let lastError: any;

    for (const provider of this.config.providers) {
      try {
        if (this.config.circuitBreaker) {
          return await this.config.circuitBreaker.execute(() => provider.generateText(request));
        }
        const response = await provider.generateText(request);
        if (response.success) return response;
        lastError = response.error;
      } catch (err) {
        lastError = err;
      }
    }

    return {
      success: false,
      provider: 'fallback',
      error: {
        code: 'PROVIDER_ERROR',
        message: lastError?.message || 'All providers failed',
      },
    };
  }

  async generateStructured<T>(request: StructuredAIRequest<T>): Promise<AIResponse<T>> {
    let lastError: any;

    for (const provider of this.config.providers) {
      try {
        if (this.config.circuitBreaker) {
          return await this.config.circuitBreaker.execute(() => provider.generateStructured(request));
        }
        const response = await provider.generateStructured(request);
        if (response.success) return response;
        lastError = response.error;
      } catch (err) {
        lastError = err;
      }
    }

    return {
      success: false,
      provider: 'fallback',
      error: {
        code: 'PROVIDER_ERROR',
        message: lastError?.message || 'All providers failed',
      },
    };
  }
}
