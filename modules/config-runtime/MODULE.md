# Config/Runtime Module

**Version:** 0.1.0 (P0, experimental)
**Status:** Reusable embedded module — design + core implemented, docs stage.

## Architecture

Module นี้เป็น **reusable embedded module** — ไม่ใช่ standalone service หรือ framework
Host project ที่ต้องการ config ที่ validate/normalize/type-coerce/redact จะ **embed** module นี้
เข้าไปใน codebase ของตัวเอง แล้วเรียก public API จาก code ของตัวเอง

Module ทำหน้าที่เดียว: รับ raw config ที่ Host inject เข้ามา → validate → normalize → type-coerce
→ redact secrets → expose เป็น runtime context ที่ immutable

Module **ไม่** อ่าน env เอง (`process.env` / `env` / `globalThis`) — Host เป็นคนอ่าน env
แล้ว inject config ผ่าน function argument

### หน้าที่ของ host project

| สิ่งที่ host ต้องทำ | สิ่งที่ module ทำให้ |
|---|---|
| อ่าน env / secrets ของตัวเอง | รับ config ผ่าน `parseConfig(schema, hostConfig)` |
| ประกาศ schema ด้วย `defineConfig(schema)` | validate schema shape ที่ definition time |
| inject raw config | validate, normalize, type-coerce, ใส่ default, freeze |
| เรียก `createRuntimeContext(partial)` | normalize runtime info เป็น `RuntimeContext` ที่ freeze |
| ใช้ `redactConfig` ตอน log / error | mask secret เป็น `[REDACTED]` |

## Public API

ทุก function เป็น pure + synchronous และ export จาก `./core` (barrel) — ห้าม import จากไฟล์ย่อย

```ts
import {
  defineConfig,
  parseConfig,
  validateConfig,
  redactConfig,
  createRuntimeContext,
} from './core';
```

| function | signature | หน้าที่ |
|---|---|---|
| `defineConfig` | `(schema: Record<string, ConfigField>) => ConfigSchema` | validate schema shape, freeze, return schema |
| `parseConfig` | `(schema, hostConfig) => ParsedConfig` | primary entry — validate + coerce + ใส่ default, freeze |
| `validateConfig` | `(schema, config) => ParsedConfig` | เหมือน parseConfig แต่ **ไม่** ใส่ default |
| `redactConfig` | `(config, schema) => RedactedConfig` | สร้าง object ใหม่, secret → `[REDACTED]` |
| `createRuntimeContext` | `(partial: Partial<RuntimeContext>) => RuntimeContext` | normalize + freeze runtime context |

### `defineConfig(schema)`

- Input: plain object mapping **field name → `ConfigField`**.
- Return: immutable `ConfigSchema` (frozen) — ตัวที่ function อื่นรับ.
- Throws `ConfigError` (`CONFIG_INVALID`) ที่ **definition time** ถ้า schema ผิด
  (เช่น field มีทั้ง `required: true` และ `default`, validator type ไม่รู้จัก, `min > max`).

### `parseConfig(schema, hostConfig)`

- **Primary entry point** สำหรับ Host. รับ schema + raw config ที่ Host สร้างจาก env ของตัวเอง.
- Pipeline: **validate → normalize → type-coerce → redact-ready → expose**.
- Return `ParsedConfig` ที่ **frozen**.
- **ไม่** อ่าน `process.env` / `env` / `globalThis` — อ่านแค่ argument `hostConfig`.
- ใส่ default ให้ optional field ที่หาย, coerce type, validate ทุก field. Fail → throw `ConfigError`.
- **ไม่** mutate object `hostConfig` ที่ส่งเข้าไป.

### `validateConfig(schema, config)`

- Validation + type coercion เหมือน `parseConfig` แต่ **ไม่** ใส่ default.
- ใช้เมื่อมี typed config อยู่แล้วอยาก re-check (เช่น หลัง deserialize).
- Return `ParsedConfig` (frozen) หรือ throw `ConfigError`.

### `redactConfig(config, schema)`

