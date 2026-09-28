# feature-flags — Deterministic Runtime Feature Toggles for TypeScript

A small, dependency-free feature-flag evaluator you copy into your own project and own outright.
You inject a flag store, ask for a flag by key, and get back a boolean `enabled` through one
deterministic evaluation pipeline: key validation, store lookup, targeting rules, then fallback.
Provider failures and missing flags never throw into your application — they resolve to a
predictable fallback value instead.

Version 0.1.0. Public entry point: `index.ts`.

**Limitations / what this is NOT**

- The included memory store is single-instance; it does not synchronize flags across processes.
- There is no percentage rollout or remote sync.
- Flags are not permissions, RBAC or billing entitlements.

## install — Install (copy-and-own, 3 steps)

1. Copy the entire `feature-flags` module directory into your project, for example to
   `src/modules/feature-flags/`. Copy the directory whole: `index.ts`, `core/`, `adapters/`,
   `package.json`, `tsconfig.json`, tests and examples belong together. There is no published
   package for this module, so there is nothing to install from a registry — the copy *is* the
   dependency.
2. Optional, and only if you want to run the module's own tests and example in place: install its
   development tooling inside the copied directory with `npm ci`. Your application itself needs
   none of it.
3. Import the module through the entry point of your copy, and never through another repository's
   path:

   ```ts
   import { createFeatureFlagClient, createMemoryFlagStore } from './modules/feature-flags/index.js';
   ```

Keep the copy under your own version control. It is yours to edit, extend and rename.

## quickstart — Quickstart (first successful call)

From a copied module directory to a first evaluated flag, in one file:

```ts
// Path points at your copy, not at a shared repository.
import { createFeatureFlagClient, createMemoryFlagStore } from './modules/feature-flags/index.js';

// 1. A flag store. Boolean shorthand is auto-wrapped to { key, enabled }.
const store = createMemoryFlagStore({
  'new-checkout-flow': true,
});

// 2. The client. The module never reads env — you inject everything.
const client = createFeatureFlagClient({
  store,
  defaultFallback: false,
});

// 3. Ask for a flag. isEnabled() returns the boolean from the single getFlag() pipeline.
const enabled = await client.isEnabled({ key: 'new-checkout-flow' });
console.log(enabled); // true

// getFlag() returns the full diagnostic result instead:
// { key: 'new-checkout-flow', enabled: true, source: 'store', reason: 'Evaluated flag default state' }
```

Run the bundled, self-contained example with this exact command, from the module directory:

    npm run example

## example — Runnable Example

One command, no arguments, no network and no configuration:

    npm run example

It runs `examples/run.ts` through `vite-node` and prints the following. The last line starts with
`EXAMPLE_RESULT: OK` and reports only values the example actually measured during that run:

    new-checkout-flow             -> enabled=true source=store reason="Evaluated flag default state"
    beta-dashboard / tenant-vip   -> enabled=true source=store reason="Matched targeting rule"
    beta-dashboard / tenant-basic -> enabled=false source=store reason="Evaluated flag default state"
    not-registered                -> enabled=false source=default_fallback reason="Flag not found in store"
    not-registered + defaultValue -> enabled=true source=default_fallback reason="Flag not found in store"
    config defaultFallback=true   -> enabled=true source=default_fallback reason="Flag not found in store"
    setFlag runtime update       -> true=true thenFalse=false thenTrue=true
    invalid key "   "             -> enabled=false source=error_fallback reason="Invalid flag key"
    provider that throws          -> enabled=false source=error_fallback reason="Provider error: storage lookup failed"
    malformed stored value        -> enabled=false source=error_fallback reason="Invalid flag value"
    throwing hooks survived      -> true
    concurrent tenants isolated  -> vip=true other=false
    EXAMPLE_RESULT: OK evaluations=12 onErrorCalls=3 errorCodes=FLAG_KEY_INVALID+FLAG_PROVIDER_ERROR+FLAG_VALUE_INVALID flagsInStore=2 sources=store,store,store,default_fallback targetingRuleFired=true runtimeUpdateApplied=true throwingHooksIsolated=true tenantIsolation=true hookAttributesStripped=true errorClassOk=true

