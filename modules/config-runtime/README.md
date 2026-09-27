# Config Runtime

A reusable, dependency-free Config/Runtime module: the host reads its own environment and injects
a raw config object, and the module validates, type-coerces, applies defaults, redacts secrets and
exposes an immutable config plus a normalized runtime context.

It is deliberately one small pipeline — `validate → normalize → type-coerce → redact → expose` —
with no schema framework, no env access and no business logic.

## install — Install

This module is copy-and-own: the source is the deliverable. There is no published npm package for
it and no registry install step, and it ships zero runtime dependencies, so nothing is added to
your application's dependency tree.

1. Copy the entire `config-runtime/` module directory into your project — for example to
   `src/modules/config-runtime/`. Copy the whole directory (`core/`, `tests/`, `examples/`,
   `integration.example.ts`, `MODULE.md`, `DESIGN.md`, `VERSION`, `package.json`,
   `package-lock.json`, `tsconfig.json`, `vitest.config.ts`), not individual files.
2. Inside the copied directory run `npm ci` to install the dev toolchain used by the tests and the
   example (vitest, vite-node, typescript and the coverage/mutation tools) from the shipped
   `package-lock.json`. This step is only needed to run the tests and the example; it is not needed
   to use the module in your application.
3. Import the module from your own copy's public entry point (`./modules/config-runtime/core/index.js`)
   and adapt only that copy. Never import the module across projects from the directory you copied
   it out of.

Node.js with npm is required for step 2 (this round was run on Node.js v22.23.2 with npm 12.0.2).
Your application additionally needs a bundler or a TypeScript-capable runner — see runtime.

## quickstart — Quickstart

The shortest path from a copied module to a first successful call. The host declares the schema and
reads its own environment; the module reads nothing by itself:

```ts
// your-app/src/config.ts  (module copied to your-app/src/modules/config-runtime/)
import {
  defineConfig,
  parseConfig,
  redactConfig,
} from './modules/config-runtime/core/index.js';

// 1. Declare the schema once. defineConfig validates the schema shape at definition time.
const schema = defineConfig({
  dbUrl: { required: true, validate: { type: 'url' } },
  apiKey: { required: true, secret: true, validate: { type: 'string' } },
  debug: { default: 'false', validate: { type: 'boolean' } },
  maxRetries: { default: '3', validate: { type: 'integer', min: 1, max: 10 } },
});

// 2. The host reads its OWN env and injects the raw values. The module never reads process.env.
const config = parseConfig(schema, {
  dbUrl: process.env.DB_URL,
  apiKey: process.env.API_KEY,
  debug: process.env.DEBUG,
  maxRetries: process.env.MAX_RETRIES,
});

// 3. config is validated, typed and frozen. Use it directly.
console.log(config.maxRetries); // number (3 when MAX_RETRIES was not set)
console.log(config.debug); // boolean, coerced from the string "true"/"false"

// 4. For logging only: redactConfig masks secret fields.
console.log(redactConfig(config, schema)); // apiKey shows as "[REDACTED]"
```

The exact command to run the shipped example, from inside the module directory:

```bash
npm run example
```

## example — Example

The module ships one runnable example, `examples/run.ts`, started with a single command:

```bash
npm run example
```

It plays the host itself: it declares a schema, injects an in-file raw config (no environment
reads), then prints what it really observed. Expected output (`npm` prints its own `npm notice run
...` lines first; the program itself prints these five lines):

```text
parsed keys=4 frozen=true debug=boolean:true maxRetries=number:7 region=omitted
redacted apiKey=[REDACTED] dbUrlUnchanged=true revalidatedKeys=4
runtime environment=production runtime=cloudflare-workers region=unknown
error codes=CONFIG_MISSING,CONFIG_TYPE_INVALID,CONFIG_TYPE_INVALID,CONFIG_VALUE_OUT_OF_RANGE,RUNTIME_CONTEXT_INVALID
EXAMPLE_RESULT: OK parsedKeys=4 frozen=true redactedApiKey=[REDACTED] errorCodes=CONFIG_MISSING|CONFIG_TYPE_INVALID|CONFIG_TYPE_INVALID|CONFIG_VALUE_OUT_OF_RANGE|RUNTIME_CONTEXT_INVALID
```

