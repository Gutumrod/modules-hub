# Supabase Auth Helpers Module — DESIGN.md

**Version:** 0.2.0 (P1, RBAC/RLS helpers)
**Status:** Design (Stage 1 — Architect). This file is the single source of truth for downstream agents (Stage 2 implementer, Stage 3 tester, Stage 4 reviewer).
**Language / runtime:** TypeScript, ES2022, strict mode, `moduleResolution: Bundler`. Must run on Cloudflare Workers (no `node:*` imports; Web APIs only).

---

## 1. Purpose

A reusable, adapter-based **Supabase Auth Helpers module** for the Module Hub monorepo. It provides a lightweight, normalized authentication and authorization helper layer around Supabase Auth, offering user extraction, session validation, role-based access control (RBAC), permission-based access control (PBAC), multi-tenant isolation, and normalized error handling.

The architecture follows a strict layered design:

```
Host / Module Adapter (Web Framework / Route Handler / CF Worker)
       ↓
Supabase Auth Core (getCurrentUser, requireUser, requireRole, requirePermission, requireTenantMembership)
       ↓
Adapter / Integration Layer (Supabase Client Adapter & Context Resolvers)
       ↓
Supabase Client (Injected by Host — `@supabase/supabase-js` instance or custom transport)
```

### Architectural Boundary

> **CRITICAL BOUNDARY:** This module is strictly responsible for **integration helpers around Supabase Auth**. It MUST NOT build a new authentication engine, store user credentials, issue custom JWTs, or manage password hashing. Session creation, token generation, and OAuth handshakes are delegated entirely to Supabase Auth. The module consumes session tokens/clients provided by the Host and enforces access control rules on business logic.

### Host responsibilities vs module responsibilities

| Host does | Module does |
|---|---|
| Reads `process.env` / `env` secrets (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) | Never touches env — receives configuration & Supabase client via `SupabaseAuthConfig` |
| Instantiates `@supabase/supabase-js` client | Interacts with Supabase auth strictly through the `SupabaseAuthClient` interface |
| Extracts bearer tokens or cookies from incoming HTTP requests | Accepts token or client instance, resolves session into normalized `AuthContext` |
| Configures custom role/permission/tenant resolvers | Executes guards (`requireUser`, `requireRole`, `requirePermission`, `requireTenantMembership`) |
| Defines route middleware and HTTP status responses | Throws normalized `AuthError` (`UNAUTHENTICATED`, `FORBIDDEN`, `TENANT_ACCESS_DENIED`, `INVALID_SESSION`) |

---

## 2. Public API (exact signatures)

All public types and functions are exported from the module's entry point (`index.ts` and `core/index.ts`).

```ts
// core/context.ts
export function getCurrentUser(
  client: SupabaseAuthClient,
  options?: GetCurrentUserOptions
): Promise<AuthContext | null>;

export function requireUser(
  client: SupabaseAuthClient,
  options?: GetCurrentUserOptions
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

// core/client.ts (Factory helper)
export function createSupabaseAuthHelpers(
  config: SupabaseAuthConfig
): SupabaseAuthHelpers;

// HttpClient Interface for Host Ergonomics
export interface SupabaseAuthHelpers {
  getCurrentUser(options?: GetCurrentUserOptions): Promise<AuthContext | null>;
  requireUser(options?: GetCurrentUserOptions): Promise<AuthContext>;
  requireRole(requiredRole: string | string[], options?: RoleGuardOptions): Promise<AuthContext>;
  requirePermission(requiredPermission: string | string[], options?: PermissionGuardOptions): Promise<AuthContext>;
  requireTenantMembership(tenantId: string, options?: GetCurrentUserOptions): Promise<AuthContext>;
}
```

### 2.1 Pipeline Guarantee

Every high-level guard operation (`requireRole`, `requirePermission`, `requireTenantMembership` when called via `SupabaseAuthHelpers`) **MUST delegate directly** to `getCurrentUser()` / `requireUser()` to ensure that token validation, role resolution, and context normalization always execute through a single, consistent execution pipeline.

