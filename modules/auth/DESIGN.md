# Data-Agnostic Auth Module — DESIGN.md

**Package Name:** `@module-hub/auth`  
**Version:** 0.1.0  
**Status:** Design (Stage 1 — Architect). This file is the single source of truth for downstream agents (Stage 2 implementer, Stage 3 tester, Stage 4 reviewer).  
**Language / runtime:** TypeScript, ES2022, strict mode, `moduleResolution: Bundler`. Must run on Cloudflare Workers, Node.js, Deno, and Bun (no `node:*` imports; standard Web APIs only).

---

## 1. Purpose

A universal, data-agnostic and login-agnostic **Authentication and Authorization Helper Module** for the Module Hub monorepo.

While previous modules (such as `@module-hub/auth-supabase`) were permanently hardcoded to a single BaaS vendor (Supabase Auth), `@module-hub/auth` provides a completely provider-agnostic core. It allows any project—whether using Supabase, a custom PostgreSQL database, MongoDB, in-memory credential stores, third-party OAuth, or custom JWT tokens—to leverage a single, battle-tested standard for authentication verification, identity normalization (`AuthContext`), Role-Based Access Control (RBAC), Permission-Based Access Control (PBAC), and multi-tenant boundary isolation.

### Layered Architecture Diagram

```
Host Application / Route Handlers (Express, Fastify, Next.js, Cloudflare Workers, Hono)
       ↓
Auth Core API (getCurrentUser, requireUser, requireRole, requirePermission, requireTenantMembership)
       ↓
Identity Normalizer Pipeline (Normalizes TRawIdentity → Normalized AuthContext)
       ↓
IdentityProvider Interface (resolve(credential) => Promise<TRawIdentity | null>)
       ↓
Concrete Adapters (injected with Host data stores or verification callbacks)
 ├── SupabaseAdapter (Wraps Supabase client auth.getUser for parity/migration)
 ├── CredentialStoreAdapter (Host injects verify(credential) callback — DB/Memory/ORM)
 └── JwtAdapter (Host injects verifyToken(token) callback — JWT verification)
```

### Architectural Boundary

> **CRITICAL BOUNDARY:** This module is strictly an **identity resolution and authorization guard layer**. It MUST NOT store user passwords, execute hashing algorithms (e.g. bcrypt/argon2), generate or sign JWTs, or manage secret keys directly. The host application or chosen identity provider retains 100% ownership over password hashing, secret storage, and cryptographic signing. The module receives credentials or tokens, passes them to an injected `IdentityProvider`, normalizes the resulting identity into a standard `AuthContext`, and enforces authorization guards on business logic.

### Host Responsibilities vs Module Responsibilities

| Host does | Module does |
|---|---|
| Manages environment variables and secrets (`process.env`, Cloudflare Worker `env`, secret vaults) | Never touches env or secrets — receives configuration, providers, and callbacks via dependency injection |
| Owns database connections, ORMs (Prisma, Drizzle, Kysely), and password verification algorithms | Operates strictly on the generic `IdentityProvider<TCredential, TRawIdentity>` interface |
| Extracts tokens, cookies, or authorization headers from incoming HTTP requests | Accepts credentials/tokens, resolves them via the adapter, and normalizes them into `AuthContext` |
| Configures custom role, permission, and tenant mapping rules | Executes deterministic authorization guards (`requireUser`, `requireRole`, `requirePermission`, `requireTenantMembership`) |
| Defines HTTP routing and error response serialization | Throws normalized, structured `AuthError` instances (`UNAUTHENTICATED`, `FORBIDDEN`, `TENANT_ACCESS_DENIED`, `INVALID_SESSION`) |

---

## 2. Public API (Exact Signatures)

All public types, interfaces, guards, and adapter factories are exported from the module's root entry point (`index.ts`), `core/index.ts`, and `adapters/index.ts`.

### Core Standalone Functions (`core/context.ts`, `core/guards.ts`)

