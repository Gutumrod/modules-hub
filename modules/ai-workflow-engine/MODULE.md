# Module 20: AI Workflow Engine (v0.3.0)

Project-agnostic AI orchestration and workflow engine for Module Hub.

## Features
- **Project-Agnostic Manifest:** Host defines actions, context providers, and approval policies (`HostManifest` type only — no manifest registry, versioning, or validation layer exists yet).
- **Workflow Runtime:** `AdaptiveWorkflowRuntime` (exported as `AIWorkflowRuntime`) evaluates triggers (event or conversation) and coordinates execution against the manifest.
- **Human-in-the-Loop:** If a matched action has `requiresApproval: true`, the runtime short-circuits to a `pending_approval` result. There is no approve/reject/resume flow — that stops at "pending".
- **Default Adapters:** `AdaptiveIntentResolver` (regex/keyword fallback, optional injected AI provider) and `DefaultIntentResolver`/`DefaultActionExecutor` stubs.
- **State Stores:** `PersistentMemoryStore<T>` (in-memory `Map`, deep-copy isolated) and `RedisStateStore<T>` (typed adapter around an injected `RedisStateClient { set, get, del }`, with structured `StateStoreError` codes for serialization/malformed-JSON/operation failures). The Redis adapter does not ship a Redis client library (`package.json` has zero runtime dependencies) and is only unit-tested against a mocked client — it has not been verified against a live Redis server in this repo.

## Verified state (2026-08-22 audit)
- Version: 0.3.0 (matches `VERSION` and `package.json`).
- Tests: 19/19 passing across 3 files (`vitest run`).
- Typecheck: `tsc --noEmit` clean.
- Everything beyond the exports above (event gateway, context resolver, policy engine, audit log, workflow state machine, model gateway, etc.) is design-only — see `ROADMAP.md`, `docs/architecture.md`, and `ai-workflow-engine-module-brief-v0.2.md`, none of which are implemented.

## Usage
Refer to `examples/integration.example.ts`.