---

## 3. Exact Core Types

```ts
/**
 * Normalized Auth Context structure passed to business logic.
 * Decouples downstream code from raw Supabase User / JWT schemas.
 */
export type AuthContext = {
  /** Unique user identifier (UUID) */
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

/** Options when resolving current user session */
export type GetCurrentUserOptions = {
  /** Explicit JWT bearer token (overrides client default session) */
  jwt?: string;
  /** Optional custom role resolver override */
  roleResolver?: (user: SupabaseUser) => string[] | Promise<string[]>;
  /** Optional custom tenant resolver override */
  tenantResolver?: (user: SupabaseUser) => string | undefined | Promise<string | undefined>;
  /** Optional custom permission resolver override */
  permissionResolver?: (user: SupabaseUser, roles?: string[]) => string[] | Promise<string[]>;
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

/**
 * Minimal structural interface for Supabase Auth client.
 * Decouples module from specific @supabase/supabase-js library versions.
 */
export interface SupabaseAuthClient {
  auth: {
    getUser(jwt?: string): Promise<{
      data: { user: SupabaseUser | null };
      error: { message: string; status?: number; code?: string } | null;
    }>;
  };
}

/** Normalized user object extracted from Supabase response */
export type SupabaseUser = {
  id: string;
  email?: string;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
  role?: string;
};

/** Module configuration contract injected by Host */
export type SupabaseAuthConfig = {
  /** Supabase client instance or compatible adapter injected by Host */
  supabaseClient: SupabaseAuthClient;
  /** Default custom role resolver callback */
  roleResolver?: (user: SupabaseUser) => string[] | Promise<string[]>;
  /** Default custom tenant resolver callback */
  tenantResolver?: (user: SupabaseUser) => string | undefined | Promise<string | undefined>;
  /** Default custom permission resolver callback */
  permissionResolver?: (user: SupabaseUser, roles?: string[]) => string[] | Promise<string[]>;
  /** Optional callback invoked on authentication or authorization failure */
  onAuthFailure?: (error: AuthError) => void;
};
```

---

## 4. Context Resolution & Guard Pipeline

The core authentication workflow normalizes raw Supabase user payloads into a standard `AuthContext`.

### 4.1 `getCurrentUser(client, options)` Execution Flow

1. **Token Verification:**
   - Calls `client.auth.getUser(options?.jwt)`.
   - If Supabase returns an error (e.g. `invalid JWT`, `JWT expired`, `session revoked`), the helper catches the error and checks cause:
     - Expired or malformed tokens throw an `AuthError` with `code: 'INVALID_SESSION'`.
     - Network rejections or missing auth state return `null`.
2. **User Extraction:**
   - If no user data is returned (`data.user === null`), returns `null`.
3. **Metadata & Custom Resolution:**
   - Default role resolution: checks `user.app_metadata.roles`, `user.user_metadata.roles`, or fallback `[user.role]` if present.
   - Default tenant resolution: checks `user.app_metadata.tenant_id` or `user.user_metadata.tenant_id`.
   - Default permission resolution: checks `user.app_metadata.permissions` or `user.user_metadata.permissions`.
   - If custom resolver callbacks (`roleResolver`, `tenantResolver`, `permissionResolver`) are provided in `options` or `SupabaseAuthConfig`, they override default extraction logic.
4. **Context Assembly:**
   - Constructs and returns frozen `AuthContext` object.

### 4.2 `requireUser(client, options)` Execution Flow

1. Executes `getCurrentUser(client, options)`.
2. If the result is `null`, immediately throws `AuthError` with `code: 'UNAUTHENTICATED'` and `status: 401`.
3. Returns valid `AuthContext`.

### 4.3 `requireRole(context, requiredRole, options)` Execution Flow

1. Validates that `context` is a valid `AuthContext`. If missing, throws `AuthError` with `code: 'UNAUTHENTICATED'`.
2. Normalizes `requiredRole` into an array of strings.
3. Checks user roles in `context.roles` (defaults to empty array `[]` if undefined).
4. Evaluates matching logic based on `options.mode`:
   - `'ANY'` (Default): Asserts at least one role in `requiredRole` exists in `context.roles`.
   - `'ALL'`: Asserts every role in `requiredRole` exists in `context.roles`.