```ts
// core/context.ts
export function getCurrentUser<TCredential = unknown, TRawIdentity = unknown>(
  provider: IdentityProvider<TCredential, TRawIdentity>,
  options?: ResolveUserOptions<TCredential, TRawIdentity>
): Promise<AuthContext | null>;

export function requireUser<TCredential = unknown, TRawIdentity = unknown>(
  provider: IdentityProvider<TCredential, TRawIdentity>,
  options?: ResolveUserOptions<TCredential, TRawIdentity>
): Promise<AuthContext>;

// core/guards.ts
export function requireRole(
  context: AuthContext,
  requiredRole: string | string[],
  options?: RoleGuardOptions
): AuthContext;

export function requirePermission(
  context: AuthContext,
  requiredPermission: string | string[],
  options?: PermissionGuardOptions
): AuthContext;

export function requireTenantMembership(
  context: AuthContext,
  tenantId: string
): AuthContext;
```

### Factory Helper (`core/client.ts`)

```ts
// core/client.ts
export function createAuthHelpers<TCredential = unknown, TRawIdentity = unknown>(
  config: AuthConfig<TCredential, TRawIdentity>
): AuthHelpers<TCredential, TRawIdentity>;

export interface AuthHelpers<TCredential = unknown, TRawIdentity = unknown> {
  getCurrentUser(options?: ResolveUserOptions<TCredential, TRawIdentity>): Promise<AuthContext | null>;
  requireUser(options?: ResolveUserOptions<TCredential, TRawIdentity>): Promise<AuthContext>;
  requireRole(requiredRole: string | string[], options?: RoleGuardOptions): Promise<AuthContext>;
  requirePermission(requiredPermission: string | string[], options?: PermissionGuardOptions): Promise<AuthContext>;
  requireTenantMembership(tenantId: string, options?: ResolveUserOptions<TCredential, TRawIdentity>): Promise<AuthContext>;
}
```

### Concrete Adapters (`adapters/`)

```ts
// adapters/supabase-adapter.ts
export function createSupabaseAdapter(
  client: SupabaseAuthClient
): IdentityProvider<string | undefined, SupabaseUser>;

export function defaultSupabaseNormalizer(user: SupabaseUser): AuthContext;

// adapters/credential-store-adapter.ts
export function createCredentialStoreAdapter<TCredential = unknown, TRawIdentity = unknown>(
  options: CredentialStoreAdapterOptions<TCredential, TRawIdentity>
): IdentityProvider<TCredential, TRawIdentity>;

// adapters/jwt-adapter.ts
export function createJwtAdapter<TPayload = Record<string, unknown>>(
  options: JwtAdapterOptions<TPayload>
): IdentityProvider<string, TPayload>;

export function defaultJwtNormalizer(payload: Record<string, unknown>): AuthContext;
```

### 2.1 Pipeline Guarantee

Every high-level helper method on `AuthHelpers` (`requireRole`, `requirePermission`, `requireTenantMembership` when invoked through the factory instance) **MUST delegate directly** to `requireUser()` (or accept an already-resolved `AuthContext`) to ensure that credential resolution, identity normalization, and access guards execute through a single, deterministic pipeline.

---

## 3. Exact Core Types

