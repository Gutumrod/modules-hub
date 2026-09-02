# Config/Runtime Module — DESIGN.md

**Version:** 0.1.0 (P0, experimental)
**Status:** Design (Stage 1 — Architect). This file is the single source of truth for downstream agents (Stage 2 implementer, Stage 3 tester, Stage 4 reviewer).
**Language / runtime:** TypeScript, ES2022, strict mode, `moduleResolution: Bundler`. Must run on Cloudflare Workers (no `node:*` imports; Web Crypto API only if crypto is needed).

---

## 1. Purpose

A reusable **Config/Runtime module** that standardizes how a Host Project supplies configuration to other modules. It defines a single pipeline:

```
validate → normalize → type → redact → expose
```

The module **must NOT read global env itself**. The Host reads env and injects config via the public API. The module has **no business-specific logic** (no booking/ticket/shop/order).

### Host responsibilities vs module responsibilities

| Host does | Module does |
|---|---|
| Reads `process.env` / `env` / `globalThis` | Never touches env — receives config as an argument |
| Declares a schema with `defineConfig(schema)` | Validates, coerces types, redacts secrets, exposes runtime context |
| Injects raw config via `parseConfig(schema, hostConfig)` | Returns a validated, typed, immutable config object |
| Calls `createRuntimeContext(partial)` with runtime info | Normalizes runtime info into a `RuntimeContext` |

---

## 2. Public API (exact signatures)

All functions are pure and synchronous unless noted. All are exported from the module's public entry point (`core/index.ts`).

```ts
// core/schema.ts
export function defineConfig(schema: Record<string, ConfigField>): ConfigSchema;

// core/parse.ts
export function parseConfig(schema: ConfigSchema, hostConfig: Record<string, unknown>): ParsedConfig;
export function validateConfig(schema: ConfigSchema, config: Record<string, unknown>): ParsedConfig;

// core/redact.ts
export function redactConfig(config: ParsedConfig, schema: ConfigSchema): RedactedConfig;

// core/runtime.ts
export function createRuntimeContext(partial: Partial<RuntimeContext>): RuntimeContext;
```

### 2.1 `defineConfig(schema)`

- Input: a plain object mapping **field name → `ConfigField`**.
- Returns an immutable `ConfigSchema` (frozen). The returned schema is what downstream functions accept.
- Throws a `ConfigError` (`CONFIG_INVALID`) at **definition time** if the schema itself is malformed (e.g. a field has both `required: true` and a `default`, or an unknown validator type). This catches schema bugs early, before any host config is parsed.

### 2.2 `parseConfig(schema, hostConfig)`

- The **primary entry point** for a Host. Takes the schema and the raw config object the Host built from its own env.
- Pipeline: **validate → normalize → type-coerce → redact-ready → expose**.
- Returns a `ParsedConfig` (see §5) that is **immutable** and **frozen**.
- **Never reads `process.env`, `env`, or `globalThis`.** It only reads the `hostConfig` argument.
- Applies defaults for missing optional fields, coerces types, and validates every field. On any failure it throws a structured `ConfigError` (see §6).
- Does **not** mutate the `hostConfig` input object (see §7 Security).

### 2.3 `validateConfig(schema, config)`

- Same validation + type coercion as `parseConfig`, but **does not apply defaults** and does not require the full parse pipeline. Used when the caller already has a typed config and wants a re-check (e.g. after deserialization).
- Returns a `ParsedConfig` (frozen) or throws a structured `ConfigError`.
- Semantics: identical validation rules to `parseConfig`; the only difference is defaults are **not** injected here.

### 2.4 `redactConfig(config, schema)`

- Returns a **new** object (never mutates input) where every field with `secret: true` is replaced by the literal string `[REDACTED]`.
- Used for logging, debug output, and error serialization.
- Non-secret fields are copied through unchanged (shallow copy of the top level; nested objects are copied by reference — see §7 note on deep immutability).

### 2.5 `createRuntimeContext(partial)`

