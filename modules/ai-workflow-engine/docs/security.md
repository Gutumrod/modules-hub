# Security Model

## Principle

AI is an untrusted decision component operating inside deterministic security boundaries.

The model may propose actions. It must never receive unrestricted authority to execute arbitrary code, query arbitrary data, or mutate host systems.

## Required controls

### Least privilege
- expose only registered context providers and actions
- scope access by project and tenant
- use short-lived credentials where integrations require credentials
- never expose service-role secrets or raw production credentials to prompts

### Schema validation
All events, context requests, model outputs, and action arguments must be validated against explicit schemas before use.

### Policy enforcement
Every proposed action must pass deterministic policy checks outside the model.

Policies should support:
- permission checks
- risk classifications
- amount/quantity limits
- tenant boundaries
- workflow-specific allowlists
- rate limits
- approval requirements

### Human approval
High-risk or irreversible actions should support human approval before execution.

Approval records must include:
- workflow run
- proposed action and parameters
- approver identity
- decision
- timestamp
- optional edited parameters

### Auditability
Maintain an append-oriented audit trail for security-relevant workflow activity.

Do not rely solely on conversational model logs.

### Prompt injection boundaries
Content from users, documents, messages, or external systems must be treated as untrusted data, not trusted instructions.

The engine should separate:
- system policy
- workflow definition
- tool/capability definitions
- untrusted business data

### Data minimization
Context Resolver should provide only fields necessary for the active decision.

Sensitive fields should be redactable before model invocation.

### Action safety
Actions should declare whether they are:
- read-only
- reversible
- idempotent
- financially sensitive
- privacy sensitive
- externally visible
- destructive

This metadata can drive approval and execution policy.

### Idempotency and replay
Side-effecting actions must account for retries and duplicate events. Idempotency keys should propagate from event to action where possible.

### Failure isolation
A failed workflow must not compromise unrelated tenants, projects, or workflow runs.

## Threats to explicitly test

- prompt injection through customer-provided text
- model inventing an unavailable action
- model supplying malformed or excessive parameters
- cross-tenant context leakage
- replayed events causing duplicate side effects
- bypass of approval flow
- poisoned manifest/adapter metadata
- secrets leaking into model context or audit logs
- compromised adapter returning misleading success
- runaway loops and cost exhaustion

## Non-goal

The AI model itself is not the authorization system. Authorization remains deterministic and external to the model.
