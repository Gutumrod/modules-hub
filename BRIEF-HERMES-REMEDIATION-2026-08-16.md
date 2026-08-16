# Module Hub — Hermes Remediation Brief (2026-08-16)

## Objective

Repair the verified module-boundary and configuration-contract defects, remove local agent debris, and leave `main` ready for a human-approved push. This is a source library: every module must remain independently copyable, testable, and host-configuration-driven.

This brief is intentionally one file so Hermes can split the independent work without creating contradictory per-module instructions.

## Verified Baseline — do not assume a newer state

- Repository: `D:\AI-Workspace\projects\modules-hub`
- Branch: `main`, clean working tree at verification time, `ahead 3` of `origin/main`.
- Unpushed commits: `08fba46`, `43d1bfa`, `5fceea7`.
- `git fetch --all --prune` completed on 2026-08-16 before this brief.
- `node scripts/check-module-consistency.mjs`: passed for 23 modules.
- `modules/auth`: `npm run typecheck` passed; `npm test` passed 30/30. Its runtime source has no direct environment, Node-runtime, or heavy-SDK dependency.
- `modules/payment`: `npm run typecheck` passed; `npm test` passed 17/17, but its tests do not cover the configuration failures below.

Before any edit, re-run at least:

```powershell
git status --short --branch
git log --oneline -5
git fetch --all --prune
```

If the current head or working tree differs materially from the baseline, stop and report the evidence to the user/Hermes coordinator. Do not overwrite another agent's work.

## Non-negotiable rules

1. Module Hub is a copy-and-own source library. A module must not use a relative import that resolves into another module directory.
2. Preserve framework-agnostic core logic, explicit contracts, dependency injection, and no direct host-secret/environment access from core code.
3. Fix only the paths assigned to the worker. Do not reformat unrelated files, upgrade dependencies, change versions, or regenerate lockfiles.
4. Do not use `git reset`, `git checkout --`, `git clean`, force-push, or delete branches.
5. Do not push `main` or delete remote branches. Those are user-authorized final actions only after the acceptance gates pass.
6. Do not run `npm ci` or all-module checks inside parallel workers unless assigned; use the existing local dependencies and targeted module commands.

## Parallel work packages

### A. Tenant-context test isolation

**Allowed paths**

- `modules/tenant-context/tests/unit/enterprise-auth-tenant.test.ts`

**Verified defect**

Line 3 imports `../../../auth-supabase/core/rbac.js`. Copying `tenant-context` alone makes this test resolve outside its module.

**Required change**

- Remove the foreign import and the two assertions that test `auth-supabase` behavior (`hasPermission` and `buildRlsContext`). They do not test tenant-context.
- Retain the dynamic tenant resolver test, which is local behavior.
- Do not copy RBAC implementation into tenant-context and do not add an inter-module dependency.

**Acceptance**

```powershell
Push-Location modules/tenant-context
npm run typecheck
npm test
Pop-Location
```

- No relative TypeScript import from `modules/tenant-context` resolves into a different `modules/<name>` directory.

### B. Job-retry test isolation

**Allowed paths**

- `modules/job-retry/tests/unit/persistence.test.ts`

**Verified defect**

Line 3 imports `../../../scheduler/adapters/distributed-lock`. The lock tests validate scheduler, not job-retry, and fail after copying job-retry alone.

**Required change**

- Remove the foreign `MemoryDistributedLock` import and the lock-specific test cases from this file.
- Retain the local `MemoryJobStorage` persistence and DLQ tests.
- Do not duplicate scheduler's lock implementation inside job-retry. A future integration test may live in a host project, not as a hidden module-to-module dependency here.

**Acceptance**

```powershell
Push-Location modules/job-retry
npm run typecheck
npm test
Pop-Location
```

- No relative TypeScript import from `modules/job-retry` resolves into another module directory.

### C. Payment / Stripe explicit-configuration repair

**Allowed paths**

- `modules/payment/adapters/stripe-adapter.ts`
- `modules/payment/core/error.ts` only if a precise public error code is required
- `modules/payment/tests/adapters/stripe-adapter.test.ts`

**Verified defects**

- `stripe-adapter.ts:195-196` silently substitutes `https://example.com/...` when the host omits Checkout `returnUrl` or `cancelUrl`.
- `stripe-adapter.ts:250,267,304,366` silently turns a malformed/missing Stripe response/event currency into `THB`.

**Required behavior**

