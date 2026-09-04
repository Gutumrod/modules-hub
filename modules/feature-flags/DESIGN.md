# Feature Flags Module — DESIGN.md

**Version:** 0.1.0
**Status:** ✅ Completed
**Documentation Authority:** Current version/status follow `../REGISTRY.md`; this document describes the module contract/design for that registered version.

**Language / runtime:** TypeScript, ES2022, strict mode, `moduleResolution: Bundler`. Must run on Cloudflare Workers (no `node:*` imports; Web APIs only).

---

## 1. Purpose

A central, decoupled contract for runtime on/off feature toggling across the Module Hub monorepo. It enables applications and services to dynamically toggle features, execute rollout kill-switches, conduct pilot tests, and manage temporary feature states at runtime without hardcoding business logic to a specific storage backend or remote flag provider.

The architecture follows a strict layered design:

```
Business Logic
      ↓
Feature Flag Core
      ↓
Flag Store / Provider
```

### Architectural Boundary

> **CRITICAL BOUNDARY:** Feature Flag is **NOT Subscription Entitlement**. Feature flags exist strictly for operational rollout control, emergency kill switches, pilot feature testing, temporary enable/disable toggles, internal testing, and runtime behavior modification. Entitlement determines whether a user or tenant has purchased or is authorized to access a feature based on billing plans or role RBAC. Feature flags MUST NEVER be used as permission, RBAC, or billing entitlement engines.

### Host responsibilities vs module responsibilities

| Host does | Module does |
|---|---|
| Reads `process.env` / `env` / `globalThis` | Never touches env — receives configuration via `FeatureFlagConfig` |
| Injects the runtime `FeatureFlagStore` (e.g. Memory, Postgres, remote service) | Interacts with stores strictly through the `FeatureFlagStore` interface |
| Defines tenant/user context resolution | Evaluates targeting against provided `FeatureFlagContext` |
| Configures telemetry & diagnostic hooks | Emits sanitized evaluation results and diagnostics via logging hooks |
| Manages flag persistence / remote sync | Evaluates flags synchronously/asynchronously without managing storage state |

---

## 2. Public API (exact signatures)

All public types and functions are exported from the module's entry point (`index.ts` and `core/index.ts`).

```ts
// core/client.ts
export function createFeatureFlagClient(config?: FeatureFlagConfig): FeatureFlagClient;

// FeatureFlagClient Interface
export interface FeatureFlagClient {
  /**
   * Evaluates a feature flag and returns a boolean state.
   * Shortcut for getFlag(), extracting the `enabled` field.
   */
  isEnabled(query: FeatureFlagQuery): Promise<boolean>;

  /**
   * Evaluates a feature flag and returns full diagnostic metadata.
   */
  getFlag(query: FeatureFlagQuery): Promise<FeatureFlagResult>;
}

// adapters/memory-store.ts
export function createMemoryFlagStore(initialFlags?: Record<string, StoredFlag | boolean>): MemoryFeatureFlagStore;

export interface MemoryFeatureFlagStore extends FeatureFlagStore {
  setFlag(key: string, flag: StoredFlag | boolean): void;
  removeFlag(key: string): void;
  clear(): void;
}
```

### 2.1 Pipeline Guarantee

Both `isEnabled()` and `getFlag()` share **one single evaluation pipeline** through the core.
- `isEnabled(query)` MUST internally invoke `getFlag(query)` and return `result.enabled`.
- All key validation, store lookup, targeting evaluation, fallback resolution, error catching, diagnostic mapping, and hook notifications execute strictly within the single `getFlag()` pipeline. There are no bypasses or secondary evaluation paths.

---

## 3. Exact Core Types