```ts
/**
 * Universal, normalized Auth Context structure passed to application business logic.
 * Completely decouples downstream services from underlying database records or JWT schemas.
 */
export type AuthContext = {
  /** Unique user identifier */
  userId: string;
  /** List of assigned user roles (e.g. ['admin', 'editor']) */
  roles?: string[];
  /** Primary tenant ID for multi-tenant isolation */
  tenantId?: string;
  /** List of fine-grained permissions (e.g. ['posts:write', 'billing:read']) */
  permissions?: string[];
  /** Optional user email address */
  email?: string;
  /** Custom application metadata key-value pairs */
  metadata?: Record<string, unknown>;
};

/**
 * Generic Identity Provider interface.
 * Implemented by concrete adapters or custom host resolvers.
 */
export interface IdentityProvider<TCredential = unknown, TRawIdentity = unknown> {
  /**
   * Resolves a raw identity from supplied credentials (e.g. JWT token, session ID, API key, user/pass struct).
   * Returns TRawIdentity if valid, or null if unauthenticated / not found.
   * Throws AuthError with code 'INVALID_SESSION' if credential is malformed or expired.
   */
  resolve(credential?: TCredential): Promise<TRawIdentity | null>;
}

/** Function signature for mapping a raw identity into a normalized AuthContext */
export type IdentityNormalizer<TRawIdentity = unknown> = (
  raw: TRawIdentity
) => AuthContext | Promise<AuthContext>;

/** Options when resolving an identity for a specific operation */
export type ResolveUserOptions<TCredential = unknown, TRawIdentity = unknown> = {
  /** Explicit credential to resolve (e.g. bearer token, session token, credential object) */
  credential?: TCredential;
  /** Optional custom normalizer override for this call */
  normalize?: IdentityNormalizer<TRawIdentity>;
  /** Optional custom role resolver override */
  roleResolver?: (raw: TRawIdentity) => string[] | Promise<string[]>;
  /** Optional custom tenant resolver override */
  tenantResolver?: (raw: TRawIdentity) => string | undefined | Promise<string | undefined>;
  /** Optional custom permission resolver override */
  permissionResolver?: (raw: TRawIdentity, roles?: string[]) => string[] | Promise<string[]>;
};

/** Options for Role Guard evaluation */
export type RoleGuardOptions = {
  /** Evaluation mode: 'ANY' requires at least one matching role; 'ALL' requires all roles (Default: 'ANY') */
  mode?: 'ANY' | 'ALL';
};

/** Options for Permission Guard evaluation */
export type PermissionGuardOptions = {
  /** Evaluation mode: 'ANY' requires at least one permission; 'ALL' requires all permissions (Default: 'ANY') */
  mode?: 'ANY' | 'ALL';
};

/** Module configuration contract injected by Host */
export type AuthConfig<TCredential = unknown, TRawIdentity = unknown> = {
  /** The IdentityProvider instance responsible for validating credentials */
  provider: IdentityProvider<TCredential, TRawIdentity>;
  /** Default normalizer converting raw identity to normalized AuthContext */
  normalize?: IdentityNormalizer<TRawIdentity>;
  /** Default custom role resolver callback */
  roleResolver?: (raw: TRawIdentity) => string[] | Promise<string[]>;
  /** Default custom tenant resolver callback */
  tenantResolver?: (raw: TRawIdentity) => string | undefined | Promise<string | undefined>;
  /** Default custom permission resolver callback */
  permissionResolver?: (raw: TRawIdentity, roles?: string[]) => string[] | Promise<string[]>;
  /** Optional callback invoked on authentication or authorization failure */
  onAuthFailure?: (error: AuthError) => void;
};

```

> **Adapter-owned types, not core types.** `SupabaseAuthClient`, `SupabaseUser`, `CredentialStoreAdapterOptions`, and `JwtAdapterOptions` are declared and exported from their own adapter file (`adapters/supabase-adapter.ts`, `adapters/credential-store-adapter.ts`, `adapters/jwt-adapter.ts` respectively), NOT from `core/types.ts`. This is load-bearing, not a style preference: `core/` must stay closed to modification when a new adapter is added later — a 4th adapter (OAuth, SAML, session-cookie, whatever) must be addable by creating one new `adapters/<name>-adapter.ts` file, without touching any file under `core/`. `adapters/index.ts` re-exports every adapter's types via `export *`, and the module's root `index.ts` re-exports both `core/index.ts` and `adapters/index.ts`, so consumers still import everything — including `SupabaseAuthClient` — from the single top-level entry point (`@module-hub/auth`) exactly as shown in section 10 below. Only `AuthContext`, `IdentityProvider`, `IdentityNormalizer`, `ResolveUserOptions`, `RoleGuardOptions`, `PermissionGuardOptions`, and `AuthConfig` belong in `core/types.ts` — every one of those is meaningful with zero adapters installed.

---

## 4. Context Resolution & Guard Pipeline

The core authentication workflow normalizes any provider-specific identity payload into a standard `AuthContext`.

### 4.1 `getCurrentUser(provider, options)` Execution Flow

1. **Provider Resolution:**
   - Calls `provider.resolve(options?.credential)`.
   - If the provider throws an `AuthError` (e.g. `INVALID_SESSION` due to expired or malformed token), the error is propagated to the caller.
   - If the provider encounters an unexpected non-auth error, it is wrapped in an `AuthError` with `code: 'INVALID_SESSION'` and `status: 401`.