5. If assertion fails, throws `AuthError` with `code: 'FORBIDDEN'` and `status: 403`.
6. Returns unchanged `context` upon success (allowing method chaining).

### 4.4 `requirePermission(context, requiredPermission, options)` Execution Flow

1. Validates that `context` is a valid `AuthContext`. If missing, throws `AuthError` with `code: 'UNAUTHENTICATED'`.
2. Normalizes `requiredPermission` into an array of strings.
3. Checks user permissions in `context.permissions` (defaults to empty array `[]` if undefined).
4. Evaluates matching logic based on `options.mode`:
   - `'ANY'` (Default): Asserts at least one permission in `requiredPermission` exists in `context.permissions`.
   - `'ALL'`: Asserts every permission in `requiredPermission` exists in `context.permissions`.
5. If assertion fails, throws `AuthError` with `code: 'FORBIDDEN'` and `status: 403`.
6. Returns unchanged `context` upon success (allowing method chaining).

---

## 5. Tenant Guard Design (Multi-Tenant Isolation)

Multi-tenant security requires strict boundary controls to guarantee user-level tenant isolation.

### 5.1 Multi-Tenant Data Model

The module supports the standard hierarchy: **User → Membership → Tenant**.

```
User (userId)
  └── Tenant Membership (tenantId, roles, permissions)
        └── Target Tenant Data Partition
```

### 5.2 `requireTenantMembership(context, tenantId)` Execution Flow

1. **Parameter Validation:**
   - Validates that `tenantId` is a non-empty string. If empty/invalid, throws `AuthError` with `code: 'TENANT_ACCESS_DENIED'`.
2. **Context Inspection:**
   - Inspects `context.tenantId`.
   - Optionally inspects `context.metadata?.tenantMemberships` if tenant memberships are array-based.
3. **Cross-Tenant Guard Enforcement:**
   - Compares user's active `context.tenantId` (or membership list) against requested `tenantId`.
   - **Isolation Rule:** If `context.tenantId` is undefined OR `context.tenantId !== tenantId`, the request MUST be rejected immediately.
   - Throws `AuthError` with `code: 'TENANT_ACCESS_DENIED'` and `status: 403`.
4. **Tenant Access Granted:**
   - Returns unchanged `context` upon successful validation.

> **SECURITY GUARANTEE:** A user authenticated under Tenant A (`tenantId: 'tenant-a'`) CANNOT pass `requireTenantMembership(context, 'tenant-b')`. Attempting to access cross-tenant resources immediately raises `TENANT_ACCESS_DENIED`.

---

## 6. Structured Error Model

All authorization and authentication failures originating from this module throw an instance of `AuthError`.

```ts
export class AuthError extends Error {
  readonly code: AuthErrorCode;
  readonly status: number;
  readonly cause?: unknown;

  constructor(options: {
    message: string;
    code: AuthErrorCode;
    status?: number;
    cause?: unknown;
  }) {
    super(options.message);
    this.name = 'AuthError';
    this.code = options.code;
    this.status = options.status ?? (options.code === 'UNAUTHENTICATED' || options.code === 'INVALID_SESSION' ? 401 : 403);
    this.cause = options.cause;
    
    // Maintain standard stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AuthError);
    }
  }
}

export type AuthErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'TENANT_ACCESS_DENIED'
  | 'INVALID_SESSION';
```

### Error Codes & Semantics

| Code | HTTP Status | Description / Trigger Condition |
|---|---|---|
| `UNAUTHENTICATED` | `401` | Request lacks valid user session or bearer token when login is required (`requireUser`). |
| `INVALID_SESSION` | `401` | Bearer token or session cookie is expired, malformed, revoked, or rejected by Supabase Auth. |
| `FORBIDDEN` | `403` | User is authenticated but lacks required role (`requireRole`) or permission (`requirePermission`). |
| `TENANT_ACCESS_DENIED` | `403` | Authenticated user attempted to access data belonging to a tenant they are not a member of. |