```ts
/** Context passed with a feature flag query to evaluate targeting rules */
export type FeatureFlagContext = {
  tenantId?: string;
  userId?: string;
  environment?: string;
  attributes?: Record<string, string | number | boolean>;
};

/** Input query options for evaluating a feature flag */
export type FeatureFlagQuery = {
  key: string;
  context?: FeatureFlagContext;
  defaultValue?: boolean;
};

/** Detailed evaluation result returned by getFlag() */
export type FeatureFlagResult = {
  key: string;
  enabled: boolean;
  source: 'store' | 'default_fallback' | 'error_fallback';
  reason: string;
};

/** Targeted rule for v0.1 simple exact matching */
export type FlagTargetingRule = {
  tenantId?: string;
  userId?: string;
  environment?: string;
  enabled: boolean;
};

/** Representation of a flag record stored in a FeatureFlagStore */
export type StoredFlag = {
  key: string;
  enabled: boolean;
  rules?: FlagTargetingRule[];
  metadata?: Record<string, unknown>;
};

/** Abstract Store contract injected by Host */
export interface FeatureFlagStore {
  getFlag(key: string, context?: FeatureFlagContext): Promise<StoredFlag | null>;
}

/** Logging & Telemetry Hooks */
export type SanitizedFlagEvaluationInfo = {
  key: string;
  context?: FeatureFlagContext;
  result: FeatureFlagResult;
  durationMs: number;
};

/** Logging hooks interface */
export type FeatureFlagLoggingHooks = {
  onEvaluation?: (info: SanitizedFlagEvaluationInfo) => void;
  onError?: (error: FeatureFlagError, query: FeatureFlagQuery) => void;
};

/** Host-injected client configuration */
export type FeatureFlagConfig = {
  /** Feature flag store implementation (Defaults to empty memory store) */
  store?: FeatureFlagStore;
  /** Global default fallback value if none provided in query (Default: false) */
  defaultFallback?: boolean;
  /** Logging and telemetry hooks */
  hooks?: FeatureFlagLoggingHooks;
};
```

---

## 4. Store Contract Design

The Core pipeline relies on the `FeatureFlagStore` abstraction interface:

```ts
export interface FeatureFlagStore {
  getFlag(key: string, context?: FeatureFlagContext): Promise<StoredFlag | null>;
}
```

1. **Storage Decoupling:** Core does NOT know, depend on, or assume any underlying storage engine (in-memory Map, PostgreSQL, Supabase, Redis, LaunchDarkly, Unleash, or remote HTTP config service).
2. **Host Dependency Injection:** The Host constructs and passes the desired `FeatureFlagStore` implementation to `createFeatureFlagClient({ store })`.
3. **Store Contract Rules:**
   - Returning `StoredFlag`: The flag exists in storage.
   - Returning `null`: The flag is missing/unregistered in storage.
   - Throwing an exception: The store encountered a runtime error (e.g. database disconnect, network timeout). The Core catches this exception and handles it via the Error Contract and Default Fallback Policy.

---

## 5. Memory Adapter Design

The `MemoryFeatureFlagStore` is provided in `adapters/memory-store.ts` for testing, local development, and contract validation.

### 5.1 Clear Non-Production Declaration

> **WARNING / DECLARATION:** The Memory Adapter is strictly an **in-memory, single-instance store** intended exclusively for automated unit tests, local development, and contract validation. It is **NOT a distributed production flag store**. It does not synchronize state across multi-process Node services, serverless instances, or Cloudflare Workers. Production implementations MUST wait for a real project pilot and inject a distributed store (e.g. Redis, Postgres, or remote service adapter).

### 5.2 Mechanics & Dynamic Runtime Updates

- Internally backed by a standard JavaScript `Map<string, StoredFlag>()`.
- Exposes `setFlag(key, flag)`, `removeFlag(key)`, and `clear()` to modify flags dynamically at runtime.
- Accepts initial flags during instantiation: `createMemoryFlagStore({ 'new-ui': true, 'beta-feature': { key: 'beta-feature', enabled: false } })`.
- When `setFlag(key, boolean)` is passed a plain boolean, it auto-wraps it into `{ key, enabled: boolean }`.
- Immediate visibility guarantee: Updates made via `setFlag()` are immediately visible to subsequent `getFlag()` queries without requiring client re-initialization or cache purging.

---

## 6. Default Fallback & Evaluation Policy

Every feature flag evaluation MUST produce a deterministic boolean result without crashing host application logic.

### 6.1 Evaluation Algorithm Pipeline

1. **Validate Key:** Validate `key`. If invalid (empty, non-string), trigger Error Contract -> return fallback result with `source: 'error_fallback'` and code `FLAG_KEY_INVALID`.
2. **Query Store:** Call `store.getFlag(key, context)`.
   - If store throws an error: catch exception -> trigger `onError` hook -> return fallback result with `source: 'error_fallback'` and `reason: 'Provider error: <sanitized message>'`.
   - If store returns `null` (missing flag): return fallback result with `source: 'default_fallback'` and `reason: 'Flag not found in store'`.
3. **Targeting Evaluation:** If store returns `StoredFlag`:
   - Inspect `StoredFlag.rules`. If rules exist and context is provided, find the first matching rule based on simple exact matching (`tenantId`, `userId`, `environment`).
   - If a rule matches, evaluate `enabled = rule.enabled` with `source: 'store'` and `reason: 'Matched targeting rule'`.
   - If no rules match or no rules defined, evaluate `enabled = StoredFlag.enabled` with `source: 'store'` and `reason: 'Evaluated flag default state'`.