2. **Null Check:**
   - If `resolve()` returns `null` or `undefined`, `getCurrentUser` immediately returns `null`.
3. **Identity Normalization:**
   - If `options?.normalize` (or config `normalize`) is provided, calls `normalize(rawIdentity)`.
   - If no custom normalizer is provided, executes default normalization heuristics:
     - `userId`: inspects `raw.userId`, `raw.id`, `raw.sub`, or `raw.uid`. Throws `AuthError('UNAUTHENTICATED')` if no identifier is resolvable.
     - `email`: inspects `raw.email`.
     - `roles`: if `roleResolver` is provided, executes it. Else checks `raw.roles`, `raw.role` (wrapped in array), `raw.app_metadata?.roles`, or `raw.user_metadata?.roles`.
     - `tenantId`: if `tenantResolver` is provided, executes it. Else checks `raw.tenantId`, `raw.tenant_id`, `raw.app_metadata?.tenant_id`, or `raw.user_metadata?.tenant_id`.
     - `permissions`: if `permissionResolver` is provided, executes it. Else checks `raw.permissions`, `raw.app_metadata?.permissions`, or `raw.user_metadata?.permissions`.
     - `metadata`: assigns remaining non-standard fields or `raw.metadata`.
4. **Context Construction:**
   - Constructs and returns the frozen `AuthContext` object.

### 4.2 `requireUser(provider, options)` Execution Flow

1. Executes `getCurrentUser(provider, options)`.
2. If the returned context is `null`, immediately throws an `AuthError` with `code: 'UNAUTHENTICATED'` and `status: 401`.
3. Returns the valid `AuthContext`.

### 4.3 `requireRole(context, requiredRole, options)` Execution Flow

1. Validates that `context` is a valid `AuthContext`. If missing, throws `AuthError` with `code: 'UNAUTHENTICATED'` and `status: 401`.
2. Normalizes `requiredRole` into an array of strings: `Array.isArray(requiredRole) ? requiredRole : [requiredRole]`.
3. Extracts roles from `context.roles || []`.
4. Evaluates matching logic based on `options.mode`:
   - `'ANY'` (Default): Asserts at least one role in `requiredRole` is present in `context.roles`.
   - `'ALL'`: Asserts every role in `requiredRole` is present in `context.roles`.
5. If the assertion fails, throws `AuthError` with `code: 'FORBIDDEN'` and `status: 403`.
6. Returns the unchanged `context` upon success to support fluent chaining.

### 4.4 `requirePermission(context, requiredPermission, options)` Execution Flow

1. Validates that `context` is a valid `AuthContext`. If missing, throws `AuthError` with `code: 'UNAUTHENTICATED'` and `status: 401`.
2. Normalizes `requiredPermission` into an array of strings: `Array.isArray(requiredPermission) ? requiredPermission : [requiredPermission]`.
3. Extracts permissions from `context.permissions || []`.
4. Evaluates matching logic based on `options.mode`:
   - `'ANY'` (Default): Asserts at least one permission in `requiredPermission` is present in `context.permissions`.
   - `'ALL'`: Asserts every permission in `requiredPermission` is present in `context.permissions`.
5. If the assertion fails, throws `AuthError` with `code: 'FORBIDDEN'` and `status: 403`.
6. Returns the unchanged `context` upon success to support fluent chaining.

---

## 5. Tenant Guard Design (Multi-Tenant Isolation)

Multi-tenant architecture requires strict boundary controls to guarantee user-level tenant isolation.

### 5.1 Multi-Tenant Data Model

```
User Identity (userId)
  └── Tenant Membership (tenantId, roles, permissions)
        └── Target Tenant Data Boundary
```

### 5.2 `requireTenantMembership(context, tenantId)` Execution Flow

1. **Parameter Validation:**
   - Validates that `context` is provided (throws `UNAUTHENTICATED` with status 401 if missing).
   - Validates that `tenantId` is a non-empty string. If empty or invalid, throws `AuthError` with `code: 'TENANT_ACCESS_DENIED'` and `status: 403`.
2. **Context Inspection:**
   - Inspects `context.tenantId`.
