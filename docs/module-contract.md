# Module Contract

## Purpose

Define how any SaaS project introduces itself to the AI Workflow Engine.

The engine must not contain project-specific assumptions. A host project exposes capabilities through a versioned manifest and adapters.

## Conceptual manifest

```json
{
  "manifest_version": "1.0",
  "project": {
    "id": "example-project",
    "name": "Example Project"
  },
  "events": [],
  "context_providers": [],
  "actions": [],
  "policies": {}
}
```

This is conceptual only; the final schema is not locked yet.

## Event contract

Every event should use a common envelope independent of business type.

Recommended fields:
- event_id
- event_type
- occurred_at
- project_id
- tenant_id when applicable
- actor reference
- subject reference
- correlation_id
- idempotency_key
- payload
- schema_version

Example event types could be `booking.created`, `order.paid`, or `customer.message.received`, but the engine treats these as registered capabilities rather than built-in business concepts.

## Context provider contract

A context provider exposes a controlled read capability.

Each provider should declare:
- name
- description
- input schema
- output schema
- required permissions
- sensitive fields
- timeout/cache behavior

Examples:
- `customer.get_summary`
- `booking.get_details`
- `inventory.get_availability`

The model must not receive unrestricted SQL/database credentials.

## Action contract

An action is a controlled mutation or external side effect.

Each action should declare:
- action name
- description
- JSON input schema
- JSON output schema
- required permissions
- risk level
- approval policy
- idempotency behavior
- timeout
- retry policy
- side-effect classification

Examples:
- `booking.reschedule`
- `notification.send`
- `order.refund_request`

## Approval contract

An action may specify one of several policy classes, for example:
- automatic
- automatic_with_limits
- always_require_approval
- forbidden_for_ai

The exact taxonomy remains an implementation decision.

## Adapter contract

Adapters implement registered context providers and actions.

The engine should call a normalized adapter interface rather than importing application business logic directly.

An adapter response should normalize:
- success/failure
- result payload
- machine-readable error code
- retryability
- external reference
- execution timestamp

## Versioning

Every manifest, event schema, context provider, and action should be versionable.

Breaking changes must not silently alter workflows already in progress.

## Discovery

A host project should explicitly register or deploy its manifest. Runtime introspection of arbitrary APIs or databases should not be the primary integration mechanism.

## Design requirement

The contract must be expressive enough for different SaaS domains while remaining strict enough that the engine can validate every AI-requested capability before execution.
