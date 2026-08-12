# Feature Flags Module

**Version:** 0.1.0 (P0, experimental)
**Status:** Reusable embedded module — core + adapters implemented, docs stage.

## Architecture

This module is a **reusable embedded module** — not a standalone service or framework.
A Host project that needs runtime feature toggle control embeds this module into its own
codebase and wires it up by injecting a `FeatureFlagStore` implementation and configuration.

The module has one job: accept a `FeatureFlagQuery` that the Host constructs → validate
the flag key → look up the flag via the injected store → evaluate targeting rules → apply
deterministic fallback → return a typed `FeatureFlagResult` or degrade gracefully through
the error fallback path.

```
Business Logic
      ↓
Feature Flag Core
      ↓
Flag Store / Provider
```

### Architectural boundary

> **CRITICAL BOUNDARY:** Feature Flag is **NOT Subscription Entitlement.** Feature flags
> exist strictly for operational rollout control, emergency kill switches, pilot feature
> testing, temporary enable/disable toggles, internal testing, and runtime behavior
> modification. Entitlement determines whether a user or tenant has purchased or is
> authorized to access a feature based on billing plans or RBAC roles. Feature flags
> **MUST NEVER** be used as permission, RBAC, or billing entitlement engines.
>
> Concrete example: `new_dashboard_enabled` is a **feature flag** (rollout control).
> `can_use_ai_reply` is an **entitlement** (plan-based access). These are different
> systems with different lifecycles and must not be conflated.

### Host vs. module responsibilities

| Host must do | Module does |
|---|---|
| Read `process.env` / `env` / `globalThis` | Never touches env — receives configuration via `FeatureFlagConfig` |
| Inject the runtime `FeatureFlagStore` (Memory, Postgres, remote service) | Interacts with stores strictly through the `FeatureFlagStore` interface |
| Define tenant/user context resolution | Evaluates targeting against the provided `FeatureFlagContext` |
| Configure telemetry and diagnostic hooks | Emits sanitized evaluation results and diagnostics via logging hooks |
| Manage flag persistence and remote sync | Evaluates flags without managing storage state |

## Public API

All exports come from the module entry point `index.ts`. Do not import from sub-files directly.

```ts
import {
  createFeatureFlagClient,
  createMemoryFlagStore,
  FeatureFlagError,
} from './index.js';
import type {
  FeatureFlagClient,
  FeatureFlagConfig,
  FeatureFlagContext,
  FeatureFlagErrorCode,
  FeatureFlagLoggingHooks,
  FeatureFlagQuery,
  FeatureFlagResult,
  FeatureFlagStore,
  FlagTargetingRule,
  MemoryFeatureFlagStore,
  SanitizedFlagEvaluationInfo,
  StoredFlag,
} from './index.js';
```

### `createFeatureFlagClient(config?: FeatureFlagConfig): FeatureFlagClient`

Returns a `FeatureFlagClient` bound to the given configuration. `config` is optional; if
omitted or if `store` is not provided, the client defaults to an empty in-memory flag store
that always returns `null` for every key — all queries resolve through the default fallback
policy.

### `FeatureFlagClient` methods

Every method routes through a single evaluation pipeline. There are no secondary evaluation
paths — all key validation, store lookup, targeting evaluation, fallback resolution, error
catching, and hook notifications run exclusively through `getFlag()`.

```ts
interface FeatureFlagClient {
  isEnabled(query: FeatureFlagQuery): Promise<boolean>;
  getFlag(query: FeatureFlagQuery): Promise<FeatureFlagResult>;
}
```

**Pipeline guarantee:** `isEnabled(query)` internally calls `getFlag(query)` and returns
`result.enabled`. All logic runs in the single `getFlag()` pipeline — there are no bypasses
or secondary evaluation paths.

### `createMemoryFlagStore(initialFlags?: Record<string, StoredFlag | boolean>): MemoryFeatureFlagStore`

Returns a `MemoryFeatureFlagStore` pre-loaded with `initialFlags`. Boolean values are
auto-wrapped to `{ key, enabled: boolean }`. The returned store implements the full
`FeatureFlagStore` contract plus mutation methods.

```ts
interface MemoryFeatureFlagStore extends FeatureFlagStore {
  setFlag(key: string, flag: StoredFlag | boolean): void;
  removeFlag(key: string): void;
  clear(): void;
}
```