The example demonstrates the behaviours worth knowing before you wire the module up: a first
matching targeting rule wins, the three fallback levels resolve in order, `store.setFlag()` is
visible on the very next call, all three error codes degrade instead of throwing, a throwing hook
cannot change the outcome, concurrent tenants do not leak into each other, and hook payloads have
`attributes` stripped.

## limitations — Limitations (read this first)

- Store access is a single asynchronous call per evaluation, and the core never caches a result.
  Every `isEnabled()` / `getFlag()` call hits your `FeatureFlagStore`. That is what makes flag
  updates immediate, and it also means the store is on the hot path of every check — if your store
  is remote, so is your latency.
- Targeting is exact string matching only, in this version. A rule matches when every field it
  specifies (`tenantId`, `userId`, `environment`) equals the context value; omitted fields are
  wildcards. There is no percentage rollout, no regex, no expression tree, no numeric comparison
  and no JSON-logic.
- `createMemoryFlagStore()` is an in-memory, single-instance store. It is for tests, local
  development and contract validation only. It does not synchronize across processes, serverless
  instances or Cloudflare Workers. Inject a distributed `FeatureFlagStore` for production.
- Feature flags are not an entitlement system. Use them for rollout control, kill switches and
  pilots. Do not use them as permission, RBAC or billing-plan checks.
- Nothing is stored for you. The module does not persist flags, does not sync them from a remote
  config service, and has no admin UI, no scheduling and no audit history. Flags exist only in
  whatever store you inject.
- Flags are booleans. There is no A/B variant payload, no JSON value and no string flag. Anything
  richer has to be modelled by the Host around an `enabled` decision.
- No environment access. The module never reads `process.env`, `env` or `globalThis.process`, so
  nothing is configured unless you pass it in through `createFeatureFlagClient(config)`.

## api — Public API

Every export below comes from the module entry point `index.ts`. Do not import from sub-files.

Runtime exports:

- `createFeatureFlagClient(config?: FeatureFlagConfig): FeatureFlagClient` — factory returning a
  client bound to the given configuration; with no `store` it uses an empty store that always
  returns `null`, so every query resolves through the fallback policy.
- `createMemoryFlagStore(initialFlags?: Record<string, StoredFlag | boolean>): MemoryFeatureFlagStore`
  — in-memory store for tests and local development; boolean values are auto-wrapped to
  `{ key, enabled }`, and it adds `setFlag`, `removeFlag` and `clear` on top of the store contract.
- `FeatureFlagError` — error class implementing the module's structured error contract, carrying
  `code`, and optionally `key` and `cause`.

Type exports:

- `FeatureFlagClient` — the client interface: `isEnabled(query)` and `getFlag(query)`.
- `FeatureFlagConfig` — `store`, `defaultFallback` and `hooks`; all injected by the Host.
- `FeatureFlagContext` — the evaluation context: optional `tenantId`, `userId`, `environment` and
  `attributes`.
- `FeatureFlagErrorCode` — union of `'FLAG_KEY_INVALID'`, `'FLAG_PROVIDER_ERROR'`,
  `'FLAG_VALUE_INVALID'`.
- `FeatureFlagLoggingHooks` — optional `onEvaluation` and `onError` telemetry callbacks; a throwing
  hook is swallowed and never changes the evaluation outcome.
- `FeatureFlagQuery` — `{ key, context?, defaultValue? }`.
- `FeatureFlagResult` — `{ key, enabled, source, reason }` where `source` is `'store'`,
  `'default_fallback'` or `'error_fallback'`.
- `FeatureFlagStore` — the store contract: `getFlag(key, context?): Promise<StoredFlag | null>`.
- `FlagTargetingRule` — one exact-match rule: optional `tenantId`, `userId`, `environment` plus the
  required `enabled` it applies when it matches.
- `MemoryFeatureFlagStore` — `FeatureFlagStore` plus `setFlag(key, flag)`, `removeFlag(key)` and
  `clear()`.