- Accepts a partial `RuntimeContext` and returns a fully-normalized, frozen `RuntimeContext`.
- Fills in defaults for missing optional fields (see §4.2).
- Throws `RUNTIME_CONTEXT_INVALID` if a provided field has the wrong type (e.g. `environment` is not a string).

---

## 3. `ConfigField` type (exact)

```ts
export interface ConfigField {
  /** Field is required. Mutually exclusive with `default`. */
  required?: boolean;
  /** Default value applied when the field is absent. Mutually exclusive with `required: true`. */
  default?: unknown;
  /** Mark as secret → redacted to `[REDACTED]` when serialized. */
  secret?: boolean;
  /** Validation spec. If omitted, the field is passed through as-is — no type coercion, no validation (loose passthrough). */
  validate?: Validator;
}

export type Validator =
  | { type: 'string' }
  | { type: 'integer' }
  | { type: 'positiveNumber' }
  | { type: 'boolean' }
  | { type: 'url' }
  | { type: 'enum'; values: readonly string[] }
  | { type: 'custom'; fn: (value: unknown) => boolean | string };
```

### 3.1 Field rules

- **`required` + `default` are mutually exclusive.** A schema field with both is a schema error (`CONFIG_INVALID`) thrown by `defineConfig`.
- If neither `required` nor `default` is set, the field is **optional** and, when absent, is omitted from the parsed config (not set to `undefined`).
- `secret` is independent of `required`/`default` — a secret field may be required or optional.
- `validate` is optional. When omitted, the field accepts any value (no type coercion, no validation) — it is passed through as-is. This is the "loose passthrough" case.

### 3.2 Validator semantics

| Validator | Accepts | Coerces to | Rejects |
|---|---|---|---|
| `string` | string | string | non-string |
| `integer` | number, or numeric string | number (integer) | non-integer, NaN, ±Infinity, out of `Number.MAX_SAFE_INTEGER` |
| `positiveNumber` | number, or numeric string | number | ≤ 0, NaN, ±Infinity |
| `boolean` | `"true"` / `"false"` (string) or `true` / `false` (boolean) | boolean | any other string (e.g. `"yes"`, `"1"`, `"0"`) or non-boolean |
| `url` | string | string (validated) | non-string, or string that fails URL parse |
| `enum` | string | string | value not in `values` |
| `custom` | any | unchanged | `fn` returns `false` (invalid) or a non-empty string (the string is the error message) |

**Boolean coercion is strict.** A boolean field must only accept the literal strings `"true"` / `"false"` (or actual booleans). It must **never** use JS truthiness — `"false"` must NOT coerce to `true`. Any other string (`"yes"`, `"1"`, `"0"`, `"on"`, `"off"`) is a `CONFIG_TYPE_INVALID` error.

**Numeric coercion checks, in order:** (1) value is a finite number or a numeric string; (2) not `NaN`; (3) not `±Infinity`; (4) for `integer`, is an integer within `Number.MAX_SAFE_INTEGER`; (5) for `positiveNumber`, is `> 0`; (6) optional range via `min`/`max` (see §3.3). Any failure → `CONFIG_TYPE_INVALID` or `CONFIG_VALUE_OUT_OF_RANGE`.

### 3.3 Optional range on numeric validators

To support the "range" requirement without building a framework, numeric validators may carry optional bounds:

```ts
| { type: 'integer'; min?: number; max?: number }
| { type: 'positiveNumber'; min?: number; max?: number }
```

- `min`/`max` are inclusive.
- A value outside `[min, max]` → `CONFIG_VALUE_OUT_OF_RANGE`.
- `min`/`max` are optional; when absent, no range check is applied.

---

## 4. `RuntimeContext` type (exact)

```ts
export interface RuntimeContext {
  environment?: string;
  runtime?: string;
  region?: string;
  requestId?: string;
  correlationId?: string;
  metadata?: Record<string, unknown>;
}
```

### 4.1 Rules