> **WARNING:** The Memory Adapter is an **in-memory, single-instance store** for automated
> tests, local development, and contract validation only. It is **NOT a distributed
> production flag store.** It does not synchronize across processes, serverless instances,
> or Cloudflare Workers. Inject a distributed store (Redis, Postgres, remote service
> adapter) for production.

## Config contract

### `FeatureFlagConfig`

```ts
type FeatureFlagConfig = {
  store?: FeatureFlagStore;
  defaultFallback?: boolean;
  hooks?: FeatureFlagLoggingHooks;
};
```

| Field | Default | Description |
|---|---|---|
| `store` | Empty store (always returns `null`) | The flag store implementation. Inject `createMemoryFlagStore(...)` for local development or a distributed store for production. |
| `defaultFallback` | `false` | Global fallback value used when a flag is missing and no `query.defaultValue` is provided. |
| `hooks` | `undefined` | Optional logging/telemetry hooks. Hook exceptions are silently swallowed and never affect evaluation outcome. |

> **CRITICAL RULE:** The module MUST NOT read `process.env`, `env`, or `globalThis.process`.
> All configuration is injected by the Host via `FeatureFlagConfig`.

### `FeatureFlagLoggingHooks`

```ts
type FeatureFlagLoggingHooks = {
  onEvaluation?: (info: SanitizedFlagEvaluationInfo) => void;
  onError?: (error: FeatureFlagError, query: FeatureFlagQuery) => void;
};

type SanitizedFlagEvaluationInfo = {
  key: string;
  context?: FeatureFlagContext;
  result: FeatureFlagResult;
  durationMs: number;
};
```

`onEvaluation` fires on every completed evaluation — including fallbacks and error paths.
`onError` fires when an evaluation error is caught (invalid key, provider error, invalid value).
Both hooks receive sanitized context: the `attributes` field is stripped before forwarding
to prevent raw user attribute leakage into logging sinks.

**Hook safety:** All hook calls are wrapped in `try { } catch { }`. An exception thrown
inside any hook is silently swallowed and never affects the evaluation outcome.

## Core types

### `FeatureFlagQuery`

```ts
type FeatureFlagQuery = {
  key: string;
  context?: FeatureFlagContext;
  defaultValue?: boolean;
};
```

### `FeatureFlagContext`

```ts
type FeatureFlagContext = {
  tenantId?: string;
  userId?: string;
  environment?: string;
  attributes?: Record<string, string | number | boolean>;
};
```

### `FeatureFlagResult`

```ts
type FeatureFlagResult = {
  key: string;
  enabled: boolean;
  source: 'store' | 'default_fallback' | 'error_fallback';
  reason: string;
};
```

| `source` | When it appears |
|---|---|
| `'store'` | Flag found in the store and evaluated (with or without a matching targeting rule) |
| `'default_fallback'` | Flag missing from the store — result is the configured fallback value |
| `'error_fallback'` | Key invalid, provider threw, or stored value was malformed — result is the configured fallback value |

`reason` is a sanitized high-level diagnostic label. It never contains sensitive internals,
SQL queries, internal IP addresses, database connection strings, or provider credentials.

### `StoredFlag`

```ts
type StoredFlag = {
  key: string;
  enabled: boolean;
  rules?: FlagTargetingRule[];
  metadata?: Record<string, unknown>;
};
```

### `FlagTargetingRule`

```ts
type FlagTargetingRule = {
  tenantId?: string;
  userId?: string;
  environment?: string;
  enabled: boolean;
};
```

All specified fields in a rule must match (AND semantics). Omitted fields are wildcards.

## Store contract

```ts
interface FeatureFlagStore {
  getFlag(key: string, context?: FeatureFlagContext): Promise<StoredFlag | null>;
}
```

The three possible outcomes the core depends on:

| Store behavior | Core action |
|---|---|
| Returns `StoredFlag` | Flag exists — proceed to targeting evaluation |
| Returns `null` | Flag missing — apply default fallback policy |
| Throws any exception | Wrapped as `FLAG_PROVIDER_ERROR` → caught by core → apply error fallback policy |

The Core does not know or depend on the underlying storage engine. The Host injects any
conforming `FeatureFlagStore` implementation via `createFeatureFlagClient({ store })`.
Compatible backends include: in-memory Map, PostgreSQL, Supabase, Redis, LaunchDarkly,
Unleash, or any remote HTTP config service.

