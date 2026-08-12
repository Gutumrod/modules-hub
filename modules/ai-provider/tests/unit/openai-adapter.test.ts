import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenAIProvider } from '../../adapters/openai-adapter';

describe('OpenAIProvider', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('should throw error if apiKey is missing', () => {
    expect(() => new OpenAIProvider({ apiKey: '' })).toThrow('CONFIG_MISSING');
  });

  it('should generate text successfully on mock fetch', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Hello World' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }),
    });

    const provider = new OpenAIProvider({ apiKey: 'test-key' });
    const response = await provider.generateText({ prompt: 'Say hello' });

    expect(response.success).toBe(true);
    expect(response.text).toBe('Hello World');
    expect(response.usage?.inputTokens).toBe(10);
    expect(response.usage?.outputTokens).toBe(5);
  });

  it('should handle rate limit error (429)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'Rate limit exceeded',
    });

    const provider = new OpenAIProvider({ apiKey: 'test-key' });
    const response = await provider.generateText({ prompt: 'Test' });

    expect(response.success).toBe(false);
    expect(response.error?.code).toBe('RATE_LIMITED');
  });

  it('should generate structured output successfully', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"answer": "yes", "score": 95}' } }],
      }),
    });

    const provider = new OpenAIProvider({ apiKey: 'test-key' });
    type ResultType = { answer: string; score: number };

    const response = await provider.generateStructured<ResultType>({
      prompt: 'Evaluate',
      schemaValidator: (data: any) => {
        if (data && typeof data.answer === 'string' && typeof data.score === 'number') {
          return { success: true, data };
        }
        return { success: false, error: 'Invalid schema' };
      },
    });

    expect(response.success).toBe(true);
    expect(response.structured).toEqual({ answer: 'yes', score: 95 });
  });
});
