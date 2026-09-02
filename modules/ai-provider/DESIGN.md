# AI Provider Module — DESIGN.md (v0.3.0)

**Version:** 0.3.0 (P2, Multi-Provider Fallback)
**Status:** Implemented and verified against source (2026-08-22 audit). `generateText` / `generateStructured` are real; no streaming API exists (see note below).
**Language / runtime:** TypeScript, ES2022, strict mode. Uses the global `fetch` + `AbortController`, so it runs anywhere those are available (Node 18+, edge runtimes, browsers) — this has not been separately verified against Cloudflare Workers/Vercel Edge.

---

## 1. Purpose & Architectural Objectives

The **AI Provider Module** abstracts interactions with major Large Language Model (LLM) providers (OpenAI, Anthropic, Google Gemini), providing a unified interface for text generation and prompt-based structured output.

> **CRITICAL BOUNDARY:**
> - Ships three real adapters — `OpenAIProvider`, `AnthropicProvider`, `GeminiProvider` — each calling its provider's actual REST endpoint with the correct request shape (verified against source, see §2.2).
> - `FallbackAIProvider` tries providers in order, moving to the next on a thrown error, an unsuccessful response envelope (`success: false`), or an open circuit (see §3).
> - Provides unified error handling (`AIErrorCode`) and usage normalization (`inputTokens`/`outputTokens`).
> - **No streaming API.** There is no `generateStream`, `StreamAIChunk`, `AIProviderType`, or `MultiProviderAI` anywhere in `core/` or `adapters/` — an earlier version of this document described these as implemented; they were never built. If token streaming is needed, it must be added.

---

## 2. Core Domain Models & Interfaces

### 2.1 Provider Types

The actual exported types (`core/types.ts`) are `AIRequest`, `StructuredAIRequest<T>`, `AIErrorCode`, `AIResponse<T>`, `AIProvider`, and `OpenAIConfig` (reused as the config shape for all three adapters). There is no `AIProviderType`, `StreamAIChunk`, or `MultiProviderAI` — see the boundary note above.

### 2.2 Provider Adapters (verified against source)

All three adapters (`adapters/*.ts`) implement `AIProvider` with a real `fetch` call to the provider's actual REST endpoint — none are stubs:

| Adapter | Endpoint | Auth | Request shape |
|---|---|---|---|
| `OpenAIProvider` | `POST {baseUrl}/chat/completions` (default `https://api.openai.com/v1`) | `Authorization: Bearer <apiKey>` | `{ model, messages: [{role, content}], temperature, max_tokens }` |
| `AnthropicProvider` | `POST {baseUrl}/messages` (default `https://api.anthropic.com/v1`) | `x-api-key: <apiKey>` + `anthropic-version: 2023-06-01` | `{ model, max_tokens, messages: [{role: 'user', content}], system?, temperature? }` |
| `GeminiProvider` | `POST {baseUrl}/models/{model}:generateContent?key=<apiKey>` (default `https://generativelanguage.googleapis.com/v1beta`) | API key in query string | `{ contents: [{role, parts: [{text}]}], generationConfig: {temperature, maxOutputTokens} }` |

Each adapter:
- Throws `CONFIG_MISSING: <Provider> apiKey is required` synchronously from the constructor if `apiKey` is missing/empty.
- Enforces `request.timeoutMs` (default 30000ms) via `AbortController`, mapping an abort to `{ success: false, error: { code: 'TIMEOUT' } }`.
- Maps HTTP 429 → `RATE_LIMITED`, HTTP 404 → `MODEL_NOT_FOUND`, anything else non-OK → `PROVIDER_ERROR`.
- Normalizes usage: OpenAI (`usage.prompt_tokens`/`completion_tokens`), Anthropic (`usage.input_tokens`/`output_tokens`), Gemini (`usageMetadata.promptTokenCount`/`candidatesTokenCount`) → the common `{ inputTokens, outputTokens }` shape.
- Implements `generateStructured` as a **prompt-based** wrapper, not native tool/function calling: it appends `"Respond ONLY with valid JSON..."` to the prompt, strips ```` ```json ```` fences from the reply, `JSON.parse`s it, then runs the caller-supplied `schemaValidator`. There is no use of OpenAI JSON mode, Anthropic tool use, or Gemini structured output — a provider that ignores the instruction and prose-wraps its answer will fail parsing.

### 2.3 Test coverage of the above

`tests/unit/openai-adapter.test.ts` and `tests/unit/multiprovider.test.ts` mock `globalThis.fetch` and assert on the request/response mapping (success path, 429 → `RATE_LIMITED`, structured-output parse). They confirm the mapping logic works against a *mocked* response shape; they do not hit real provider endpoints, so wire compatibility with the live APIs has not been confirmed by these tests alone (endpoint URLs and payload shapes were checked by reading the adapter source against each provider's documented API instead).

---

## 3. Fallback & Circuit Breaker (`core/fallback.ts`)

`FallbackAIProvider` (implements `AIProvider`) takes a `FallbackConfig`:

```ts
export interface FallbackConfig {
  providers: readonly AIProvider[];
  circuitBreakerFor?: (provider: AIProvider, index: number) => CircuitBreakerLike | undefined;
}
```

For `generateText`/`generateStructured`, it iterates `providers` in order and, for each one:
1. Optionally wraps the call in a caller-supplied `CircuitBreakerLike.execute()` (via `circuitBreakerFor`).
2. Treats a thrown error, a rejected breaker (e.g. open circuit), **or** a response with `success: false` as a failure and moves to the next provider.
3. Returns the first successful response; if all providers fail (or the list is empty), returns a normalized `{ success: false, provider: 'fallback', error: { code: 'PROVIDER_ERROR', message } }`.

**Important nuance:** `FallbackAIProvider` does *not* implement circuit-breaker logic itself — `core/fallback.ts` contains no failure-counting, half-open state, or timer. It only defines the `CircuitBreakerLike` interface (`{ execute<T>(fn) => Promise<T> }`) and a slot (`circuitBreakerFor`) to plug one in per provider. Without a `circuitBreakerFor` supplied, there is no circuit breaking at all — just ordered fallback. A real circuit breaker implementation lives in the separate `enterprise-features` module (`CircuitBreaker` export); this module was not re-audited as part of this pass, so its correctness is not verified here. The "per-provider circuit breaker routing" claim in `modules/ROADMAP.md` is accurate as a *routing/composition point*, not as a claim that `ai-provider` ships its own breaker.

`tests/unit/fallback.test.ts` (6 tests, all passing) covers: stop-on-first-success, fallback on `success: false`, fallback on thrown error, fallback on one provider's circuit being open (via a mocked `CircuitBreakerLike`) without affecting another provider, normalized failure when all providers fail / list is empty, and identical fallback behavior for `generateStructured`.

---

## 4. Verified Status (2026-08-22 audit)

- `npm test` (vitest run): **14/14 tests passing**, 3 files (`openai-adapter.test.ts` 4, `fallback.test.ts` 6, `multiprovider.test.ts` 4 — the latter covers Anthropic + Gemini despite the generic name).
- `npm run typecheck` (`tsc --noEmit`): **clean, no errors.**
- `index.ts` exports: `core/types.ts` (`*`), `OpenAIProvider`, `AnthropicProvider`, `GeminiProvider`, `core/fallback.ts` (`*`, i.e. `FallbackAIProvider`, `FallbackConfig`, `CircuitBreakerLike`).
- `examples/integration.example.ts` only demonstrates constructing an `OpenAIProvider` with a fake key and logging that it initialized — it does not call `generateText`/`generateStructured`, so it is not a working end-to-end example against a live API.