## Default and fallback policy

Every flag query produces a deterministic boolean result without crashing host application
logic. Provider failures and missing flags are always absorbed by the fallback policy.

### Fallback value precedence

When a fallback is needed (flag missing or store error):

1. `query.defaultValue` — if explicitly provided as a boolean
2. `config.defaultFallback` — if defined during client initialization
3. `false` — safe system default

### Evaluation pipeline (step by step)

1. **Key validation.** If `key` is not a non-empty string → `FLAG_KEY_INVALID` → `onError`
   hook → return `source: 'error_fallback'`.
2. **Store lookup.** Call `store.getFlag(key, context)`.
   - Store throws → wrapped as `FLAG_PROVIDER_ERROR` → `onError` hook → return `source: 'error_fallback'`.
   - Store returns `null` → return `source: 'default_fallback'`, reason: `'Flag not found in store'`.
3. **Value validation.** Verify `StoredFlag` has a string `key` and boolean `enabled`. If
   invalid → `FLAG_VALUE_INVALID` → `onError` hook → return `source: 'error_fallback'`.
4. **Targeting.** Find the first `StoredFlag.rules` entry where all specified fields match
   `context` (exact match). If a rule matches → `enabled = rule.enabled`, reason:
   `'Matched targeting rule'`. If no rules match or no rules defined → `enabled = storedFlag.enabled`,
   reason: `'Evaluated flag default state'`.
5. **Hook notification.** `onEvaluation` fires in `finally` on every completed path.

## Targeting (v0.1)

Simple exact matching only. No percentage rollout, no regex, no expression trees, no numeric
comparisons, no JSON-logic — those are explicitly out of scope for v0.1.

```ts
// Rule: { tenantId: 'tenant-vip', environment: 'production', enabled: true }
// Context: { tenantId: 'tenant-vip', environment: 'production', userId: 'u-1' }
// → ALL specified rule fields match → rule applies → enabled: true

// Context: { tenantId: 'tenant-basic', environment: 'production' }
// → tenantId does not match → rule skipped → falls through to StoredFlag.enabled
```

Rules are evaluated in order; the first matching rule wins. If a rule specifies multiple
fields (e.g. `tenantId` and `environment`), the context must satisfy all of them.

## Caching and runtime mutability

The Core does not cache evaluation results internally. Store updates take effect
**immediately** on the very next `isEnabled()` or `getFlag()` call — no restart, no cache
purge, no client re-initialization required.

```ts
store.setFlag('beta-button', false);
await client.isEnabled({ key: 'beta-button' }); // false

store.setFlag('beta-button', true);
await client.isEnabled({ key: 'beta-button' }); // true — immediate
```

Parallel queries with different `FeatureFlagContext` objects (e.g. Tenant A vs Tenant B)
evaluate independently without leaking state across evaluations (independent context isolation).

## Structured errors

All explicit exceptions raised by the module implement `FeatureFlagError`.

```ts
class FeatureFlagError extends Error {
  readonly code: FeatureFlagErrorCode;
  readonly key?: string;
  readonly cause?: unknown;
}

type FeatureFlagErrorCode =
  | 'FLAG_KEY_INVALID'
  | 'FLAG_PROVIDER_ERROR'
  | 'FLAG_VALUE_INVALID';
```

### Error codes

| Code | Trigger condition | Handled via fallback or thrown? |
|---|---|---|
| `FLAG_KEY_INVALID` | `key` is null, undefined, empty string, or non-string | Handled via `error_fallback` + `onError` hook |
| `FLAG_PROVIDER_ERROR` | `FeatureFlagStore.getFlag()` throws any exception | Handled via `error_fallback` + `onError` hook |
| `FLAG_VALUE_INVALID` | Store returns a non-boolean `enabled` or malformed flag structure | Handled via `error_fallback` + `onError` hook |

During normal `isEnabled()` / `getFlag()` execution all three codes degrade gracefully to
the deterministic fallback. `FeatureFlagError` is available for direct inspection in
`onError` hooks or when a store implementation is used directly outside the evaluation
pipeline.

## Security

1. **No secret storage in flags.** Feature flags are boolean toggles. API keys, database
   credentials, passwords, JWT secrets, or access tokens MUST NEVER be stored in flag values
   or `StoredFlag.metadata`. Feature flags are not a secret management system.