- Return **object ใหม่** (ไม่ mutate input) โดย field ที่ `secret: true` ถูกแทนด้วย string `[REDACTED]`.
- ใช้สำหรับ logging / debug / error serialization เท่านั้น.
- Non-secret field copy ผ่าน unchanged (shallow copy ระดับบน; nested object copy by reference).

### `createRuntimeContext(partial)`

- รับ `Partial<RuntimeContext>` → return `RuntimeContext` ที่ normalize + frozen.
- ใส่ default ให้ field ที่หาย (ดูตารางด้านล่าง).
- Throws `RUNTIME_CONTEXT_INVALID` ถ้า field ที่ส่งเข้ามามี type ผิด (เช่น `environment` ไม่ใช่ string).

## Config contract

### `ConfigField`

```ts
interface ConfigField {
  required?: boolean;   // ต้องมี. Mutually exclusive กับ `default`.
  default?: unknown;    // ค่า default เมื่อ field ไม่มี. Mutually exclusive กับ `required: true`.
  secret?: boolean;     // mark เป็น secret → redact เป็น `[REDACTED]`.
  validate?: Validator; // ถ้า omit → field ผ่านผ่าน (loose passthrough, ไม่ coerce ไม่ validate).
}
```

- `required` + `default` ใช้พร้อมกันไม่ได้ → schema error (`CONFIG_INVALID`).
- ถ้าไม่ตั้งทั้งสอง → field เป็น **optional** และเมื่อไม่มี จะ **omit** ออกจาก parsed config (ไม่ set เป็น `undefined`).
- `secret` เป็นอิสระจาก `required`/`default`.
- ถ้า omit `validate` → field รับค่าใดก็ได้ (ผ่านผ่าน as-is).

### `Validator`

```ts
type Validator =
  | { type: 'string' }
  | { type: 'integer'; min?: number; max?: number }
  | { type: 'positiveNumber'; min?: number; max?: number }
  | { type: 'boolean' }
  | { type: 'url' }
  | { type: 'enum'; values: readonly string[] }
  | { type: 'custom'; fn: (value: unknown) => boolean | string };
```

| Validator | รับ | Coerce เป็น | Reject |
|---|---|---|---|
| `string` | string | string | non-string |
| `integer` | number หรือ numeric string | number (integer) | non-integer, NaN, ±Infinity, เกิน `Number.MAX_SAFE_INTEGER` |
| `positiveNumber` | number หรือ numeric string | number | ≤ 0, NaN, ±Infinity |
| `boolean` | `"true"`/`"false"` (string) หรือ `true`/`false` (boolean) | boolean | string อื่น (`"yes"`, `"1"`, `"0"`, `"on"`, `"off"`) หรือ non-boolean |
| `url` | string | string (validated) | non-string หรือ URL parse ไม่ผ่าน |
| `enum` | string | string | ค่าไม่อยู่ใน `values` |
| `custom` | any | unchanged | `fn` return `false` หรือ non-empty string (string นั้นคือ error message) |

**Boolean coercion เป็นแบบ strict.** Boolean field รับได้เฉพาะ literal string `"true"`/`"false"`
(หรือ boolean จริง) เท่านั้น — **`"false"` ต้องไม่ coerce เป็น `true`** (ไม่ใช้ JS truthiness).
String อื่น → `CONFIG_TYPE_INVALID`.

**Numeric checks ตามลำดับ:** (1) finite number หรือ numeric string; (2) ไม่ใช่ `NaN`;
(3) ไม่ใช่ `±Infinity`; (4) `integer` → เป็น integer ภายใน `Number.MAX_SAFE_INTEGER`;
(5) `positiveNumber` → `> 0`; (6) optional range `[min, max]` (inclusive).
Fail → `CONFIG_TYPE_INVALID` หรือ `CONFIG_VALUE_OUT_OF_RANGE`.

### `RuntimeContext`

```ts
interface RuntimeContext {
  environment?: string;
  runtime?: string;
  region?: string;
  requestId?: string;
  correlationId?: string;
  metadata?: Record<string, unknown>;
}
```

