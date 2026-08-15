# AI Provider Module — DESIGN.md (v0.3.0)

**Version:** 0.3.0 (P2, Multi-Provider Fallback)
**Status:** Design & Research Complete (Phase 1).
**Language / runtime:** TypeScript, ES2022, strict mode. Compatible with Edge runtimes (Cloudflare Workers, Vercel Edge) using Web Fetch and Streams API.

---

## 1. Purpose & Architectural Objectives

The **AI Provider Module** abstracts interactions with major Large Language Model (LLM) providers (OpenAI, Anthropic, Google Gemini), providing unified interfaces for text generation, structured outputs, and real-time streaming.

> **CRITICAL BOUNDARY:**
> - v0.2.0 introduces **Multi-Provider Architecture** (OpenAI, Anthropic, Gemini).
> - v0.3.0 adds ordered fallback for thrown errors, unsuccessful response envelopes, and per-provider open circuits.
> - Adds **Token Streaming Support** (`generateStream`).
> - Provides unified error handling and usage normalization.

---

## 2. Core Domain Models & Interfaces (v0.2.0)

### 2.1 Provider Types
```ts
export type AIProviderType = 'openai' | 'anthropic' | 'gemini';

export type StreamAIChunk = {
  textDelta: string;
  done: boolean;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
};

export interface MultiProviderAI extends AIProvider {
  providerType: AIProviderType;
  generateStream(request: AIRequest): AsyncIterableIterator<StreamAIChunk>;
}
```