2. **Client-side flag exposure.** `getFlag()` returns only public diagnostic metadata
   (`key`, `enabled`, `source`, `reason`). Sensitive server-side `StoredFlag` definitions
   (raw targeting rules, internal backend metadata) must not be forwarded to client bundles
   by the Host.

3. **Sanitized telemetry.** The `onEvaluation` hook receives context with `attributes`
   stripped. `reason` strings are high-level diagnostic labels; they never expose SQL
   queries, internal IP addresses, database connection strings, or provider credentials.

4. **No env access.** The module never reads `process.env`, `env`, or `globalThis.process`.
   All configuration is injected explicitly by the Host.

5. **Cloudflare Workers compatible.** Zero `node:*` imports. Uses standard Web APIs only
   (`Map`, `Date`, `Promise`). Runs unmodified on Cloudflare Workers, Node.js, Bun, and
   browser runtimes.

## How to integrate

### Steps

1. Copy the `feature-flags/` module folder into your repo.
2. Decide on a flag store: use `createMemoryFlagStore(...)` for local dev and tests;
   implement a distributed `FeatureFlagStore` for production.
3. Build a `FeatureFlagConfig` with your store, `defaultFallback`, and `hooks` — all
   values read from your own env or config, never from the module.
4. Call `createFeatureFlagClient(config)` to obtain a `FeatureFlagClient`.
5. Call `client.isEnabled({ key, context })` in your business logic.
6. Use the `onError` hook to route flag evaluation errors to your logging or alerting stack.
   Check `result.source === 'error_fallback'` if you need to distinguish degraded results
   from clean store evaluations.

### Quick reference

```ts
import { createFeatureFlagClient, createMemoryFlagStore, FeatureFlagError } from './index.js';

const store = createMemoryFlagStore({
  'new-checkout-flow': true,
  'beta-dashboard': {
    key: 'beta-dashboard',
    enabled: false,
    rules: [{ tenantId: 'tenant-vip', enabled: true }],
  },
});

const client = createFeatureFlagClient({
  store,
  defaultFallback: false,
  hooks: {
    onEvaluation: (info) => console.log(`[Flag] ${info.key} => ${info.result.enabled}`),
    onError: (err, query) => console.error(`[Flag Error] ${err.code} on '${query.key}'`),
  },
});

// Boolean check
const enabled = await client.isEnabled({ key: 'new-checkout-flow' });

// Full diagnostic result with targeting context
const result = await client.getFlag({
  key: 'beta-dashboard',
  context: { tenantId: 'tenant-vip' },
});
// { key: 'beta-dashboard', enabled: true, source: 'store', reason: 'Matched targeting rule' }

// Missing flag with explicit per-query default
const experimental = await client.isEnabled({
  key: 'not-registered',
  defaultValue: true,
});

// Runtime update — immediately visible on next query
store.setFlag('new-checkout-flow', false);

// Defensive catch (provider errors degrade to error_fallback in normal evaluation)
try {
  await client.getFlag({ key: 'some-flag' });
} catch (err) {
  if (err instanceof FeatureFlagError) {
    console.error(err.code, err.message);
  }
}
```

See `examples/integration.example.ts` for the complete wiring example.

### Integration checklist

- [ ] Copy the module folder into the target repo
- [ ] Do NOT use `createMemoryFlagStore` in production — inject a distributed `FeatureFlagStore`
- [ ] Set `defaultFallback: false` (safe default) unless your use case explicitly requires `true`
- [ ] Wire `hooks.onError` to your logging or alerting framework
- [ ] Wire `hooks.onEvaluation` to your telemetry or metrics pipeline
- [ ] Never store API keys, passwords, tokens, or credentials in flag values or metadata
- [ ] Never use feature flags as a substitute for subscription entitlement or RBAC permission checks
- [ ] Keep server-side `StoredFlag` definitions (targeting rules, metadata) out of client bundles
- [ ] Run `npm run typecheck` before deploy

## Versioning

Standard semver — bump the version in `VERSION` on every change. No CHANGELOG or migration
guide until the module has been embedded in ≥ 2 real projects and the contract has stabilized.

## Promote to shared package when

The module has been embedded in ≥ 2–3 projects without changes to the `core/` contract
(only store or config changes on the Host side) — then extract to an npm package.