What it did: `parseConfig` returned 4 keys, typed `debug` as `boolean:true` and `maxRetries` as
`number:7`, left the schema field `region` omitted (optional, no default), and returned a frozen
object. `redactConfig` replaced the secret `apiKey` with `[REDACTED]` while leaving the non-secret
`dbUrl` unchanged, and re-validating the parsed config returned the same 4 keys. Five real error
paths produced exactly the module's five documented codes.

## limitations — Limitations

- Flat scalar fields only. A field value is validated by a single validator from the `Validator`
  union, so nested objects, arrays and object schemas are not supported in this version: a nested
  value either passes through untouched (a field with no `validate`) or fails type coercion. See
  `core/types.ts` and the non-goals section of `DESIGN.md`.
- The module never reads configuration from the environment. `core/` contains no `process.env`,
  `env` or `globalThis` reference, so it cannot load a `.env` file or a platform binding by itself:
  the host must read its own env and pass the raw values to `parseConfig(schema, hostConfig)`.
- Validation runs on plain injected values, and boolean coercion is strict. A boolean field accepts
  only the literal strings `"true"` / `"false"` or real booleans; `"yes"`, `"1"`, `"0"`, `"on"` and
  `"off"` are rejected with `CONFIG_TYPE_INVALID`, and `"false"` never becomes `true`.
- Secret redaction is shallow. `redactConfig` copies the top level only, so a secret nested inside a
  non-secret field's object is copied by reference and is not masked — it is a masking helper for
  flat configs, not a deep sanitizer. A test in `tests/config.test.ts` pins this behaviour.
- Errors are plain objects, not `Error` instances. `parseConfig`, `validateConfig` and
  `createRuntimeContext` throw `ConfigError` values shaped `{ code, field, message }`, so
  `instanceof Error` is false and they must be narrowed by their `code`.
- Validation is synchronous only. There is no async validator, so nothing that requires I/O can be
  expressed in a `Validator`.
- The entry point is TypeScript. Plain Node cannot execute `core/index.ts` directly; you need a
  bundler, a TypeScript-capable runner (vitest/vite-node, as this module's own tests and example
  use) or a compile step — see runtime for what that means in practice.

## api — API

Everything is exported from the public entry point `core/index.ts`; do not import sub-files directly.

- `defineConfig(schema)` — validate the schema shape, freeze it and return the `ConfigSchema` the
  other functions accept. Throws `CONFIG_INVALID` at definition time for a malformed field.
- `parseConfig(schema, hostConfig)` — the primary entry point: validate + type-coerce + apply
  defaults + freeze. Throws `ConfigError` on any bad field; never mutates `hostConfig`.
- `validateConfig(schema, config)` — the same validation and coercion as `parseConfig` but without
  applying defaults; for re-checking an already typed config.
- `redactConfig(config, schema)` — return a new object with every `secret: true` field replaced by
  the string `"[REDACTED]"`; the input is not mutated.
- `createRuntimeContext(partial)` — normalize and freeze a runtime context, filling defaults.
- `ConfigField` (type) — one schema field: `{ required?, default?, secret?, validate? }`.
- `Validator` (type) — the validation union: `string`, `integer` (optional `min`/`max`),
  `positiveNumber` (optional `min`/`max`), `boolean`, `url`, `enum` (`values`), `custom` (`fn`).
- `ConfigSchema` (type) — the frozen `Record<string, ConfigField>` returned by `defineConfig`.
- `ParsedConfig` (type) — frozen `Readonly<Record<string, unknown>>` from parse/validate.
- `RedactedConfig` (type) — frozen `Readonly<Record<string, unknown>>` with masked secrets.
- `RuntimeContext` (type) — `{ environment?, runtime?, region?, requestId?, correlationId?, metadata? }`.
- `ConfigError` (type) — the thrown shape `{ code, field, message }`; `message` never carries a
  secret value.
