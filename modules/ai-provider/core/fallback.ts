import type { AIProvider, AIRequest, AIResponse, StructuredAIRequest } from './types.js';

export interface CircuitBreakerLike {
  execute<T>(fn: () => Promise<T>): Promise<T>;
}

export interface FallbackConfig {
  providers: readonly AIProvider[];
  circuitBreakerFor?: (provider: AIProvider, index: number) => CircuitBreakerLike | undefined;
}

class UnsuccessfulProviderResponse<T> extends Error {
  override readonly name = 'UnsuccessfulProviderResponse';
  constructor(readonly response: AIResponse<T>) {
    super(response.error?.message ?? 'AI provider returned an unsuccessful response');
  }
}

function failureResponse<T>(lastError: unknown): AIResponse<T> {
  const message = lastError instanceof Error
    ? lastError.message
    : typeof lastError === 'object' && lastError !== null && 'message' in lastError
      ? String(lastError.message)
      : 'All providers failed';

  return {
    success: false,
    provider: 'fallback',
    error: { code: 'PROVIDER_ERROR', message },
  };
}

export class FallbackAIProvider implements AIProvider {
  constructor(private readonly config: FallbackConfig) {}

  async generateText(request: AIRequest): Promise<AIResponse<string>> {
    return this.tryProviders((provider) => provider.generateText(request));
  }

  async generateStructured<T>(request: StructuredAIRequest<T>): Promise<AIResponse<T>> {
    return this.tryProviders((provider) => provider.generateStructured(request));
  }

  private async tryProviders<T>(operation: (provider: AIProvider) => Promise<AIResponse<T>>): Promise<AIResponse<T>> {
    let lastError: unknown;

    for (const [index, provider] of this.config.providers.entries()) {
      const breaker = this.config.circuitBreakerFor?.(provider, index);
      try {
        const execute = async (): Promise<AIResponse<T>> => {
          const response = await operation(provider);
          if (!response.success) throw new UnsuccessfulProviderResponse(response);
          return response;
        };
        return breaker ? await breaker.execute(execute) : await execute();
      } catch (error) {
        lastError = error instanceof UnsuccessfulProviderResponse ? error.response.error ?? error : error;
      }
    }

    return failureResponse(lastError);
  }
}