---

## 7. Config Contract & Dependency Injection

To ensure complete portability across Node.js, Cloudflare Workers, Deno, and Bun environments, the core module enforces strict runtime isolation:

1. **Zero Direct Environment Access:**
   - Core code MUST NOT call `process.env`, `Deno.env`, `import.meta.env`, or `globalThis.process`.
   - Host applications read environment variables and inject the initialized Supabase client into the module.
2. **Supabase Client Decoupling:**
   - The core module does not import `@supabase/supabase-js` directly.
   - It relies on the minimal `SupabaseAuthClient` structural interface, allowing Host applications to use standard Supabase clients, SSR auth helpers, or custom mock clients in testing.
3. **Custom Context Resolvers:**
   - Host can inject `roleResolver`, `tenantResolver`, and `permissionResolver` during initialization or per-request to adapt to custom database schemas (e.g. Prisma RBAC tables, custom JWT claims).

---

## 8. File Structure

The module directory layout strictly follows the Module Hub monorepo standard:

```
modules/auth-supabase/
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
│   └── supabase-adapter.ts
├── tests/
│   ├── unit/
│   │   ├── context.test.ts
│   │   ├── guards.test.ts
│   │   ├── error.test.ts
│   │   └── adapter.test.ts
│   └── integration/
│       └── auth-flow.test.ts
└── examples/
    └── integration.example.ts
```

---

## 9. Test Requirements (for Stage 3 Tester)

The test suite must be implemented using `vitest` in `tests/`. Downstream agents MUST verify every enumerated test case:

| Test File | Test Case Name | Assertion / Expected Outcome |
|---|---|---|
| `context.test.ts` | `authenticated` | Valid session token resolves complete `AuthContext` with userId, roles, and tenantId. |
| `context.test.ts` | `not authenticated` | Missing or null session token returns `null` for `getCurrentUser()` and throws `UNAUTHENTICATED` (401) for `requireUser()`. |
| `context.test.ts` | `expired session` | Expired or invalid JWT token throws `AuthError` with `code: 'INVALID_SESSION'` (401). |
| `guards.test.ts` | `role allowed` | User with role `['admin']` successfully passes `requireRole('admin')` and returns `AuthContext`. |
| `guards.test.ts` | `role denied` | User with role `['user']` fails `requireRole('admin')` and throws `AuthError` with `code: 'FORBIDDEN'` (403). |
| `guards.test.ts` | `permission allowed` | User with permission `['posts:write']` successfully passes `requirePermission('posts:write')`. |
| `guards.test.ts` | `tenant allowed` | User with `tenantId: 'tenant-100'` passes `requireTenantMembership(context, 'tenant-100')`. |
| `guards.test.ts` | `tenant denied` | User with `tenantId: 'tenant-100'` fails `requireTenantMembership(context, 'tenant-999')` and throws `TENANT_ACCESS_DENIED` (403). |
| `error.test.ts` | `AuthError properties` | Asserts `AuthError` instance carries correct `code`, `status`, `message`, and inherits from `Error`. |
| `adapter.test.ts` | `custom resolvers` | Asserts custom `roleResolver` and `tenantResolver` override default metadata extraction. |

---

## 10. `integration.example.ts` Reference Shape