- **Do NOT hard-code a runtime list.** `runtime` is a free-form string (e.g. `"cloudflare-workers"`, `"node"`, `"bun"`, `"deno"`). The module never validates against a fixed enum — it only checks that the value is a string if provided.
- All fields are optional. `createRuntimeContext` fills defaults for missing fields (see below) and freezes the result.
- `metadata` is a free-form bag for host-specific runtime info; the module does not interpret it.

### 4.2 Defaults applied by `createRuntimeContext`

| Field | Default when absent |
|---|---|
| `environment` | `"development"` |
| `runtime` | `"unknown"` |
| `region` | `"unknown"` |
| `requestId` | `""` (empty string) |
| `correlationId` | `""` (empty string) |
| `metadata` | `{}` (empty object) |

- If a provided field has the wrong type (e.g. `environment` is a number), throw `RUNTIME_CONTEXT_INVALID` with `field` set to the offending field name.

---

## 5. `ParsedConfig` / `RedactedConfig` types

```ts
/** Result of parseConfig / validateConfig. Immutable (frozen). */
export type ParsedConfig = Readonly<Record<string, unknown>>;

/** Result of redactConfig. Secret fields replaced with "[REDACTED]". */
export type RedactedConfig = Readonly<Record<string, unknown>>;
```

- `ParsedConfig` is a plain frozen object keyed by field name. Values are the validated + coerced values (defaults applied for `parseConfig`).
- `RedactedConfig` has the same shape but every `secret: true` field's value is the literal string `"[REDACTED]"`.

---

## 6. Structured errors

All errors thrown by the module are instances of `ConfigError` with the shape:

```ts
export interface ConfigError {
  code: ConfigErrorCode;
  field: string;      // field name, or "" for schema-level / runtime-context-level errors
  message: string;    // human-readable, MUST NOT contain secret values
}

export type ConfigErrorCode =
  | 'CONFIG_MISSING'
  | 'CONFIG_INVALID'
  | 'CONFIG_TYPE_INVALID'
  | 'CONFIG_VALUE_OUT_OF_RANGE'
  | 'RUNTIME_CONTEXT_INVALID';
```

### 6.1 Code semantics

| Code | When thrown | `field` |
|---|---|---|
| `CONFIG_MISSING` | A `required: true` field is absent from `hostConfig` | the missing field name |
| `CONFIG_INVALID` | Schema is malformed (e.g. `required`+`default` both set, unknown validator type) OR a `custom` validator returned `false` | the offending field name (or `""` for schema-level) |
| `CONFIG_TYPE_INVALID` | A value fails type coercion (e.g. `"yes"` for a boolean, non-numeric for an integer) | the field name |
| `CONFIG_VALUE_OUT_OF_RANGE` | A numeric value is outside `[min, max]` | the field name |
| `RUNTIME_CONTEXT_INVALID` | `createRuntimeContext` receives a field of the wrong type | the offending field name |

### 6.2 Secret safety

- **Error messages must NEVER contain secret values.** When a secret field fails validation, the message must reference the field name only (e.g. `"field 'apiKey' is required"`), never the value.
- The `ConfigError` object itself must not carry the raw value of any secret field.
- `redactConfig` is the only sanctioned way to serialize config for logging/debug/errors.

---

## 7. Security requirements

1. **No mutation of Host input.** `parseConfig`, `validateConfig`, and `redactConfig` must never mutate the `hostConfig` / `config` object passed in. They operate on copies. (Verify with a test that the input object is unchanged after the call.)
2. **Prototype pollution prevention.** When reading fields from untrusted `hostConfig`, the module must only read **own enumerable properties** (`Object.hasOwn` / `Object.prototype.hasOwnProperty.call`). It must reject or ignore keys like `__proto__`, `constructor`, `prototype`. The parsed output must be created with a null-prototype-safe approach (e.g. `Object.create(null)` or by only assigning own keys) so a hostile key cannot pollute `Object.prototype`.
3. **Immutable output.** `ParsedConfig` and `RuntimeContext` returned by the module are frozen (`Object.freeze`). Downstream code cannot mutate them.
4. **No env access.** The module never references `process.env`, `env`, or `globalThis`. All config enters through function arguments.
5. **No `node:*` imports.** If crypto is ever needed, use the Web Crypto API (`crypto.subtle`) only. This module currently has no crypto requirement.