1. When `useCheckoutSession` is enabled, require non-empty `request.returnUrl` and `request.cancelUrl`; never send `example.com` fallback URLs to Stripe.
2. For checkout-session lookup, payment-intent lookup, and refund results: a missing or blank provider currency must yield a structured `PaymentError`, not a guessed currency.
3. For `parsePaymentEvent`, preserve its existing result-returning contract: a missing or blank event currency must return `{ success: false, error: PaymentError }`, never a fabricated `THB` event.
4. Use a semantically correct error code. If the existing union cannot represent an invalid host request, add one minimal, documented code to `PaymentErrorCode` and test it; do not misuse `UNKNOWN_PAYMENT_ERROR` for a caller configuration error. For missing provider currency, `UNSUPPORTED_CURRENCY` is appropriate.
5. Keep valid currencies normalized to uppercase exactly as before. Do not introduce a module-level default currency; the existing core already owns its explicit `PaymentCoreConfig.defaultCurrency` policy.

**Required regression tests**

- Checkout creation rejects missing `returnUrl`.
- Checkout creation rejects missing `cancelUrl`.
- A valid checkout request serializes the supplied URLs and contains no `example.com` fallback.
- Missing currency in each result path does not return `THB` and produces the expected structured failure.
- Missing currency in an event returns `success: false` with a `PaymentError`.

Use an injected mock `fetch`; tests must not call Stripe's network.

**Acceptance**

```powershell
Push-Location modules/payment
npm run typecheck
npm test
Pop-Location
```

- `rg -n "example\\.com|\\|\\| 'THB'" modules/payment/adapters/stripe-adapter.ts` produces no fallback implementation match.

### D. Exact local-debris cleanup

**Allowed paths**

- Only the 17 files below and the five `coverage` directories below.
- Do not edit `.gitignore`; it already ignores these patterns. Do not use broad recursive cleanup commands.

**Remove these 16 agent scratch files**

1. `modules/audit-log/.codex-prompt.txt`
2. `modules/audit-log/.qwen-test-prompt.txt`
3. `modules/auth-supabase/.agy-design-prompt.txt`
4. `modules/event-bus/.codex-prompt.txt`
5. `modules/event-bus/.qwen-stage4-prompt.md`
6. `modules/feature-flags/.agy-design-prompt.md`
7. `modules/feature-flags/.codex-prompt.txt`
8. `modules/feature-flags/.qwen-test-prompt.txt`
9. `modules/file-storage/.codex-prompt.txt`
10. `modules/http-client/.claude-docs-prompt.txt`
11. `modules/http-client/.codex-prompt.txt`
12. `modules/http-client/.qwen-stage4-out.txt`
13. `modules/http-client/.qwen-stage4-prompt.txt`
14. `modules/payment/.agy-prompt.md`
15. `modules/product-catalog/.codex-prompt.txt`
16. `modules/webhook-receiver/.qwen-qa-prompt.md`

**Also remove this shortcut**

- `modules/product-catalog/modules - Shortcut.lnk`

**Remove only these generated coverage directories**

- `modules/config-runtime/coverage`
- `modules/event-bus/coverage`
- `modules/http-client/coverage`
- `modules/product-catalog/coverage`
- `modules/rate-limit/coverage`

All were untracked and ignored at verification time. Verify each explicit target exists before removal and report any path that does not.

**Acceptance**

```powershell
git ls-files | Select-String -Pattern '(^|/)(coverage/|\\.codex-prompt\\.txt$|\\.qwen-|\\.agy-|\\.claude-|.*\\.lnk$)'
```

- Command returns no tracked artifact.
- `rg --files -uu` with the listed scratch patterns returns no listed target.
- Only the approved explicit files/directories were removed.

## Integration owner — run after A through D are complete

The integration owner alone may edit:

- `HANDOFF.md` to replace stale audit notes with the actual completed state and exact verification evidence.
- `modules/auth/DESIGN.md` and `modules/auth/MODULE.md` only to remove the five verified trailing-whitespace lines reported by `git diff --check`; do not alter their meaning.

Run these gates from the repository root:

```powershell
node scripts/check-module-consistency.mjs
git diff --check
git status --short --branch
```

Then independently verify no cross-module relative imports remain in TypeScript source/tests. The scan must resolve every relative import and fail if its source and target lie under different `modules/<name>` directories; simple text matching is insufficient.

Run targeted module tests for `tenant-context`, `job-retry`, and `payment` again after integration. Preserve evidence: command, exit code, test count, and commit hash.

## Stop conditions

Stop and report before merging/pushing if any of these occurs:

- A worker needs to edit outside its allowed paths.
- A targeted test fails after the scoped repair.
- A foreign relative import remains or a new one appears.
- The working tree contains unexpected changes from another agent.
- The implementation requires a public API/version/dependency change beyond the narrow PaymentError addition described above.

## Human decision after all gates pass

Do not perform either action without explicit approval from the user:

1. `git push origin main` (currently publishes the three pre-existing commits plus this remediation work).
2. Delete merged branches. Verified merged candidates include local `codex/pr3-enterprise-fix`, local/remote `feat/register-line-oa-module-21`, and remote `feat/v0.3.0-enterprise-upgrade`.
