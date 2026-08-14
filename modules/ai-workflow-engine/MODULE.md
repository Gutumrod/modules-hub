# Module 20: AI Workflow Engine (v0.3.0)

Project-agnostic AI orchestration and workflow engine for Module Hub.

## Features
- **Project-Agnostic Manifest:** Host defines actions, context providers, and approval policies.
- **Workflow Runtime:** Evaluates triggers (event or conversation) and coordinates execution.
- **Human-in-the-Loop:** Built-in support for pending approval workflows on high-risk actions.
- **Default Adapters:** Intent resolution and action execution stubs.
- **State Stores:** Generic memory state and a typed Redis adapter with structured failures.

## Usage
Refer to `examples/integration.example.ts`.
