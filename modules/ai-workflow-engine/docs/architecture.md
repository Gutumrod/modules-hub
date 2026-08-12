# Architecture

## Objective

Create an AI-driven workflow engine that can operate across unrelated SaaS products while keeping business-specific knowledge outside the core engine.

## Proposed components

### 1. Event Gateway
Receives normalized events from host applications.

Responsibilities:
- validate event envelope
- authenticate source
- deduplicate/idempotency checks
- attach tenant/project identity
- enqueue workflow execution

### 2. Registry / Manifest Store
Stores the contract each host application exposes to the engine.

The manifest defines:
- project/module identity
- event types
- context providers
- action capabilities
- approval requirements
- data sensitivity rules
- adapter versions

### 3. Context Resolver
Builds the minimum context required for a workflow run.

Rules:
- never expose arbitrary database access to the model
- context must come through declared providers
- enforce tenant boundaries and field-level restrictions
- log what context was requested and supplied

### 4. Workflow Runtime
Owns workflow state and transitions.

Possible states:
- received
- resolving_context
- planning
- awaiting_approval
- executing
- retrying
- completed
- failed
- cancelled

The runtime should remain deterministic even when AI is used inside individual decision steps.

### 5. AI Decision Layer
Receives a bounded task, context, available actions, constraints, and desired output schema.

The model should return structured proposals rather than directly mutating host systems.

Example output:
- selected action
- arguments
- reasoning summary suitable for audit
- confidence/risk metadata
- whether additional context is required

### 6. Policy Engine
Validates every proposed action before execution.

Checks may include:
- is this action allowed for this workflow?
- does the caller have permission?
- is approval required?
- are arguments within allowed ranges?
- is this action safe to retry?
- does it violate tenant/data policy?

The AI cannot bypass this layer.

### 7. Approval Service
Handles human-in-the-loop workflows.

Needs:
- approval request creation
- expiry
- approve/reject
- optional edited parameters
- identity of approver
- immutable approval history

### 8. Action Executor
Executes validated actions through adapters.

It should not know business-specific implementation details.

Responsibilities:
- call adapter
- timeout
- retry policy
- idempotency key propagation
- normalize result/error

### 9. Adapter Layer
Bridge between the generic engine and a host application.

Examples:
- `booking.create`
- `customer.update`
- `order.cancel`
- `notification.send`

The engine only sees capability contracts. The adapter owns the actual API/database/service integration.

### 10. Audit / Observability
Record at minimum:
- incoming event
- workflow definition/version
- context requested and source references
- model/provider/version
- structured AI proposal
- policy result
- human approval result
- action request/result
- retries/errors
- timestamps and correlation IDs

Avoid logging secrets or unnecessarily sensitive payloads.

## Key architectural rule

The engine must never infer the shape or capabilities of a host project from raw database structure. The host application explicitly declares what the engine is allowed to know and do.

## Open design questions

- Workflow definition format: JSON/YAML/DSL/code?
- Stateful runtime: database-driven state machine vs queue orchestration?
- How dynamic can manifests be without creating unsafe behavior?
- How should context schemas be versioned?
- How should action schemas be validated?
- Which decisions should be deterministic rules instead of AI?
- How should long-running workflows resume after approval or external callbacks?
- Multi-provider AI routing and fallback strategy
- Cost/token budgets per workflow
- Prompt/version management
- Evaluation and replay testing
