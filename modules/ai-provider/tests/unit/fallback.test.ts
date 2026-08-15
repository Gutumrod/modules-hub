import { describe, expect, it, vi } from 'vitest';
import { FallbackAIProvider, type CircuitBreakerLike } from '../../core/fallback.js';
import type { AIProvider, AIResponse, StructuredAIRequest } from '../../core/types.js';

function provider(overrides: Partial<AIProvider> = {}): AIProvider {
  return {
    generateText: vi.fn().mockResolvedValue({ success: true, provider: 'test', text: 'ok' }),
    generateStructured: vi.fn().mockResolvedValue({ success: true, provider: 'test', structured: { ok: true } }),
    ...overrides,
  };
}

describe('FallbackAIProvider', () => {
  it('stops after the first successful text provider', async () => {
    const first = provider();
    const second = provider();
    const response = await new FallbackAIProvider({ providers: [first, second] }).generateText({ prompt: 'hello' });
    expect(response.success).toBe(true);
    expect(second.generateText).not.toHaveBeenCalled();
  });

  it('falls back when a provider returns success false', async () => {
    const first = provider({ generateText: vi.fn().mockResolvedValue({ success: false, provider: 'first', error: { code: 'TIMEOUT', message: 'slow' } }) });
    const second = provider();
    const response = await new FallbackAIProvider({ providers: [first, second] }).generateText({ prompt: 'hello' });
    expect(response.success).toBe(true);
    expect(second.generateText).toHaveBeenCalledOnce();
  });

  it('falls back when a provider throws', async () => {
    const first = provider({ generateText: vi.fn().mockRejectedValue(new Error('offline')) });
    const second = provider();
    await expect(new FallbackAIProvider({ providers: [first, second] }).generateText({ prompt: 'hello' })).resolves.toMatchObject({ success: true });
  });

  it('falls back when one provider circuit is open without affecting another', async () => {
    const first = provider();
    const second = provider();
    const openBreaker: CircuitBreakerLike = { execute: vi.fn().mockRejectedValue(new Error('CIRCUIT_OPEN')) };
    const healthyBreaker: CircuitBreakerLike = { execute: vi.fn((fn) => fn()) };
    const response = await new FallbackAIProvider({
      providers: [first, second],
      circuitBreakerFor: (_provider, index) => index === 0 ? openBreaker : healthyBreaker,
    }).generateText({ prompt: 'hello' });
    expect(response.success).toBe(true);
    expect(first.generateText).not.toHaveBeenCalled();
    expect(second.generateText).toHaveBeenCalledOnce();
  });

  it('returns a normalized failure when all providers fail or the list is empty', async () => {
    const failed = provider({ generateText: vi.fn().mockResolvedValue({ success: false, provider: 'failed', error: { code: 'PROVIDER_ERROR', message: 'no capacity' } }) });
    await expect(new FallbackAIProvider({ providers: [failed] }).generateText({ prompt: 'hello' })).resolves.toMatchObject({ success: false, error: { message: 'no capacity' } });
    await expect(new FallbackAIProvider({ providers: [] }).generateText({ prompt: 'hello' })).resolves.toMatchObject({ success: false, error: { message: 'All providers failed' } });
  });

  it('applies the same fallback behavior to structured generation', async () => {
    const first = provider({ generateStructured: vi.fn().mockResolvedValue({ success: false, provider: 'first', error: { code: 'INVALID_RESPONSE', message: 'bad json' } }) });
    const expected: AIResponse<{ ok: boolean }> = { success: true, provider: 'second', structured: { ok: true } };
    const second = provider({ generateStructured: vi.fn().mockResolvedValue(expected) });
    const request: StructuredAIRequest<{ ok: boolean }> = { prompt: 'json', schemaValidator: () => ({ success: true, data: { ok: true } }) };
    await expect(new FallbackAIProvider({ providers: [first, second] }).generateStructured(request)).resolves.toEqual(expected);
  });
});