---

## 8. File structure (exact)

```
config-runtime-module/
├── core/
│   ├── types.ts      ← ConfigField, Validator, ParsedConfig, RedactedConfig, RuntimeContext, ConfigError, ConfigErrorCode
│   ├── schema.ts     ← defineConfig()
│   ├── parse.ts      ← parseConfig() + validateConfig()
│   ├── redact.ts     ← redactConfig()
│   ├── runtime.ts    ← createRuntimeContext()
│   └── index.ts      ← public entry point: re-exports all public API + types
├── tests/
│   └── config.test.ts   ← all 88 unit tests (schema/parse/redact/runtime/prototype-pollution/secret-safety), consolidated into one file instead of the four originally planned below
├── integration.example.ts
├── MODULE.md
├── VERSION           ← 0.1.0
├── package.json
└── tsconfig.json
```

### 8.1 File responsibilities

- **`core/types.ts`** — all shared types only. No logic.
- **`core/schema.ts`** — `defineConfig(schema)`: validates the schema shape, freezes it, returns `ConfigSchema`.
- **`core/parse.ts`** — `parseConfig(schema, hostConfig)` and `validateConfig(schema, config)`: the validate + normalize + type-coerce pipeline. Shared internal coercion helpers live here.
- **`core/redact.ts`** — `redactConfig(config, schema)`: builds a new object with secrets masked.
- **`core/runtime.ts`** — `createRuntimeContext(partial)`: normalizes + freezes a `RuntimeContext`.
- **`core/index.ts`** — public barrel. Re-exports `defineConfig`, `parseConfig`, `validateConfig`, `redactConfig`, `createRuntimeContext`, and all public types. Downstream code imports from `./core` (or the package root), never from individual files.
- **`tests/`** — vitest unit tests. Implemented as a single consolidated `config.test.ts` (88 tests) covering all the areas listed in §9, rather than one file per core unit.
- **`integration.example.ts`** — a reference example showing a Host reading its own env and injecting config (see §10). Not copied verbatim into production.
- **`MODULE.md`** — the module's own documentation (mirrors this design; written by the implementer in Stage 2).
- **`VERSION`** — plain text file containing `0.1.0` (no trailing newline requirement; match notification-module which stores just the number).
- **`package.json`** — see §11.
- **`tsconfig.json`** — see §11.

---

## 9. Test requirements (for Stage 3 tester)

Vitest unit tests must cover at minimum:

All of the following are implemented as `describe` blocks within the single `tests/config.test.ts` (see §8.1) — verified 88/88 passing.

1. **schema (`defineConfig`)**
   - `defineConfig` returns a frozen schema.
   - `required` + `default` on the same field → `CONFIG_INVALID`.
   - Unknown validator type → `CONFIG_INVALID`.
2. **parse (`parseConfig`/`validateConfig`)**
   - Required field present → ok; absent → `CONFIG_MISSING`.
   - Default applied when optional field absent.
   - Boolean: `"true"`/`"false"`/`true`/`false` accepted; `"yes"`, `"1"`, `"0"`, `"on"` → `CONFIG_TYPE_INVALID`; **`"false"` must NOT become `true`**.
   - Integer: `"42"` → `42`; `"4.5"` → `CONFIG_TYPE_INVALID`; `NaN`/`Infinity` rejected.
   - positiveNumber: `0` and negatives → `CONFIG_TYPE_INVALID` (or `CONFIG_VALUE_OUT_OF_RANGE`).
   - Range: value outside `[min, max]` → `CONFIG_VALUE_OUT_OF_RANGE`.
   - URL: valid URL accepted; invalid → `CONFIG_TYPE_INVALID`.
   - Enum: value in `values` accepted; not in → `CONFIG_TYPE_INVALID`.
   - Custom validator: `false` → `CONFIG_INVALID`; string message → `CONFIG_INVALID` with that message; `true` → ok.
   - `validateConfig` does NOT apply defaults (absent optional field stays absent).
   - Input `hostConfig` object is not mutated.
   - Prototype pollution: a key like `__proto__` in `hostConfig` does not pollute `Object.prototype`; parsed output has no `__proto__`/`constructor`/`prototype` own keys.
   - Parsed output is frozen.