- **ไม่** hard-code runtime list — `runtime` เป็น free-form string (`"cloudflare-workers"`, `"node"`, `"bun"`, `"deno"`).
  Module ตรวจแค่ว่าเป็น string ถ้ามี.
- ทุก field เป็น optional. `createRuntimeContext` ใส่ default + freeze.

**Defaults ที่ `createRuntimeContext` ใส่:**

| field | default เมื่อไม่มี |
|---|---|
| `environment` | `"development"` |
| `runtime` | `"unknown"` |
| `region` | `"unknown"` |
| `requestId` | `""` |
| `correlationId` | `""` |
| `metadata` | `{}` |

### `ParsedConfig` / `RedactedConfig`

```ts
type ParsedConfig = Readonly<Record<string, unknown>>;   // frozen
type RedactedConfig = Readonly<Record<string, unknown>>; // secret → "[REDACTED]"
```

## Error codes

ทุก error ที่ module throw เป็น `ConfigError`:

```ts
interface ConfigError {
  code: ConfigErrorCode;
  field: string;   // ชื่อ field, หรือ "" สำหรับ schema-level / runtime-context-level
  message: string; // human-readable, MUST NOT มี secret value
}

type ConfigErrorCode =
  | 'CONFIG_MISSING'
  | 'CONFIG_INVALID'
  | 'CONFIG_TYPE_INVALID'
  | 'CONFIG_VALUE_OUT_OF_RANGE'
  | 'RUNTIME_CONTEXT_INVALID';
```

| code | เมื่อไหร่ | `field` |
|---|---|---|
| `CONFIG_MISSING` | field ที่ `required: true` หายจาก `hostConfig` | ชื่อ field ที่หาย |
| `CONFIG_INVALID` | schema ผิด (required+default, validator type ไม่รู้จัก) หรือ custom validator return `false` | ชื่อ field (หรือ `""` สำหรับ schema-level) |
| `CONFIG_TYPE_INVALID` | ค่า fail type coercion (เช่น `"yes"` สำหรับ boolean) | ชื่อ field |
| `CONFIG_VALUE_OUT_OF_RANGE` | ค่า numeric อยู่นอก `[min, max]` | ชื่อ field |
| `RUNTIME_CONTEXT_INVALID` | `createRuntimeContext` ได้ field type ผิด | ชื่อ field |

**Secret safety:** error message **ห้าม** มี secret value — อ้างแค่ชื่อ field
(เช่น `"field 'apiKey' is required"`). `ConfigError` object ต้องไม่ carry raw value ของ secret field.
`redactConfig` คือทางเดียวที่ sanctioned ในการ serialize config สำหรับ log/error.

## Security

1. **No mutation of Host input.** `parseConfig` / `validateConfig` / `redactConfig` ไม่ mutate
   object ที่ส่งเข้าไป — ทำงานบน copy.
2. **Prototype pollution prevention.** อ่าน field จาก untrusted `hostConfig` ด้วย own enumerable
   properties เท่านั้น (`Object.hasOwn` / `hasOwnProperty.call`). Key อย่าง `__proto__`,
   `constructor`, `prototype` ถูก reject/ignore. Output สร้างด้วย null-prototype-safe approach
   (`Object.create(null)`) — hostile key ไม่สามารถ pollute `Object.prototype`.
3. **Immutable output.** `ParsedConfig` และ `RuntimeContext` ที่ return ถูก freeze — downstream ไม่แก้ได้.
4. **No env access.** Module ไม่ reference `process.env` / `env` / `globalThis` — config เข้าผ่าน argument.
5. **No `node:*` imports.** ถ้าต้อง crypto ให้ใช้ Web Crypto API (`crypto.subtle`) เท่านั้น.
   Module นี้ปัจจุบันไม่มี crypto requirement — รันบน Cloudflare Workers ได้.

## การใช้งาน

