# AI Provider — Automation Inference Pool Roadmap

**Status:** LOCKED PLAN — NOT YET IMPLEMENTED  
**Baseline:** AI Provider v0.3.0  
**Scope owner:** Module Hub / `modules/ai-provider`  
**Initial providers for the experiment:** Google Gemini + Cloudflare Workers AI

---

## 0. Decision Summary

The existing AI Provider module remains the architectural base.

We will evolve it from **multi-provider ordered fallback** into an **Automation Inference Pool** while preserving the same core principle:

> Callers request capabilities; provider/model selection and switching happen behind the curtain.

This work does **not** replace the existing WSTERA engineering/agent runtime. The first target is high-volume, repeatable automation work only.

---

## 1. Locked Invariants

### INV-1 — No replacement of the existing engineering runtime

The Automation Inference Pool is an additional lane.

It must not become the default executor for project-development work until a separate explicit decision changes that boundary.

### INV-2 — Provider/model is not business logic

Consumers must not need provider-specific branching such as:

```text
if Gemini ...
if Cloudflare ...
```

Provider/model selection, retry, fallback, quota conservation, and health handling belong behind the module boundary.

### INV-3 — Fail closed on workload classification

If the system cannot confidently classify a workload as automation-eligible, do not route it into the Automation Inference Pool.

Default ambiguous/high-impact work back to the existing engineering runtime.

### INV-4 — One routing authority

HTTP API, MCP, SDK, n8n, Make, and agent consumers must use the same underlying routing/policy engine.

Do not duplicate provider-selection logic per integration surface.

### INV-5 — Media discovery is not media generation

The broader automation platform may search and rank existing images/videos for content workflows.

It must not redefine image/video generation as AI Provider responsibilities.

Current generation boundaries:

- Images → ChatGPT primary.
- Video → Hyperframes primary.
- Google Flow → separate future video-generation project/workflow.

---

# Layer 1 — Build & Prove the Engine

## Goal

Extend the existing module until it can route real automation workloads across an initial provider pool without requiring the caller to manage provider choice.

## Scope

### 1. Preserve current provider abstraction

Keep the existing `AIProvider` contract as the implementation baseline. Any public contract change must be versioned and reviewed rather than silently changing consumers.

### 2. Add Cloudflare Workers AI adapter

Initial free-pool target:

```text
Google Gemini
Cloudflare Workers AI
```

Do not add extra providers merely because they exist. Expand only when evidence shows a need.

### 3. Evolve fallback into policy-aware routing

Target routing inputs:

- requested capability.
- provider health.
- circuit state.
- quota state.
- conserve/reserved threshold.
- request priority.
- latency constraints where relevant.
- cost ceiling where relevant.

### 4. Add quota/usage state

The system needs a provider-neutral view such as:

```text
HEALTHY
CONSERVE
EXHAUSTED
UNAVAILABLE
```

Do not assume every provider exposes the same quota API. The implementation may combine provider-reported state with locally tracked usage, but the policy contract must remain provider-neutral.

### 5. Internal observability

Record at minimum:

- correlation/request id.
- requested capability.
- chosen provider/model.
- attempt count.
- fallback reason.
- quota state before/after when available.
- latency.
- usage/tokens when available.
- normalized failure.

Normal consumers should not need these fields to perform business logic.

## Controlled Test Workloads

Layer 1 must use real tasks, not only synthetic unit tests.

Required test classes:

1. long-text summarization.
2. classification.
3. structured extraction to validated JSON.
4. content/research preprocessing.
5. failure simulation: rate limit, timeout, unavailable provider, exhausted/conserve state.

## Layer 1 Acceptance Criteria

- [ ] Gemini adapter still passes existing contract tests.
- [ ] Cloudflare Workers AI adapter implements the same provider contract.
- [ ] normal caller can execute without selecting a concrete provider/model.
- [ ] healthy primary provider can serve requests.
- [ ] selected provider failure can route to next eligible provider.
- [ ] conserve/exhausted state can change routing before a hard provider failure.
- [ ] all-provider failure returns one normalized failure contract.
- [ ] provider/model/fallback evidence exists internally.
- [ ] secrets remain host-injected and are not logged.
- [ ] tests, lint/typecheck, and relevant build checks pass.

**Gate:** Do not start Layer 2 until all required Layer 1 acceptance criteria are evidenced.

---

# Layer 2 — One-Day Automation Soak

## Goal

Prove that the engine works under a realistic day of automation workloads, not just isolated tests.

## Scope

Select **3–5 repeatable automation jobs** and run them for one full operating day.

Candidate jobs:

1. summarize/digest pipeline.
2. classify/routing pipeline.
3. structured extraction / normalization.
4. research/content preprocessing.
5. AGY Content Board preparation task.

Final jobs must be chosen before the soak and recorded with expected input/output contracts.