- `SanitizedFlagEvaluationInfo` — what `onEvaluation` receives: `key`, sanitized `context`,
  `result` and `durationMs`.
- `StoredFlag` — a stored flag record: `key`, `enabled`, optional `rules` and optional `metadata`.

## tests — Tests

Run the suite from the module directory:

    npm test

Observed in this packaging round (2026-09-27), `npm test` exited 0 and reported:

- 7 test files, 142 tests, 0 failed. 130 tests are the pre-existing smoke and unit suite in 6 files,
  unchanged — none removed or reduced. 12 tests in `tests/docs-contract.test.ts` guard the customer
  documentation contract, and that file is the only test file added in this round.
- `npm test` maps to `vitest run`.
- `tests/docs-contract.test.ts` reads `README.md`, `README.th.md`, `MODULE.md`, `package.json`,
  `index.ts`, `core/error.ts` and `examples/run.ts` from disk, so deleting a required README
  section, breaking the install rule, documenting an export the entry point does not have, or
  dropping the example marker fails the suite.
- `npm run typecheck` maps to `tsc --noEmit`, includes `**/*.ts` (examples and tests included) and
  exits 0.

## strengths — Strengths

- Zero runtime dependencies. `package.json` declares no `dependencies` field at all, and no file in
  the module imports a `node:*` builtin, so nothing is pulled into your bundle beyond the module
  source itself. Only development tooling (`typescript`, `vitest`, `vite-node`) is declared, and
  only for running tests and the example.
- Deterministic fallback instead of crashes. `core/evaluator.ts` catches every invalid key, store
  exception and malformed value and resolves through a fixed precedence — `query.defaultValue`,
  then `config.defaultFallback`, then `false` — asserted in `tests/unit/evaluator.test.ts` and
  `tests/smoke.test.ts`.
- A typed, closed error model. All three codes (`FLAG_KEY_INVALID`, `FLAG_PROVIDER_ERROR`,
  `FLAG_VALUE_INVALID`) live in one union in `core/error.ts`, so you can branch on `error.code`
  passed to `onError` rather than parsing messages.
- The client exposes exactly one evaluation pipeline. `isEnabled()` calls `getFlag()` and returns
  `result.enabled`, so validation, store lookup, targeting, fallback and hooks cannot diverge
  between the two methods — asserted in `tests/unit/client.test.ts`.
- Hook payloads are sanitized before you log them. `core/evaluator.ts` strips `attributes` from the
  context forwarded to `onEvaluation`, so raw user attributes do not reach your logging sink —
  asserted in `tests/unit/evaluator.test.ts`.
- Hook failures are isolated. Every hook call is wrapped in `try`/`catch`, so a broken telemetry or
  alerting callback cannot change or crash an evaluation — asserted in `tests/unit/error.test.ts`
  and demonstrated by `npm run example`.
- Full source, not a black box. You copy the whole module, including its tests and a commented
  integration example, and can read or change every line.

## runtime — Runtime Requirements

- Runtime dependencies: none. `package.json` has no `dependencies` field, so the shipped source
  needs no third-party runtime package.
- Node builtins used: none. The module imports no `node:*` module; a search for `node:` in the
  module's `.ts` files returns no match.
- Platform APIs used: Web standards only — `Map` for the memory store, `Date` for evaluation
  timing, and `Promise` for the asynchronous store contract.
- Where it runs: anywhere a JavaScript/TypeScript runtime provides those APIs — Cloudflare Workers,
  modern browsers, Deno, Bun, and Node.js 18 or newer. The module is plain ESM with `.js`
  specifiers in relative imports, and type-checks under `moduleResolution: Bundler`.
- Where the example runs: `npm run example` uses `vite-node`, which is a development-only tool. It
  needs the module's development dependencies installed; it is not part of your application bundle.
- Where it does not apply: any store or workflow the module does not have. There is no persistence,
  no remote sync, no percentage rollout engine, no admin UI and no cross-process state, so those
  must come from the `FeatureFlagStore` you inject or from another system entirely.