```ts
import { defineConfig, parseConfig, createRuntimeContext, redactConfig } from './core';

const schema = defineConfig({
  dbUrl: { required: true, validate: { type: 'url' } },
  apiKey: { required: true, secret: true, validate: { type: 'string' } },
  debug: { default: 'false', validate: { type: 'boolean' } },
  maxRetries: { default: '3', validate: { type: 'integer', min: 1, max: 10 } },
});

const config = parseConfig(schema, {
  dbUrl: env.DB_URL,
  apiKey: env.API_KEY,
  debug: env.DEBUG,
  maxRetries: env.MAX_RETRIES,
});

const runtime = createRuntimeContext({
  environment: 'production',
  runtime: 'cloudflare-workers',
  requestId: request.headers.get('cf-ray') ?? undefined,
});

const safe = redactConfig(config, schema); // apiKey → "[REDACTED]"
console.log('config', safe);
```

ดูตัวอย่างเต็มใน `integration.example.ts`

## Config (host project เป็นคน inject — module ห้ามอ่าน env เอง)

Module นี้ **ไม่** กำหนดชื่อ env var — Host ประกาศ schema เอง แล้วอ่าน env ของตัวเอง
แล้ว inject ผ่าน `parseConfig`. ตัวอย่าง env ที่ Host อาจมี:

- `DB_URL` — database URL (required, `url`)
- `API_KEY` — secret (required, `string`, `secret: true`)
- `DEBUG` — boolean string (`"true"`/`"false"`)
- `MAX_RETRIES` — integer string

**Local dev:** ใช้ `.dev.vars` (ถ้าเป็น Cloudflare Worker) — ห้าม commit เข้า Git.

## กติกาการแก้ module นี้

1. ห้ามให้ module อ่าน `env` / `process.env` / `globalThis` เอง — ทุก config ต้องผ่าน function argument.
2. ห้ามใส่ business logic เฉพาะโปรเจกต์เข้า `core/` — ถ้าต้อง custom ให้ทำใน integration layer ฝั่ง host.
3. Validator ใหม่ต้อง implement ผ่าน `Validator` union ใน `core/types.ts` — ห้ามแก้ interface เพื่อเอื้อ validator เดียว.
4. Crypto ใช้ Web Crypto API (`crypto.subtle`) เท่านั้น — ห้ามใช้ `node:crypto` (ทำให้รันบน Cloudflare Workers ไม่ได้).
5. ห้ามแก้ `core/*.ts` โดยไม่ผ่าน design — contract ยังไม่นิ่ง (P0, experimental).

## Integration checklist (สำหรับ agent/dev ที่เอา module นี้ไป embed ในโปรเจกต์)

- [ ] Copy โฟลเดอร์ module ทั้งก้อนเข้า repo ปลายทาง
- [ ] ประกาศ schema ด้วย `defineConfig` — ระบุ field, validator, secret, required/default
- [ ] อ่าน env ของตัวเอง แล้ว inject ผ่าน `parseConfig(schema, hostConfig)`
- [ ] เรียก `createRuntimeContext(partial)` ที่จุดที่ต้องการ runtime info
- [ ] ใช้ `redactConfig` เท่านั้นตอน log / error — ห้าม log raw config
- [ ] รัน `npm run typecheck` และ `npm test` ให้ผ่านก่อน deploy
- [ ] Deploy แล้วยิง request จริง 1 ครั้ง เช็คว่า config ถูกต้องและ secret ถูก redact

## Versioning

Semver ธรรมดา — เปลี่ยนเลขใน `VERSION` ทุกครั้งที่แก้ไข ยังไม่มี CHANGELOG/migration guide
จนกว่าจะผ่านการใช้งานจริง ≥2 โปรเจกต์แล้ว contract เริ่มนิ่ง

## Promote เป็น shared package เมื่อไหร่

เมื่อ module นี้ถูก embed เข้าโปรเจกต์จริงแล้วใช้งาน ≥2-3 โปรเจกต์ โดยไม่ต้องแก้ core contract
(แก้แค่ schema/config ที่ inject เข้ามา) — ถึงตอนนั้นค่อยแยกเป็น npm package