3. **Cross-Tenant Guard Enforcement:**
   - Compares the active `context.tenantId` against the target `tenantId`.
   - **Isolation Rule:** If `context.tenantId` is undefined OR `context.tenantId !== tenantId`, the request MUST be rejected immediately.
   - Throws `AuthError` with `code: 'TENANT_ACCESS_DENIED'` and `status: 403`.
4. **Tenant Access Granted:**
   - Returns the unchanged `context` upon successful validation.

> **SECURITY GUARANTEE:** A user authenticated under Tenant A (`tenantId: 'tenant-acme'`) CANNOT pass `requireTenantMembership(context, 'tenant-globex')`. Attempting to access cross-tenant resources immediately raises `TENANT_ACCESS_DENIED` with HTTP status 403.

---

## 6. Structured Error Model

All authorization and authentication failures originating from this module throw an instance of `AuthError`.

```ts
export type AuthErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'TENANT_ACCESS_DENIED'
  | 'INVALID_SESSION';

export class AuthError extends Error {
  readonly code: AuthErrorCode;
  readonly status: number;
  override readonly cause?: unknown;

  constructor(options: {
    message: string;
    code: AuthErrorCode;
    status?: number;
    cause?: unknown;
  }) {
    super(options.message);
    this.name = 'AuthError';
    this.code = options.code;
    this.status =
      options.status ??
      (options.code === 'UNAUTHENTICATED' || options.code === 'INVALID_SESSION'
        ? 401
        : 403);
    this.cause = options.cause;

    // Maintain standard V8 stack trace capture if available
    if ((Error as any).captureStackTrace) {
      (Error as any).captureStackTrace(this, AuthError);
    }
  }
}
```

### Error Codes & Semantics

| Code | HTTP Status | Description / Trigger Condition |
|---|---|---|
| `UNAUTHENTICATED` | `401` | Request lacks valid user credentials or session when authentication is required (`requireUser`). |
| `INVALID_SESSION` | `401` | Bearer token, credential, or session is expired, malformed, revoked, or rejected by provider verification. |
| `FORBIDDEN` | `403` | User is authenticated but lacks required role (`requireRole`) or permission (`requirePermission`). |
| `TENANT_ACCESS_DENIED` | `403` | Authenticated user attempted to access data belonging to a tenant they are not a member of. |

---

## 7. Config Contract & Dependency Injection

To ensure universal portability across Cloudflare Workers, Node.js, Deno, Bun, and browser environments, `@module-hub/auth` enforces strict runtime isolation:

1. **Zero Direct Environment Access:**
   - Core and adapter code MUST NOT reference `process.env`, `Deno.env`, `import.meta.env`, or `globalThis.process`.
   - Host applications read environment variables, initialize database pools or SDK clients, and inject them into the module.
2. **Zero Hardcoded SDK Imports in Core:**
   - Core has zero imports of `@supabase/supabase-js`, ORMs (Prisma/TypeORM/Drizzle), or database drivers (pg/mysql2).
   - The Supabase adapter interacts solely with the structural `SupabaseAuthClient` interface.
   - The Credential Store adapter interacts solely with the host-supplied `verify()` callback.
   - The JWT adapter interacts solely with the host-supplied `verifyToken()` callback.
3. **Pluggable Context Resolvers:**
   - Host can inject `normalize`, `roleResolver`, `tenantResolver`, and `permissionResolver` during initialization or on a per-request basis.

---

## 8. File Structure

The module directory layout strictly follows the Module Hub monorepo standard:

```
modules/auth/
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
│   ├── guards.ts
│   └── context.ts
├── adapters/
│   ├── index.ts
│   ├── supabase-adapter.ts
│   ├── credential-store-adapter.ts
│   └── jwt-adapter.ts
├── tests/
│   ├── unit/
│   │   ├── context.test.ts
│   │   ├── guards.test.ts
│   │   ├── error.test.ts
│   │   ├── supabase-adapter.test.ts
│   │   ├── credential-store-adapter.test.ts
│   │   └── jwt-adapter.test.ts
│   └── integration/
│       ├── supabase-flow.test.ts
│       ├── credential-store-flow.test.ts
│       └── jwt-flow.test.ts
└── examples/
    └── integration.example.ts
```

