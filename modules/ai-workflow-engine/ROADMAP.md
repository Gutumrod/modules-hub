# Roadmap

## Phase 0 — Define the problem

Goal: prove the generic contract before writing the runtime.

- define terminology
- define event envelope
- define manifest responsibilities
- define context provider contract
- define action contract
- classify action risk and approval requirements
- choose one simple example domain only for testing the abstraction

Exit criteria: a second unrelated SaaS domain can be described using the same contract without changing the engine concept.

## Phase 1 — Contract prototype

- create JSON Schema for manifest
- create JSON Schema for events
- create JSON Schema for context providers/actions
- build manifest validator
- build fake/in-memory adapter
- define normalized execution/error responses
- add contract tests

No LLM integration required yet.

## Phase 2 — Deterministic workflow runtime

- workflow run state machine
- event ingestion
- context resolver
- action executor
- retry/idempotency model
- audit log
- policy engine
- approval state

Exit criteria: deterministic workflows can execute safely without AI.

## Phase 3 — AI decision step

- provider abstraction
- structured output schema
- bounded action selection
- context budgeting
- prompt/version registry
- failure/fallback behavior
- decision audit record

AI proposes; deterministic layers validate and execute.

## Phase 4 — Human-in-the-loop

- approval requests
- approve/reject/edit flow
- expiration
- resume suspended workflow
- immutable approval history

## Phase 5 — Production hardening

- tenant isolation tests
- prompt injection tests
- replay/idempotency tests
- rate/cost limits
- observability
- tracing/correlation IDs
- dead-letter handling
- workflow replay/debug tooling
- provider outage/fallback strategy

## Phase 6 — Reusable SDK/adapters

Potential deliverables:
- TypeScript SDK
- Supabase adapter
- HTTP/webhook adapter
- generic REST action adapter
- Next.js integration helper
- event publisher client

Only build adapters justified by real projects.

## Questions to resolve before implementation

1. Is the engine embedded as a package, deployed as a standalone service, or support both?
2. Where is workflow state persisted?
3. How are manifests registered and authenticated?
4. What is the minimum safe action contract?
5. How are tenant and actor permissions represented?
6. Which workflow steps genuinely require AI?
7. How are long-running workflows and callbacks represented?
8. How are costs and token usage capped per tenant/workflow?
9. How are workflow and prompt versions replayed exactly for debugging?
10. What is the smallest cross-domain proof that demonstrates the architecture is truly reusable?

## First recommended experiment

Do not begin with a full autonomous agent.

Build one workflow with:
- one event
- one context provider
- two possible actions
- one deterministic policy
- one action requiring approval
- one AI decision step returning strict structured output
- complete audit history

Then implement the same engine contract against a second, unrelated SaaS domain. If the core engine requires business-specific modifications, revise the contract before expanding.