3. **redact (`redactConfig`)**
   - Secret fields → `"[REDACTED]"`; non-secret fields unchanged.
   - Input config not mutated.
   - Output is a new object (not the same reference).
4. **runtime (`createRuntimeContext`)**
   - Defaults applied for missing fields.
   - Wrong-typed field → `RUNTIME_CONTEXT_INVALID`.
   - Output is frozen.
   - `runtime` accepts arbitrary strings (no hard-coded enum).

---

## 10. `integration.example.ts` (reference shape)

A generic Cloudflare Worker Host example showing the intended usage. It is a **reference only** — not copied verbatim into production.

```ts
import { defineConfig, parseConfig, createRuntimeContext, redactConfig } from './core';

// Host reads its OWN env (module never does)
interface Env {
  DB_URL: string;
  API_KEY: string;
  DEBUG?: string;
  REGION?: string;
}

const schema = defineConfig({
  dbUrl: { required: true, validate: { type: 'url' } },
  apiKey: { required: true, secret: true, validate: { type: 'string' } },
  debug: { default: 'false', validate: { type: 'boolean' } },
  region: { validate: { type: 'string' } },
});

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const config = parseConfig(schema, {
      dbUrl: env.DB_URL,
      apiKey: env.API_KEY,
      debug: env.DEBUG,
      region: env.REGION,
    });

    const runtime = createRuntimeContext({
      environment: 'production',
      runtime: 'cloudflare-workers',
      requestId: request.headers.get('cf-ray') ?? undefined,
    });

    // For logging only:
    const safe = redactConfig(config, schema);
    console.log('config', safe); // apiKey shows as [REDACTED]

    return new Response('ok');
  },
};
```

---

## 11. `package.json` and `tsconfig.json` (copy conventions from notification-module)

### `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "outDir": "dist"
  },
  "include": ["core", "tests", "integration.example.ts"]
}
```

### `package.json`

```json
{
  "name": "config-runtime-module",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Reusable Config/Runtime module — Host injects config, module validates/normalizes/types/redacts/exposes. Copy into target project, not an npm package until contract stabilizes.",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "devDependencies": {
    "typescript": "5.6.3",
    "vitest": "2.1.4"
  }
}
```

---

## 12. Explicit non-goals (do NOT build)

- ❌ No large schema-validation framework (no zod/ajv/io-ts dependency). Only the small `Validator` union in §3.
- ❌ No env reading of any kind.
- ❌ No business-specific logic.
- ❌ No hard-coded runtime enum.
- ❌ No `node:crypto` / `node:*` imports.
- ❌ No async validation (all validators are synchronous).
- ❌ No nested-schema / object-schema / array-schema support in v0.1.0. Fields are flat scalars (string/integer/positiveNumber/boolean/url/enum/custom). Nested objects are passed through only via the loose no-`validate` case.

---

## 13. Acceptance criteria (for Stage 4 reviewer)

1. `DESIGN.md` exists at `D:/AI-Workspace/projects/modules-hub/modules/config-runtime/DESIGN.md` and matches this spec.
2. Implemented module exposes exactly the 5 public functions in §2 with the exact signatures.
3. `ConfigField` and `RuntimeContext` types match §3 and §4 exactly.
4. Boolean coercion is strict (`"false"` never → `true`).
5. Errors are structured `{ code, field, message }` with the 5 codes in §6 and never leak secret values.
6. Module never reads `process.env` / `env` / `globalThis`.
7. No mutation of Host input; prototype-pollution-safe; parsed output frozen.
8. `npm run typecheck` and `npm test` pass.
9. No `node:*` imports; runs on Cloudflare Workers.