---

## 9. Test Requirements (for Stage 3 Tester)

The test suite must be implemented using `vitest` under `tests/`. Downstream agents MUST verify every enumerated test case:

| Test File | Test Case Name | Assertion / Expected Outcome |
|---|---|---|
| `unit/context.test.ts` | `getCurrentUser returns null when unauthenticated` | Provider returning `null` causes `getCurrentUser()` to return `null`. |
| `unit/context.test.ts` | `requireUser throws UNAUTHENTICATED on null` | Provider returning `null` causes `requireUser()` to throw `AuthError` (code: `UNAUTHENTICATED`, status: 401). |
| `unit/context.test.ts` | `custom normalizer mapping` | Custom `normalize` function maps raw custom DB record to `AuthContext`. |
| `unit/context.test.ts` | `custom role and tenant resolvers` | Injected `roleResolver` and `tenantResolver` override raw object properties. |
| `unit/guards.test.ts` | `requireRole allows matching role` | User with role `['admin']` passes `requireRole('admin')` and returns context. |
| `unit/guards.test.ts` | `requireRole mode ANY vs ALL` | Asserts `mode: 'ANY'` passes if at least one matches; `mode: 'ALL'` requires all roles. |
| `unit/guards.test.ts` | `requireRole throws FORBIDDEN on missing role` | User with `['user']` fails `requireRole('admin')` and throws `FORBIDDEN` (403). |
| `unit/guards.test.ts` | `requirePermission allows matching permission` | User with `['posts:write']` passes `requirePermission('posts:write')`. |
| `unit/guards.test.ts` | `requirePermission throws FORBIDDEN` | Missing permission throws `AuthError` with `code: 'FORBIDDEN'` (403). |
| `unit/guards.test.ts` | `requireTenantMembership allows matching tenant` | User with `tenantId: 'tenant-100'` passes `requireTenantMembership(context, 'tenant-100')`. |
| `unit/guards.test.ts` | `requireTenantMembership throws TENANT_ACCESS_DENIED` | User with `tenantId: 'tenant-100'` accessing `'tenant-200'` throws `TENANT_ACCESS_DENIED` (403). |
| `unit/error.test.ts` | `AuthError properties and inheritance` | `AuthError` instances inherit from `Error`, set default HTTP status (401 vs 403), and keep `cause`. |
| `unit/supabase-adapter.test.ts` | `resolves valid Supabase session` | Wraps `client.auth.getUser()`, maps `app_metadata` roles, tenant, and permissions. |
| `unit/supabase-adapter.test.ts` | `handles Supabase token error` | Expired or invalid Supabase JWT throws `AuthError` with `code: 'INVALID_SESSION'`. |
| `unit/credential-store-adapter.test.ts` | `resolves credential via verify callback` | Injected `verify(credential)` correctly returns host user record. |
| `unit/credential-store-adapter.test.ts` | `returns null on invalid credential` | When `verify()` returns null, adapter returns null. |
| `unit/jwt-adapter.test.ts` | `resolves JWT payload via verifyToken` | Injected `verifyToken(token)` returns decoded payload and normalizes claims. |
| `unit/jwt-adapter.test.ts` | `throws INVALID_SESSION on rejected JWT` | When `verifyToken()` returns null or throws, adapter throws `INVALID_SESSION`. |
| `integration/supabase-flow.test.ts` | `end-to-end Supabase migration flow` | Full pipeline with `createAuthHelpers` + Supabase adapter + RBAC + Tenant isolation. |
| `integration/credential-store-flow.test.ts` | `end-to-end custom DB store flow` | Full pipeline with Postgres/In-Memory mock store + normalizer + permission guards. |
| `integration/jwt-flow.test.ts` | `end-to-end generic JWT bearer flow` | Full pipeline with token verification + tenant guard enforcement. |

---

## 10. `integration.example.ts` Reference Shape

The example file demonstrates working implementations of both the **Supabase Adapter** (for parity/migration) and the **Credential Store Adapter** (for custom DB/storage), plus the **JWT Adapter**.