## Eligibility Rules

The soak jobs must be:

- retryable.
- low blast radius.
- observable.
- bounded in cost/quota impact.
- non-destructive or safely idempotent.

Do not use Layer 2 to test repository implementation, migrations, production deploy decisions, security remediation, or release gates.

## Evidence to Capture

For every request/job where practical:

- workload/job id.
- requested capability.
- provider/model actually selected internally.
- latency.
- token/usage data where available.
- quota state.
- fallback count and reason.
- success/failure.
- output accepted/rejected.

Daily summary must answer:

- Which workloads were handled well by Gemini?
- Which workloads were handled well by Workers AI?
- Did automatic switching happen when expected?
- Did conserve thresholds protect remaining quota?
- What failure patterns occurred?
- Was any paid/high-value lane avoided?
- Did output quality remain acceptable across provider changes?

## Layer 2 Acceptance Criteria

- [ ] 3–5 declared jobs ran through the same routing engine.
- [ ] one full operating-day evidence set exists.
- [ ] no consumer required provider-specific business branching.
- [ ] routing/fallback decisions are explainable from telemetry.
- [ ] quota behavior matches policy closely enough to proceed.
- [ ] failures did not create hidden destructive side effects.
- [ ] known limitations are documented.

**Gate:** Layer 3 requires an explicit review of Layer 2 evidence.

---

# Layer 3 — Productize as a Reusable Tool Surface

## Goal

Expose the proven engine so local agents and automation systems can consume capabilities without knowing which provider/model is used.

## Target Surfaces

One core, multiple thin entry points:

```text
Automation Inference Core
  ├─ HTTP API
  ├─ MCP Server
  └─ TypeScript SDK
```

Potential consumers:

- Hermes / local agents.
- AGY.
- n8n.
- Make.com.
- AGY Content Board.
- future WSTERA automation systems.

## Public Contract Principle

Expose **capabilities**, not provider choice.

Examples of capability-oriented operations:

```text
generateText
extractStructured
summarize
classify
analyze
```

Provider overrides may exist only as explicit diagnostic/admin controls if later required. They must not become normal workflow dependencies.

## Asset Discovery Integration

AGY Content Board or other content systems may need a separate media-discovery capability:

```text
searchImages
searchVideos
analyzeAsset
rankAssets
selectAssets
```

Asset results should preserve metadata needed for responsible use where available:

```text
source
sourceUrl
assetUrl
thumbnail
creator
license / usage rights
duration
dimensions
relevance / selection rationale
```

This discovery capability is adjacent to the Automation Inference Pool but is **not** an `AIProvider` adapter.

## Generation Boundary

Do not add these to this roadmap as provider-pool responsibilities:

```text
generateImage
generateVideo
```

Generation remains external:

- ChatGPT for images.
- Hyperframes for video.
- Google Flow as a separate future project/workflow.

## Layer 3 Acceptance Criteria

- [ ] first external surface uses the same proven routing core.
- [ ] consumer workflow contains no required provider-specific branching.
- [ ] auth, rate limiting, and request isolation are defined for the selected surface.
- [ ] internal telemetry still identifies actual provider/model/fallback path.
- [ ] errors remain normalized across providers.
- [ ] documentation includes usage and known limitations.
- [ ] first real consumer completes end-to-end acceptance.

---

# Security / Data Rules

Before any provider is eligible for a request, policy must be able to exclude workloads based on data sensitivity.

At minimum consider:

- secrets / credentials.
- customer PII.
- production-sensitive data.
- provider data-retention/training terms.
- tenant isolation.
- logging/redaction policy.

A free API tier must not automatically imply eligibility for sensitive data.

---

# Failure Cases to Design Explicitly

- hard rate limit / quota exhausted.
- near-limit conserve threshold.
- timeout.
- provider/network outage.
- model removed or renamed.
- invalid structured output.
- partial response / stream interruption.
- local usage ledger drift from provider truth.
- all eligible providers unavailable.
- consumer retries causing duplicate work.

Each failure must have a defined retry/fallback/fail-closed behavior before Layer 3 production use.

---

# Current Non-Goals

- replacing Hermes/OpenCode/AGY/Qwen/Codex/Claude engineering runtime.
- autonomous repository implementation through the free pool.
- image generation orchestration.
- video generation orchestration.
- Google Flow implementation.
- adding many providers before Google + Cloudflare are proven.

---

# Next Action

When implementation is authorized, start with **Layer 1 only**:

1. re-read current `modules/ai-provider` implementation and tests.
2. define the provider-neutral routing/quota contract.
3. define Cloudflare Workers AI adapter contract.
4. define security eligibility policy for free-tier providers.
5. implement a thin end-to-end vertical slice.
6. test with the declared controlled workloads.

Do not start Layer 2 or Layer 3 in parallel.