- `ConfigErrorCode` (type) — the five codes below.

Error codes thrown by the module (all are `ConfigError.code` values in `core/types.ts`):
`CONFIG_MISSING` (a `required: true` field was absent), `CONFIG_INVALID` (malformed schema, or a
`custom` validator returned `false`/a message), `CONFIG_TYPE_INVALID` (type coercion failed),
`CONFIG_VALUE_OUT_OF_RANGE` (a numeric value fell outside `[min, max]`) and
`RUNTIME_CONTEXT_INVALID` (a `createRuntimeContext` field had the wrong type).

## tests — Tests

Run the suite from the module directory with:

```bash
npm test
```

Observed in this packaging round, `npm test` exited 0 and reported `Test Files 2 passed (2)` and
`Tests 95 passed (95)` — 95 tests in two files, made up of 88 pre-existing module tests in
`tests/config.test.ts` plus 7 tests in `tests/docs-contract.test.ts` that guard the documentation
below. Type checking is a separate gate:

```bash
npm run typecheck
```

## strengths — Strengths

- Errors are structured and secret-safe. A failed field produces `{ code, field, message }` with one
  of five codes, and the message names the field only — `tests/config.test.ts` asserts that the
  serialized error of a failing secret field does not contain the secret value and that the error
  object carries no extra keys beyond `code`, `field` and `message`.
- Hostile input is handled deliberately. Fields are read only from own enumerable properties,
  `__proto__` / `constructor` / `prototype` are rejected in a schema and skipped in config, and the
  parsed output is built as a null-prototype object; the prototype-pollution tests assert that
  `Object.prototype` is never touched and that `Object.getPrototypeOf(result)` is `null`.
- Outputs are immutable. Every producer (`parseConfig`, `validateConfig`, `redactConfig`,
  `createRuntimeContext`) returns a frozen object, asserted with `Object.isFrozen` in
  `tests/config.test.ts`; inputs are never mutated either, which the suite also checks.
- Boolean coercion is strict and pinned by tests: `"false"` must not become `true`, and `"yes"`,
  `"1"`, `"0"`, `"on"`, `"off"` must all raise `CONFIG_TYPE_INVALID`.
- Zero runtime dependencies and zero `node:*` imports. `package.json` declares no `dependencies`,
  and `core/` imports nothing but its own files — no `process.env`, no `globalThis`, no filesystem
  and no crypto — so the module adds nothing to your runtime.
- Type checking is enforced, not optional: `tsc --noEmit` (`npm run typecheck`) covers `core/`,
  `tests/` and the example, and this round exited 0.

## runtime — Runtime

- Runtime dependencies: none. `package.json` declares only devDependencies — `vitest`,
  `@vitest/coverage-v8`, `typescript`, `vite-node` and the three `@stryker-mutator/*` packages —
  which are needed to run the tests, the example and mutation checks, not to use the module.
- Node builtins used by the module: none. `core/` contains no `node:*` import; the source uses only
  `URL`, `Object`, `Set`, `Number` and `Math`, and it never reads `process.env`, `env` or
  `globalThis`.
- Where it runs: anywhere that executes ES2022 TypeScript through a bundler or a TypeScript-capable
  runner with `moduleResolution: Bundler`. That covers Node.js applications built with
  Vite/esbuild/tsc and bundler-based edge and worker projects — the core is environment-agnostic
  and needs no Node-only API, so it is usable in a Cloudflare Worker (this is why the module may not
  use `node:crypto`; if crypto is ever needed it must be Web Crypto).
- Where it does not run as-is: plain Node cannot execute the TypeScript entry point. Importing the
  module from your own application therefore means going through your bundler or runner; if you want
  plain `node` to load it, you must compile it first — this round verified that compiling the module
  with its own `tsconfig.json` and then importing the compiled `core/index.js` with plain Node
  succeeds, with all five public functions present.
- Type checking uses the shipped `tsconfig.json` (`tsc --noEmit`, `target ES2022`, `module ES2022`,
  `moduleResolution Bundler`, strict). Run `npm run typecheck` in the copied module directory before
  you deploy.