4. **Fallback Value Order of Precedence:**
   If a fallback is needed (missing flag or store error):
   - 1st Priority: `query.defaultValue` (if explicitly defined as a boolean).
   - 2nd Priority: `config.defaultFallback` (if defined during client initialization).
   - 3rd Priority: `false` (safe system default).

### 6.2 Non-Crashing Guarantee & Reason Safety

- Store failures or missing flag configurations MUST NOT throw unhandled exceptions to the caller when a valid fallback policy exists.
- The `reason` string in `FeatureFlagResult` MUST NEVER expose sensitive internal secrets, SQL queries, internal IP addresses, database connection strings, or provider access keys. Reasons are strictly high-level diagnostic labels (e.g. `'Flag not found in store'`, `'Provider error: storage timeout'`, `'Matched targeting rule'`).

---

## 7. Targeting & Segmentation Rules (v0.1)

In v0.1, complex rule evaluation engines (such as percentage rollouts, multivariate variations, or regex expression trees) are explicitly **Out of Scope**.

### 7.1 Simple Exact Matching

Targeting is restricted to exact equality matching against `FeatureFlagContext`:

- `tenantId`: Matches if `rule.tenantId === context.tenantId`.
- `userId`: Matches if `rule.userId === context.userId`.
- `environment`: Matches if `rule.environment === context.environment`.

If a rule specifies multiple fields (e.g. `{ tenantId: 'tenant-123', environment: 'production', enabled: true }`), ALL specified fields in the rule MUST match the corresponding properties in `FeatureFlagContext`.

---

## 8. Caching & Runtime Mutability

- **No Stale Caching in Core:** In v0.1, the Feature Flag Core MUST NOT cache evaluation results internally without invalidation mechanisms.
- **Runtime Mutability:** Because Core does not cache flags, any runtime update made in the underlying store (e.g. `memoryStore.setFlag('beta-button', true)`) takes effect **immediately** on the very next `isEnabled()` or `getFlag()` call.
- **Independent Context Isolation:** Parallel flag queries with different `FeatureFlagContext` objects (e.g. Tenant A vs Tenant B) must evaluate independently without leaking state across evaluations.

---

## 9. Structured Error Handling

All explicit exceptions thrown by the core implement `FeatureFlagError`.

```ts
export class FeatureFlagError extends Error {
  readonly code: FeatureFlagErrorCode;
  readonly key?: string;
  readonly cause?: unknown;

  constructor(options: {
    message: string;
    code: FeatureFlagErrorCode;
    key?: string;
    cause?: unknown;
  });
}

export type FeatureFlagErrorCode =
  | 'FLAG_KEY_INVALID'
  | 'FLAG_PROVIDER_ERROR'
  | 'FLAG_VALUE_INVALID';
```

### Error Codes & Behavior

| Code | Trigger Condition | Handled via Fallback or Thrown? |
|---|---|---|
| `FLAG_KEY_INVALID` | `key` is null, undefined, empty string, or non-string | Handled via fallback (returns `source: 'error_fallback'`, logs via `onError`) |
| `FLAG_PROVIDER_ERROR` | `FeatureFlagStore.getFlag()` throws an unhandled exception | Handled via fallback (returns `source: 'error_fallback'`, logs via `onError`) |
| `FLAG_VALUE_INVALID` | Store returns a non-boolean flag value or invalid flag structure | Handled via fallback (returns `source: 'error_fallback'`, logs via `onError`) |

If a caller explicitly requires error throwing (or if validation occurs during setup), `FeatureFlagError` provides structured details. During normal `isEnabled()` / `getFlag()` query execution, provider failures and invalid values degrade gracefully to the deterministic default fallback, triggering `onError` hooks for observability.

---

## 10. Config Contract

Configurations MUST be injected by the host application via `FeatureFlagConfig`.

```ts
const client = createFeatureFlagClient({
  store: memoryStore,
  defaultFallback: false,
  hooks: {
    onEvaluation: (info) => console.log(`Flag ${info.key}: ${info.result.enabled}`),
    onError: (err, query) => console.error(`Flag error on ${query.key}: ${err.code}`),
  },
});
```

### Direct Environment Access Prohibition

> **CRITICAL RULE:** The Feature Flag module MUST NOT read `process.env`, `env`, or `globalThis.process.env`. All configuration parameters (stores, fallback defaults, environment names) are passed explicitly by the Host application.

