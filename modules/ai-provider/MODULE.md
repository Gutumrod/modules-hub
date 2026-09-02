# Module 18: AI Provider

**Version:** 0.3.0 (P2)
**Status:** Completed — verified against source 2026-08-22. `npm test`: 14/14 passing (3 files). `npm run typecheck`: clean.

## Overview
The **AI Provider Module** provides a lightweight, unified abstraction for LLM text generation over three real providers — OpenAI, Anthropic, Gemini — supporting `generateText` and `generateStructured`. There is no streaming API (`generateStream` does not exist despite being mentioned in an earlier draft of this doc's DESIGN.md).

## Features
- Unified `AIProvider` interface, implemented by three adapters that each call their provider's real REST endpoint (not stubs) — see `DESIGN.md` §2.2 for verified endpoint/request-shape details per provider.
- Secret injection via constructor config (`apiKey`, `baseUrl`, `defaultModel`) — no hardcoded environment access in core.
- Robust error normalization (`RATE_LIMITED`, `MODEL_NOT_FOUND`, `INVALID_RESPONSE`, `TIMEOUT`, `NETWORK_ERROR`, `PROVIDER_ERROR`).
- Request timeout management via `AbortController` (default 30000ms).
- `generateStructured` is **prompt-based** (ask the model for JSON, strip fences, `JSON.parse`, run a caller-supplied `schemaValidator`) — not native tool/function calling or provider-side JSON mode.
- `FallbackAIProvider` tries providers in order, moving to the next on a thrown error, an unsuccessful response envelope, or an open circuit reported by an injected breaker.
  - **Note:** this module does not implement circuit-breaker logic itself — `FallbackAIProvider` only defines a `CircuitBreakerLike` interface and a `circuitBreakerFor` hook to plug one in per provider. Without a breaker supplied it is plain ordered fallback. A real `CircuitBreaker` implementation exists in the separate `enterprise-features` module; that module was not re-verified as part of this audit.

## Usage
Refer to `DESIGN.md` for verified adapter/fallback details. `examples/integration.example.ts` only constructs an `OpenAIProvider` and logs that it initialized — it does not call `generateText`/`generateStructured`, so treat it as a config-shape example, not a working end-to-end demo.