```ts
import {
  createAuthHelpers,
  createSupabaseAdapter,
  createCredentialStoreAdapter,
  createJwtAdapter,
  AuthError,
  type AuthContext,
  type SupabaseAuthClient,
  type SupabaseUser
} from '../index.js';

// ============================================================================
// Example 1: Custom Database / Credential Store Adapter (Postgres, JSON, etc.)
// ============================================================================

type MyDbUser = {
  id: string;
  email: string;
  userRole: string;
  organizationId: string;
  scope: string[];
};

// Host mock database (could be Prisma, Drizzle, Kysely, or raw SQL)
const mockUserDatabase = new Map<string, MyDbUser>([
  [
    'session_token_alice',
    {
      id: 'usr_alice',
      email: 'alice@example.com',
      userRole: 'admin',
      organizationId: 'org_acme',
      scope: ['users:read', 'users:write', 'billing:admin']
    }
  ]
]);

// 1. Create Credential Store Adapter with host-injected verify callback
const credentialStoreAdapter = createCredentialStoreAdapter<string, MyDbUser>({
  verify: async (sessionToken: string) => {
    return mockUserDatabase.get(sessionToken) || null;
  }
});

// 2. Initialize Auth Helpers with custom normalizer
const customDbAuth = createAuthHelpers({
  provider: credentialStoreAdapter,
  normalize: (dbUser: MyDbUser): AuthContext => ({
    userId: dbUser.id,
    email: dbUser.email,
    roles: [dbUser.userRole],
    tenantId: dbUser.organizationId,
    permissions: dbUser.scope
  }),
  onAuthFailure: (err) => {
    console.warn(`[Custom DB Auth Audit] ${err.code} (${err.status}): ${err.message}`);
  }
});

// 3. Example Request Handler using Custom DB Auth
async function handleCustomDbRequest(sessionHeader: string | null, targetOrgId: string) {
  try {
    const sessionToken = sessionHeader?.replace('Session ', '') || '';
    
    // Step A: Require Authenticated User
    const context = await customDbAuth.requireUser({ credential: sessionToken });
    console.log(`[Custom DB] Authenticated User: ${context.userId} (${context.email})`);

    // Step B: Guard Role & Permission
    customDbAuth.requireRole('admin');
    customDbAuth.requirePermission('billing:admin');

    // Step C: Guard Multi-Tenant Isolation
    customDbAuth.requireTenantMembership(targetOrgId);

    return { status: 200, body: { success: true, user: context.userId } };
  } catch (error) {
    if (error instanceof AuthError) {
      return { status: error.status, body: { error: error.code, message: error.message } };
    }
    return { status: 500, body: { error: 'INTERNAL_SERVER_ERROR' } };
  }
}

// ============================================================================
// Example 2: Supabase Adapter (Migration & Parity Path)
// ============================================================================

const mockSupabaseClient: SupabaseAuthClient = {
  auth: {
    async getUser(jwt?: string) {
      if (!jwt || jwt === 'invalid') {
        return { data: { user: null }, error: { message: 'Invalid token', status: 401 } };
      }
      if (jwt === 'expired') {
        return { data: { user: null }, error: { message: 'jwt expired', status: 401, code: 'jwt_expired' } };
      }
      return {
        data: {
          user: {
            id: 'usr_supabase_bob',
            email: 'bob@example.com',
            app_metadata: {
              roles: ['editor'],
              tenant_id: 'tenant_globex',
              permissions: ['articles:publish']
            }
          }
        },
        error: null
      };
    }
  }
};

const supabaseAdapter = createSupabaseAdapter(mockSupabaseClient);
const supabaseAuth = createAuthHelpers({
  provider: supabaseAdapter
});

async function handleSupabaseRequest(authHeader: string | null, targetTenantId: string) {
  try {
    const jwt = authHeader?.replace('Bearer ', '');
    const context = await supabaseAuth.requireUser({ credential: jwt });
    supabaseAuth.requirePermission('articles:publish');
    supabaseAuth.requireTenantMembership(targetTenantId);
    return { status: 200, body: { success: true, user: context.userId } };
  } catch (error) {
    if (error instanceof AuthError) {
      return { status: error.status, body: { error: error.code, message: error.message } };
    }
    return { status: 500, body: { error: 'INTERNAL_SERVER_ERROR' } };
  }
}

// ============================================================================
// Run Execution Verification
// ============================================================================

async function runExamples() {
  console.log('=== Running Custom DB Adapter Examples ===');
  const res1 = await handleCustomDbRequest('Session session_token_alice', 'org_acme');
  console.log('Custom DB Success:', res1);

  const res2 = await handleCustomDbRequest('Session session_token_alice', 'org_evil_corp');
  console.log('Custom DB Cross-Tenant Attempt:', res2);

  console.log('\n=== Running Supabase Adapter Examples ===');
  const res3 = await handleSupabaseRequest('Bearer valid_jwt', 'tenant_globex');
  console.log('Supabase Success:', res3);

  const res4 = await handleSupabaseRequest('Bearer expired', 'tenant_globex');
  console.log('Supabase Expired Token:', res4);
}

runExamples();
```