---

## 11. Security & Data Protection

1. **No Secret Storage in Flags:** Feature flags are intended strictly for boolean toggles, simple targeting rules, and public non-sensitive metadata. API keys, database credentials, passwords, JWT secrets, or tokens MUST NEVER be stored in feature flag values or metadata.
2. **Client-Side Flag Exposure Prevention:** Sensitive server-side flag definitions (such as internal targeting rules or backend kill-switch flags) MUST NOT expose full raw store definitions to client bundles. `getFlag()` only returns public diagnostic metadata (`key`, `enabled`, `source`, `reason`).
3. **Sanitized Telemetry:** Logging hooks sanitize `context` and `reason`, ensuring no raw query parameters or private user attributes leak into external logging sinks.
4. **Cloudflare Workers & Edge Compatibility:**
   - Zero Node.js built-in dependencies (`node:fs`, `node:crypto`, `node:path`).
   - Uses standard Web APIs only.

---

## 12. File Structure

The module directory layout strictly matches the Module Hub monorepo standard:

```
modules/feature-flags/
├── MODULE.md
├── VERSION
├── package.json
├── tsconfig.json
├── index.ts
├── core/
│   ├── index.ts
│   ├── client.ts
│   ├── types.ts
│   ├── error.ts
│   ├── evaluator.ts
│   └── targeting.ts
├── adapters/
│   ├── index.ts
│   └── memory-store.ts
├── tests/
│   ├── unit/
│   │   ├── client.test.ts
│   │   ├── evaluator.test.ts
│   │   ├── targeting.test.ts
│   │   └── error.test.ts
│   └── adapters/
│       └── memory-store.test.ts
└── examples/
    └── integration.example.ts
```

---

## 13. Test Requirements (for Stage 3 Tester)

The test suite must be implemented using `vitest` in `tests/`. Downstream agents MUST verify every enumerated test case:

| Test File | Test Case Name | Assertion / Expected Outcome |
|---|---|---|
| `client.test.ts` | `flag true` | Registered flag set to `true` resolves `isEnabled()` to `true` and `getFlag()` with `source: 'store'`. |
| `client.test.ts` | `flag false` | Registered flag set to `false` resolves `isEnabled()` to `false` and `getFlag()` with `source: 'store'`. |
| `client.test.ts` | `missing flag` | Querying unregistered flag returns `defaultValue` (or global default) with `source: 'default_fallback'`. |
| `client.test.ts` | `default true` | Missing flag with `defaultValue: true` returns `true`. |
| `client.test.ts` | `default false` | Missing flag with `defaultValue: false` returns `false`. |
| `targeting.test.ts` | `tenant context` | Query with matching `tenantId` rule evaluates to rule's boolean state; non-matching tenant gets flag default. |
| `targeting.test.ts` | `user context` | Query with matching `userId` rule evaluates to rule's boolean state. |
| `targeting.test.ts` | `environment context` | Query with matching `environment` rule evaluates correctly across dev/prod contexts. |
| `client.test.ts` | `provider failure` | When `FeatureFlagStore.getFlag()` throws, query degrades to fallback, returns `source: 'error_fallback'`, and calls `onError` hook. |
| `error.test.ts` | `invalid value` | Store returning malformed/non-boolean flag value triggers `FLAG_VALUE_INVALID` fallback and `onError` hook. |
| `error.test.ts` | `invalid key` | Passing empty/invalid flag key triggers `FLAG_KEY_INVALID` fallback and `onError` hook. |
| `memory-store.test.ts` | `memory update visible at runtime` | Calling `memoryStore.setFlag('key', true)` dynamically changes subsequent `isEnabled('key')` from `false` to `true`. |
| `client.test.ts` | `independent contexts` | Concurrent queries with different tenant/user contexts return independent, correct evaluation results. |

---

## 14. `integration.example.ts` Reference Shape

