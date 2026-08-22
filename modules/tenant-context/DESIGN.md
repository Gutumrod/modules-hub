# Tenant Context Module — DESIGN.md (v0.3.0)

**Version:** 0.3.0 (P1)
**Status:** Implemented and verified against source (this file was previously truncated/incomplete — rewritten 2026-08-22 to match actual code, not the original agy-prompt template).
**Language / runtime:** TypeScript, ES2022, `type: module`. No runtime dependencies (only `typescript` + `vitest` as devDependencies).

---

## 1. Purpose & Architectural Objectives

The **Tenant Context Module** provides a standardized, immutable `TenantContext` contract for multi-tenant applications, plus a small set of adapters to turn incoming request headers into that contract. It does **not** implement Row Level Security binding, subdomain/custom-domain routing, or dynamic multi-source tenant resolution as part of its public API — see §6 (Non-Goals / Corrections) for what earlier drafts of this doc overclaimed.

> **Verified boundary:**
> - Core (`core/`) never reads env vars, headers, or network state directly — it only validates/freezes data handed to it.
> - `TenantContextManager` (in `core/manager.ts`) is the one piece that *does* read headers, via an injected `TenantHeaderReader` — it is framework-neutral (works with plain objects or the Fetch `Headers` class).
> - Explicit context passing is the default; there is **no** `AsyncLocalStorage`-based propagation anywhere in this module (confirmed: no matches for `AsyncLocalStorage` in the module tree).

---

## 2. TenantContext contract (exact, from `core/types.ts`)

```ts
export type TenantContext = {
  readonly tenantId: string;
  readonly actorId?: string;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly environment?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
};

export type CreateTenantContextInput = {
  tenantId: string;
  actorId?: string;
  requestId?: string;
  correlationId?: string;
  environment?: string;
  metadata?: Record<string, unknown>;
};

export type TenantContextConfig = {
  tenantIdPattern?: RegExp | string;
  allowedEnvironments?: string[];
  maxMetadataKeys?: number; // default 50
};

export interface TenantContextResolver<TInput = unknown> {
  resolve(input: TInput): Promise<TenantContext | null>;
}
```

`createTenantContext()` (`core/context.ts`) validates `tenantId` (non-empty string, optional pattern match), validates `environment` against `allowedEnvironments` if configured, strips metadata keys over `maxMetadataKeys`, strips any metadata key that collides with a canonical field (`tenantId`, `actorId`, `requestId`, `correlationId`, `environment` — this also blocks `__proto__` pollution, covered by `tests/unit/security.test.ts`), and returns an `Object.freeze()`d context.

## 3. Public API (exact signatures, from `core/index.ts` re-exports)

| Function | File | Behavior (verified) |
|---|---|---|
| `createTenantContext(input, config?)` | `core/context.ts` | Throws `TenantContextError` on invalid input; returns frozen `TenantContext` |
| `validateTenantContext(input, config?)` | `core/validation.ts` | Never throws; returns `{ success: true, context }` or `{ success: false, error }` |
| `requireTenantContext(input, config?)` | `core/validation.ts` | Throws `TenantContextError` (`TENANT_CONTEXT_REQUIRED` if null/undefined, else delegates to `validateTenantContext`) |
| `withTenantContext(context, fn)` | `core/scope.ts` | **Trivial pass-through**: `return await fn(context)`. No storage, no isolation logic beyond what the caller already has. |

## 4. Adapters (exact signatures, from `adapters/`)

| Export | File | Exported from package root? |
|---|---|---|
| `TenantContextManager` | `core/manager.ts` | Yes (via `core/index.ts`) |
| `HeaderTenantResolver` | `adapters/header-resolver.ts` | Yes (via `adapters/index.ts`) |
| `createExpressLikeTenantMiddleware(manager)` | `adapters/express-like-middleware.ts` | Yes (via `adapters/index.ts`) |
| `DynamicTenantResolver` | `adapters/dynamic-resolver.ts` | **No** — implemented, has one passing unit test (`tests/unit/enterprise-auth-tenant.test.ts`), but `adapters/index.ts` does not re-export it. Unreachable from `import ... from '@module-hub/tenant-context'`; requires a deep import of the file path. |

`TenantContextManager.resolve({ headers, defaultEnvironment? })` reads `x-tenant-id` (falls back to `x-organization-id`) and `x-environment` off a `TenantHeaderReader` (`{ get(name): string | null | undefined }`), then runs the result through `validateTenantContext()`.

`createExpressLikeTenantMiddleware(manager)` wraps that in an `(req, res, next)` handler: sets `req.tenantContext` on success, responds `400` with `{ error: { code, message } }` for `TenantContextError`, `500` for anything else.

`DynamicTenantResolver` (unexported) keeps an in-memory `Map` of tenants and a hostname→tenantId map (`registerTenant`, `resolveFromHeader`, `resolveFromHostname`); this is where the `TenantInfo` / `TenantResolver` types in `core/types.ts` are actually consumed.

## 5. Error model (from `core/error.ts`)

`TenantContextError extends Error`, fields: `code`, `details?`, `cause?`. Codes actually used in source:
- `TENANT_CONTEXT_REQUIRED`
- `TENANT_ID_INVALID`
- `TENANT_CONTEXT_INVALID`
- `TENANT_RESOLUTION_FAILED` — declared in the type union but **not thrown anywhere** in current source (grep confirms no usage outside the type definition).

## 6. Non-Goals / corrections to the original design

An earlier version of this file (written from a template before implementation) claimed the module provides "dynamic tenant resolution (Subdomain, Custom Domain, Headers)" and "Row Level Security (RLS) context binding" as core objectives. Neither is accurate for the *public* API:

- **RLS binding**: not implemented anywhere in this module. No RLS-related code exists in `core/` or `adapters/`.
- **Subdomain / custom-domain resolution**: exists only inside the unexported `DynamicTenantResolver` (§4) — not reachable through the package entry point.
- Authentication, authorization, membership checks, tenant CRUD, billing, and DB connection routing remain explicit non-goals, consistent with the original brief (`agy-prompt.md`).

## 7. Test status (verified 2026-08-22)

`npm test` (vitest run): **20/20 tests passing**, 6 files — `context.test.ts` (4), `validation.test.ts` (4), `manager.test.ts` (5), `express-like-middleware.test.ts` (3), `security.test.ts` (3), `enterprise-auth-tenant.test.ts` (1, covers the unexported `DynamicTenantResolver`).

`npm run typecheck` (`tsc --noEmit`): clean, no errors.
