import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AnthropicProvider } from '../../adapters/anthropic-adapter';
import { GeminiProvider } from '../../adapters/gemini-adapter';

describe('Multi-Provider AI Adapters', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('should throw error if Anthropic apiKey is missing', () => {
    expect(() => new AnthropicProvider({ apiKey: '' })).toThrow('CONFIG_MISSING');
  });

  it('should generate text successfully with Anthropic adapter', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ text: 'Hello from Claude' }],
        usage: { input_tokens: 15, output_tokens: 8 },
      }),
    });

    const provider = new AnthropicProvider({ apiKey: 'anthropic-test-key' });
    const response = await provider.generateText({ prompt: 'Hello Claude' });

    expect(response.success).toBe(true);
    expect(response.text).toBe('Hello from Claude');
    expect(response.provider).toBe('anthropic');
    expect(response.usage?.inputTokens).toBe(15);
  });

  it('should throw error if Gemini apiKey is missing', () => {
    expect(() => new GeminiProvider({ apiKey: '' })).toThrow('CONFIG_MISSING');
  });

  it('should generate text successfully with Gemini adapter', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'Hello from Gemini' }] } }],
        usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 6 },
      }),
    });

    const provider = new GeminiProvider({ apiKey: 'gemini-test-key' });
    const response = await provider.generateText({ prompt: 'Hello Gemini' });

    expect(response.success).toBe(true);
    expect(response.text).toBe('Hello from Gemini');
    expect(response.provider).toBe('gemini');
    expect(response.usage?.inputTokens).toBe(12);
  });
});