```ts
import {
  createFeatureFlagClient,
  createMemoryFlagStore,
  FeatureFlagError,
} from '../index.js';

// 1. Initialize store (Memory Store for development/testing)
const store = createMemoryFlagStore({
  'new-checkout-flow': true,
  'beta-dashboard': {
    key: 'beta-dashboard',
    enabled: false,
    rules: [
      { tenantId: 'tenant-vip', enabled: true },
      { environment: 'staging', enabled: true },
    ],
  },
});

// 2. Initialize Feature Flag Client with host configuration
const client = createFeatureFlagClient({
  store,
  defaultFallback: false,
  hooks: {
    onEvaluation: (info) =>
      console.log(`[Flag Evaluation] ${info.key} => ${info.result.enabled} (source: ${info.result.source})`),
    onError: (err, query) =>
      console.error(`[Flag Error] ${err.code} on key '${query.key}': ${err.message}`),
  },
});

async function run() {
  // Simple flag check
  const isCheckoutEnabled = await client.isEnabled({ key: 'new-checkout-flow' });
  console.log('Is new checkout enabled?', isCheckoutEnabled); // true

  // Targeted flag check with tenant context
  const vipDashboardResult = await client.getFlag({
    key: 'beta-dashboard',
    context: { tenantId: 'tenant-vip', environment: 'production' },
  });
  console.log('VIP Dashboard Result:', vipDashboardResult);
  // { key: 'beta-dashboard', enabled: true, source: 'store', reason: 'Matched targeting rule' }

  // Missing flag check with explicit default fallback
  const missingFlagState = await client.isEnabled({
    key: 'experimental-ai-feature',
    defaultValue: true,
  });
  console.log('Missing flag state (defaulted):', missingFlagState); // true

  // Dynamic runtime update
  store.setFlag('beta-dashboard', true);
  const updatedResult = await client.isEnabled({ key: 'beta-dashboard' });
  console.log('Beta Dashboard state after runtime store update:', updatedResult); // true
}

run();
```

---

## 15. `package.json` and `tsconfig.json`

### `package.json`
```json
{
  "name": "@module-hub/feature-flags",
  "version": "0.1.0",
  "type": "module",
  "main": "./index.ts",
  "exports": {
    ".": "./index.ts"
  },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.6.3",
    "vitest": "^2.1.4"
  }
}
```

### `tsconfig.json`
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "skipLibCheck": true,
    "noImplicitOverride": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  },
  "include": ["**/*.ts"]
}
```

---

## 16. Explicit Non-Goals

The following features are **explicitly out of scope** for v0.1.0 of the Feature Flags module:

- **A/B Test Analytics & Conversion Tracking:** No event emission, impression tracking, or conversion rate statistics.
- **Experimentation Engine:** No sample allocation, statistical significance metrics, or multivariate split engines.
- **Subscription / Billing Entitlement Engine:** Entitlements and plan limits MUST remain in dedicated subscription/billing services.
- **Permission & RBAC Engine:** User permissions and access control lists belong strictly to authentication/authorization modules.
- **Remote Admin Dashboard:** No web UI, GUI management portal, or remote flag admin dashboard.
- **Secret Management / Credentials Storage:** Flag values are boolean toggles only; secrets MUST NOT be placed in flag structures.
- **Complex Segmentation Rules:** No JSON-logic evaluation, regex matching, numeric comparison operators (`>`, `<`), or custom expression ASTs in v0.1.
- **Percentage Rollout:** No hashing algorithms (e.g. MurmurHash) for percentage-based rollouts in v0.1.
- **Multivariate Flags:** Boolean flags only in v0.1 (`true` / `false`). No string, number, or JSON variant payload flags.

---

## 17. Acceptance Criteria (for Stage 4 Reviewer)

A Stage 4 Reviewer MUST verify all of the following criteria before approving the module:

1. [ ] **File Location:** Deliverable exists at `D:\AI-Workspace\projects\modules-hub\modules\feature-flags\DESIGN.md`.
2. [ ] **Runtime Independence:** Core code has zero environment reads (`process.env`) and zero `node:*` imports.
3. [ ] **Store Abstraction:** `FeatureFlagStore` interface is strictly enforced, and `createMemoryFlagStore` clearly declares it is NOT a distributed production store.
4. [ ] **Single Pipeline:** Both `isEnabled()` and `getFlag()` execute through the single `getFlag()` core pipeline.
5. [ ] **Deterministic Fallback:** Missing flags or provider failures fallback safely to explicit `defaultValue`, then `config.defaultFallback`, then `false`.
6. [ ] **Targeting (v0.1):** Supports simple exact matching on `tenantId`, `userId`, and `environment`.
7. [ ] **Runtime Mutability:** Updates to the store take immediate effect at runtime without caching stale states.
8. [ ] **Structured Errors:** `FLAG_KEY_INVALID`, `FLAG_PROVIDER_ERROR`, and `FLAG_VALUE_INVALID` error codes are defined and gracefully handled via fallback/hooks.
9. [ ] **Security & Boundary:** Feature Flags are separated from Billing Entitlements; reasons contain no sensitive internal secrets.
10. [ ] **Test Suite Passing:** All 13 enumerated test cases pass cleanly with `vitest`.
