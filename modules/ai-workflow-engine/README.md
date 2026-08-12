# AI Workflow Engine

Reusable, project-agnostic AI workflow orchestration module for SaaS products.

## Goal

Build a central workflow engine that can be plugged into different SaaS projects without hard-coding business-specific logic into the engine itself.

The engine should understand each host project through explicit contracts, not by guessing.

## Core idea

Each host application registers a machine-readable manifest describing:

- available events
- readable context/data sources
- allowed actions
- actions requiring human approval
- constraints and permissions
- adapter endpoints or handlers

The AI Workflow Engine then receives events, gathers approved context, makes decisions within policy, executes permitted actions through adapters, and records every important step in an audit log.

## High-level flow

1. Host application emits an event.
2. Engine identifies the registered project/module context.
3. Context resolver loads only permitted data.
4. AI decision layer evaluates the workflow goal and available actions.
5. Policy engine validates the proposed action.
6. If required, execution pauses for human approval.
7. Adapter executes the approved action in the host system.
8. Engine records result, errors, decisions, and metadata in the audit log.

## Design principles

- Project-agnostic core
- Explicit contracts over implicit assumptions
- Least-privilege access
- Human approval for risky actions
- Deterministic policy checks around non-deterministic AI decisions
- Full auditability
- Replaceable AI providers
- Adapter-based integrations
- Idempotent event processing where possible
- Safe failure and retry behavior

## Documents

- `docs/architecture.md` — proposed architecture and component boundaries
- `docs/module-contract.md` — host project manifest and adapter contract
- `docs/security.md` — permissions, approval, data access, and audit requirements
- `ROADMAP.md` — phased exploration and implementation roadmap

## Current status

Concept and architecture phase. No production implementation decisions are locked yet.
