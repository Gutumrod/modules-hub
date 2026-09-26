# Module 18: AI Provider

**Version:** 0.3.0 (P2 baseline)
**Status:** ✅ Current baseline completed · 🧭 Automation Inference Pool expansion planned

## Overview

The **AI Provider Module** is the reusable provider-agnostic inference layer for Module Hub. The current `0.3.0` implementation provides a unified interface for text and structured generation across multiple providers, with normalized errors and ordered fallback.

The next planned evolution keeps the same architectural shape and extends the module into an **Automation Inference Pool** for high-volume, repeatable automation workloads.

## Current Verified Capabilities

- Unified `AIProvider` interface.
- `generateText` and `generateStructured` contracts.
- Provider adapters for OpenAI, Anthropic, and Google Gemini.
- Secret injection from the host; core does not read global environment secrets directly.
- Error normalization (`RATE_LIMITED`, `TIMEOUT`, `NETWORK_ERROR`, `PROVIDER_ERROR`, etc.).
- Request timeout handling.
- `FallbackAIProvider` with ordered fallback after thrown errors, unsuccessful responses, or an open per-provider circuit breaker.

## Current Limitations

The current implementation is **failure-aware fallback**, not yet a quota-aware or policy-aware router.

Not implemented yet:

- Cloudflare Workers AI adapter.
- Quota-aware / near-limit switching.
- Cost-aware routing.
- Capability-aware routing.
- Priority-aware routing.
- Shared provider health/quota ledger.
- Stable external API/MCP surface for automation consumers.

The current `AIResponse` still exposes `provider` and optional `model`. The target direction is that normal consumers should not need provider/model identity to perform their work; provider identity should become implementation/observability detail rather than business logic.

## Locked Direction

### 1. Additional lane, not replacement

The Automation Inference Pool will **not replace the existing WSTERA engineering/agent runtime** at this stage.

Initial use is restricted to repeatable, high-volume, low-blast-radius automation workloads. Engineering implementation, architecture decisions, migrations, release gates, security remediation, and other high-impact project work remain on the existing runtime until a separate decision explicitly changes that boundary.

### 2. Provider identity stays behind the curtain

Callers request capabilities. The module decides which provider/model executes the request.

Consumers should not need to know whether the request ran on Gemini, Cloudflare Workers AI, or a future provider. Provider/model/attempt/fallback/quota details remain available for internal diagnostics and observability.

### 3. Three-layer development plan

- **Layer 1 — Engine:** build and prove routing, quota/health policy, fallback, observability, and Cloudflare Workers AI support using controlled real tasks.
- **Layer 2 — Automation Soak:** run 3–5 real automation workloads for one full day and collect evidence on quality, quota consumption, fallback behavior, failures, and routing decisions.
- **Layer 3 — Tool Surface:** expose the proven capability through HTTP API, MCP, and/or SDK surfaces so agents and automation systems can call it without knowing the underlying provider.

See `ROADMAP.md` for the canonical plan.

## Media Boundary

Media **discovery** may become a consumer capability around this module, but media **generation** is not part of the AI Provider scope.

- Find existing images/videos for content: allowed as a separate discovery capability/service.
- Image generation: ChatGPT remains the primary generation path.
- Video generation: Hyperframes remains the primary generation path.
- Google Flow video-generation workflow: separate future project; do not fold it into this module roadmap.

## Usage

Refer to:

- `DESIGN.md` — current architecture and target invariants.
- `ROADMAP.md` — locked Layer 1–3 expansion plan.
- `examples/` — current integration examples.
