# AI Workflow Engine — DESIGN.md (v0.3.0 State Store Upgrade)

**Version:** 0.3.0
**Status:** ✅ Completed
**Documentation Authority:** Current version/status follow `../REGISTRY.md`; this document describes the module contract/design for that registered version.

**Language / runtime:** TypeScript, ES2022, strict mode, Edge-compatible.

---

## 1. Architectural Philosophy: Graceful Degradation
The **AI Workflow Engine v0.3.0** strictly adheres to the principle that **optional dependencies must never break core execution**. If an advanced provider (such as an LLM AI Provider or a persistent database) is missing or fails, the engine automatically falls back to deterministic, in-memory, or rule-based equivalents.

State persistence uses generic `StateStore<T>` contracts. Built-in memory storage deep-copies JSON-compatible values, while the Redis adapter injects a minimal typed client and normalizes serialization, malformed JSON, and operation failures.

---

## 2. Fallback Architecture

### 2.1 Intent Resolution Cascade
1. **Primary (AI Provider - Module 18):** If an AI Provider is injected, use LLM-based semantic intent extraction.
2. **Fallback (Rule-based / Regex):** If no AI Provider is present or if the LLM call fails, gracefully degrade to keyword/regex-based deterministic matching.

### 2.2 Storage & State Persistence Cascade
1. **Primary (Database / External Store):** If a storage adapter is provided, persist execution states and audit trails durably.
2. **Fallback (In-Memory Store):** If no store is provided, use an ephemeral `Map`-based store (volatile, but functional).

### 2.3 Action Execution Cascade
1. **Primary (Host Action Handler):** Execute host-defined action functions.
2. **Fallback (Default Dispatcher):** If an action handler is missing, record the action as a stub/log entry instead of throwing an unhandled exception.