```ts
import {
  createSupabaseAuthHelpers,
  AuthError,
  type SupabaseAuthClient,
  type AuthContext
} from '../index.js';

// 1. Host initializes Supabase Client (Host manages process.env & keys)
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
            id: 'usr_12345',
            email: 'user@example.com',
            app_metadata: {
              roles: ['editor'],
              tenant_id: 'tenant_acme',
              permissions: ['documents:read', 'documents:write']
            }
          }
        },
        error: null
      };
    }
  }
};

// 2. Instantiate Auth Helpers module with injected client & config
const auth = createSupabaseAuthHelpers({
  supabaseClient: mockSupabaseClient,
  onAuthFailure: (err) => {
    console.warn(`[Auth Audit Failure] Code: ${err.code} Status: ${err.status} Msg: ${err.message}`);
  }
});

// 3. Example Request Handler (e.g. Cloudflare Worker or Next.js API Route)
async function handleTenantDocumentRequest(authHeader: string | null, targetTenantId: string) {
  try {
    const jwt = authHeader?.replace('Bearer ', '');

    // Step A: Require Authenticated User
    const context: AuthContext = await auth.requireUser({ jwt });
    console.log(`Authenticated User: ${context.userId} (${context.email})`);

    // Step B: Require Specific Role or Permission
    auth.requirePermission(context, 'documents:write');

    // Step C: Enforce Multi-Tenant Isolation
    auth.requireTenantMembership(context, targetTenantId);

    console.log(`Access Granted to ${context.userId} for Tenant ${targetTenantId}`);
    return { status: 200, body: { success: true } };
  } catch (error) {
    if (error instanceof AuthError) {
      return {
        status: error.status,
        body: { error: error.code, message: error.message }
      };
    }
    return { status: 500, body: { error: 'INTERNAL_SERVER_ERROR' } };
  }
}

// 4. Test Execution
async function runExample() {
  console.log('--- Case 1: Valid Tenant Access ---');
  const res1 = await handleTenantDocumentRequest('Bearer valid_jwt_token', 'tenant_acme');
  console.log('Result 1:', res1);

  console.log('\n--- Case 2: Cross-Tenant Breach Attempt ---');
  const res2 = await handleTenantDocumentRequest('Bearer valid_jwt_token', 'tenant_evil_corp');
  console.log('Result 2:', res2);

  console.log('\n--- Case 3: Expired Token ---');
  const res3 = await handleTenantDocumentRequest('Bearer expired', 'tenant_acme');
  console.log('Result 3:', res3);
}

runExample();
```

---

## 11. `package.json` and `tsconfig.json`

### `package.json`
```json
{
  "name": "@module-hub/auth-supabase",
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

## 12. Explicit Non-Goals

The following features are **explicitly out of scope** for v0.1.0 of the Supabase Auth Helpers module:

- **Password Storage & Hashing:** No bcrypt, argon2, or custom password verification logic.
- **Custom JWT Issuer:** No signing keys, RSA/HS256 JWT generation, or custom token issuing.
- **OAuth Provider Server:** No OAuth2 authorization server, PKCE flow handler, or refresh token grant handler.
- **Custom Authentication Database:** No user credential tables or custom password database schemas.
- **Row Level Security (RLS) SQL Generator:** RLS policies remain in PostgreSQL migration files.

---

## 13. Acceptance Criteria (for Stage 4 Reviewer)

A Stage 4 Reviewer MUST verify all of the following criteria before approving the module:

1. [ ] **File Location:** Deliverable exists at `D:\AI-Workspace\projects\modules-hub\modules\auth-supabase\DESIGN.md`.
2. [ ] **Runtime Independence:** Core code has zero `process.env` calls and zero `node:*` imports.
3. [ ] **Supabase Decoupling:** Uses `SupabaseAuthClient` structural interface without mandatory heavy dependency on `@supabase/supabase-js`.
4. [ ] **Public API Completeness:** Exports all 5 required functions (`getCurrentUser`, `requireUser`, `requireRole`, `requirePermission`, `requireTenantMembership`).
5. [ ] **AuthContext Normalization:** `AuthContext` contains `userId`, `roles?`, `tenantId?`, `permissions?`.
6. [ ] **Multi-Tenant Isolation:** `requireTenantMembership` strictly enforces tenant checks and throws `TENANT_ACCESS_DENIED` on cross-tenant attempts.
7. [ ] **Normalized Error Model:** Implements `AuthError` with status codes and 4 error types (`UNAUTHENTICATED`, `FORBIDDEN`, `TENANT_ACCESS_DENIED`, `INVALID_SESSION`).
8. [ ] **Test Coverage:** All 8 required test scenarios are mapped in the Test Requirements table.