---

## 11. `package.json` and `tsconfig.json`

### `package.json`
```json
{
  "name": "@module-hub/auth",
  "version": "0.1.0",
  "type": "module",
  "main": "./index.ts",
  "exports": {
    ".": "./index.ts",
    "./core": "./core/index.ts",
    "./adapters": "./adapters/index.ts"
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

## 12. Explicit Non-Goals

The following features are **strictly out of scope** for `@module-hub/auth` to maintain complete security and framework agnosticism:

- **Password Storage & Hashing:** The module contains no bcrypt, argon2, or scrypt implementations. Password verification is performed by the host inside the injected `verify` callback.
- **Custom JWT Signing & Key Management:** The module does not manage RSA/ECDSA/HMAC secret keys, nor does it sign or issue tokens. Token signing and verification libraries (e.g. `jose`, `jsonwebtoken`) remain under host control.
- **Direct Database Connections & ORM Schemas:** The module does not bundle database drivers (e.g. `pg`, `mysql2`, `mongodb`) or ORMs.
- **Direct Environment Variable Access:** No calls to `process.env`, `Deno.env`, or `import.meta.env`.
- **OAuth Server / Protocol Handlers:** No OAuth2 authorization endpoints, PKCE exchange endpoints, or OpenID Connect provider engines.

---

## 13. Acceptance Criteria (for Stage 4 Reviewer)

A Stage 4 Reviewer MUST verify all of the following criteria before approving the module:

1. [ ] **File Location:** Deliverables exist at `modules/auth/DESIGN.md` and `modules/auth/MODULE.md`.
2. [ ] **Runtime & Environment Independence:** Core code has zero `process.env` calls, zero `node:*` imports, and runs seamlessly in Edge runtimes (Cloudflare Workers).
3. [ ] **Zero Heavy SDK Dependencies:** Core has zero imports of `@supabase/supabase-js`, Prisma, Drizzle, Kysely, or database drivers.
4. [ ] **Universal Public API:** Exports core resolution functions (`getCurrentUser`, `requireUser`), guards (`requireRole`, `requirePermission`, `requireTenantMembership`), and factory `createAuthHelpers`.
5. [ ] **Concrete Adapters:** Ships at least 2 functioning adapters (`createSupabaseAdapter` and `createCredentialStoreAdapter`, plus `createJwtAdapter`).
6. [ ] **Normalized AuthContext:** Produces standard `AuthContext` with `userId`, `roles?`, `tenantId?`, `permissions?`, `email?`, `metadata?`.
7. [ ] **Deterministic Multi-Tenant Isolation:** `requireTenantMembership` strictly enforces tenant checks and throws `TENANT_ACCESS_DENIED` (HTTP 403) on mismatch.
8. [ ] **Structured Error Model:** Implements `AuthError` with status codes and 4 error types (`UNAUTHENTICATED`, `FORBIDDEN`, `TENANT_ACCESS_DENIED`, `INVALID_SESSION`).
9. [ ] **Integration Examples:** `examples/integration.example.ts` contains runnable demonstrations of both Supabase and custom Credential Store adapters.
10. [ ] **Test Requirements Completeness:** All unit and integration test cases in Section 9 are enumerated and ready for implementation by Agent C.
