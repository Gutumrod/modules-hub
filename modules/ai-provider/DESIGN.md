# AI Provider Module — DESIGN.md (v0.3.0 baseline + planned expansion)

**Current version:** 0.3.0 (P2, Multi-Provider Fallback)  
**Current implementation status:** Baseline implemented  
**Planned direction:** Automation Inference Pool  
**Language / runtime:** TypeScript, ES2022, strict mode. Edge-runtime compatible through Web Fetch/Streams-style APIs.

---

## 1. Current Purpose

The **AI Provider Module** abstracts LLM inference behind a common contract so host projects do not need provider-specific business logic.

Current implementation supports:

- OpenAI adapter.
- Anthropic adapter.
- Google Gemini adapter.
- `generateText`.
- `generateStructured`.
- normalized provider errors.
- timeout handling.
- ordered fallback through `FallbackAIProvider`.
- optional per-provider circuit-breaker wrapping.

The existing implementation is a **provider abstraction + failure fallback layer**. It is not yet a quota-aware routing system.

---

## 2. Current Contract

Current public request/response contracts remain authoritative until implementation changes are explicitly approved.

```ts
export type AIRequest = {
  model?: string;
  system?: string;
  prompt: string;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
  metadata?: Record<string, unknown>;
};

export type AIResponse<T = unknown> = {
  success: boolean;
  text?: string;
  structured?: T;
  provider: string;
  model?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
  error?: {
    code: AIErrorCode;
    message: string;
  };
};
```

Important: `provider` is currently required by the implemented response contract. The planned architecture below does **not** change that contract yet; any migration must be implemented and versioned deliberately.

---

## 3. Locked Architectural Direction

### 3.1 Provider identity is an implementation detail

Normal consumers should request a capability and receive a result without needing to select or understand the provider/model used behind the curtain.

Target interaction:

```text
Caller
  ↓
Stable capability contract
  ↓
Automation Inference Pool
  ↓
Policy / Router
  ↓
Provider adapter
  ↓
Provider/model selected internally
```

Provider identity, model identity, retry count, fallback reason, quota state, latency, and cost metadata should be retained for internal telemetry/audit/diagnostics rather than becoming required business workflow logic.

### 3.2 Keep the existing Module Hub shape

The planned work extends the existing architecture rather than replacing it:

```text
Host / Consumer
    ↓
AI Provider public contract
    ↓
Routing / policy layer
    ↓
Provider adapters
```

Adding a provider must not require changing consumer business code.

### 3.3 Automation-only initial boundary

The Automation Inference Pool is an **additional execution lane**, not a replacement for the existing WSTERA engineering runtime.

Initial eligible workloads:

- summarization / digest.
- classification.
- extraction to structured data.
- content research preprocessing.
- batch transformation.
- low-risk background enrichment.
- repeatable automation tasks with bounded blast radius.

Initial excluded workloads:

- repository implementation work.
- architecture decisions.
- migrations.
- security remediation.
- release gates.
- production deployment decisions.
- high-impact code review / remediation.

If workload classification is ambiguous, routing must fail closed to the existing engineering runtime rather than defaulting to the Automation Inference Pool.

---

## 4. Planned Router Responsibilities

The future router may consider:

- provider health.
- current quota state.
- near-limit / conserve state.
- capability requirements.
- request priority.
- latency constraints.
- cost ceiling.
- circuit state.
- fallback eligibility.

Example target behavior:

```text
Request
  ↓
Policy evaluation
  ↓
Gemini healthy + quota available
  → Gemini

Gemini near reserved threshold
  → Cloudflare Workers AI

Selected provider rate-limited / timed out
  → next eligible provider

No eligible provider
  → normalized failure
```

This is a planned target. Current `FallbackAIProvider` performs ordered failure fallback only.

---

## 5. Provider Expansion

### Current adapters

- OpenAI.
- Anthropic.
- Google Gemini.

### Planned initial addition

- Cloudflare Workers AI.

The first free-pool experiment is expected to focus on **Google Gemini + Cloudflare Workers AI** before broadening to more providers.

Provider credentials remain host-injected. No credentials or environment-specific values may be hard-coded into core code.

---

## 6. Observability Boundary

The router should record enough internal evidence to explain execution without requiring consumers to understand providers.

Recommended internal execution metadata:

```text
request/correlation id
requested capability
selected provider
selected model
attempt index
fallback source/reason
quota state
latency
token/usage data
cost estimate where available
success/failure
normalized error
```

Consumer-facing contracts should stay capability-oriented.

---

## 7. Media Boundary

This module is an inference layer. It must not become a catch-all media platform.

### In scope around the broader automation platform

A separate capability may discover existing media for content workflows:

- search images.
- search videos.
- inspect/analyze candidate assets.
- rank/select assets.
- preserve source/license/usage-right metadata.

### Out of scope for this module roadmap

- image generation.
- video generation.

Current generation boundaries:

- Image generation → ChatGPT as the primary path.
- Video generation → Hyperframes as the primary path.
- Google Flow video-generation workflow → separate future project with its own architecture and lifecycle.

Asset discovery should integrate with consumers such as AGY Content Board without being implemented as an `AIProvider` adapter.

---

## 8. Consumer Surfaces — Planned

After the engine and soak phases are proven, the same core may be exposed through multiple thin surfaces:

```text
Automation Inference Core
  ├─ HTTP API → n8n / Make / custom automations
  ├─ MCP      → local agents / Hermes / AGY / other agent runtimes
  └─ SDK      → WSTERA applications
```

These surfaces must share one routing/policy implementation. Do not duplicate routing logic per surface.

---

## 9. Development Gate

Implementation expansion follows `ROADMAP.md`.

No Layer 3 external tool/API surface should be treated as production-ready until:

1. Layer 1 routing behavior is proven on controlled real tasks.
2. Layer 2 completes a one-day 3–5 workload soak with recorded evidence.
3. failure modes, quota behavior, and observability are verified.
4. the public capability contract is explicitly reviewed and frozen for the first external consumer.
