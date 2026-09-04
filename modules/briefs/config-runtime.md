# 1 — CONFIG / RUNTIME

> **Document role:** Historical implementation brief/input. Current version, maturity, public API, and limitations are governed by `../REGISTRY.md`, `../ROADMAP.md`, and the module’s `MODULE.md`/`DESIGN.md`. Do not treat old Planned/Stage labels in this brief as current status.


## Classification

```text
Full Module
Priority: P0
Status: Planned
Initial Version: 0.1.0 experimental
```

---

## Objective

สร้างมาตรฐานกลางสำหรับรับ config จาก Host Project แล้ว:

```text
validate
normalize
type
redact
expose
```

ให้ Module อื่นไม่ต้องสร้าง config parsing / validation pattern ใหม่ทุกครั้ง

Architecture:

```text
Runtime Environment
       ↓
Host Integration
       ↓
Raw Config Object
       ↓
Config / Runtime Module
       ↓
Validated Typed Config
       ↓
Reusable Module
```

หัวใจสำคัญ:

> Config / Runtime Module ห้ามเป็นคนอ่าน environment variable จาก runtime เอง

Host เป็นคนอ่าน environment แล้วส่งค่าเข้ามา

---

## Responsibilities

Core รับผิดชอบ:

```text
config schema definition
required / optional values
default values
type coercion แบบ explicit
config validation
runtime context normalization
secret field marking
safe/redacted config representation
startup fail-fast errors
```

---

## Public API Concept

ขั้นต่ำควรรองรับแนวคิด:

```ts
defineConfig()
parseConfig()
validateConfig()
redactConfig()
createRuntimeContext()
```

ตัวอย่าง contract:

```ts
type ConfigField<T> = {
  required?: boolean
  default?: T
  secret?: boolean
  validate?: (value: unknown) => T
}
```

Concept:

```ts
const schema = defineConfig({
  API_URL: {
    required: true
  },

  API_KEY: {
    required: true,
    secret: true
  },

  TIMEOUT_MS: {
    default: 5000
  }
})
```

Host เป็นคนส่ง:

```ts
parseConfig(schema, hostSuppliedConfig)
```

ไม่ใช่:

```ts
parseConfig(process.env)
```

จากภายใน Core

---

## Runtime Context

ต้องมี normalized runtime information ที่ Host inject ได้

Concept:

```ts
type RuntimeContext = {
  environment?: "development" | "test" | "staging" | "production"

  runtime?: string

  region?: string

  requestId?: string
  correlationId?: string

  metadata?: Record<string, unknown>
}
```

อย่า hard-code runtime list จนเพิ่ม runtime ใหม่ไม่ได้

---

## Validation

รองรับพื้นฐาน:

```text
required
string
integer
positive number
boolean
URL
enum
ISO duration/time values ตามความจำเป็น
custom validator
```

ห้ามสร้าง schema-validation framework ขนาดใหญ่ขึ้นมาใหม่

ถ้า project ใช้ validation library อยู่แล้ว ให้สร้าง integration ที่บางและชัดเจน

---

## Type Coercion

ห้ามมี implicit coercion ที่เดายาก

ตัวอย่าง:

```text
"false"
```

ห้ามกลายเป็น:

```text
true
```

เพียงเพราะ JavaScript truthy

boolean parsing ต้อง explicit

numeric parsing ต้องตรวจ:

```text
NaN
Infinity
negative values
integer requirement
range
```

---

## Secrets

Schema ต้องสามารถ mark field เป็น secret

เช่น:

```text
API_KEY
SECRET
TOKEN
PASSWORD
AUTHORIZATION
```

เมื่อ serialize config สำหรับ:

```text
logging
debug
error details
diagnostics
```

ต้อง redact

เช่น:

```text
sk_live_xxxxx
```

กลายเป็น:

```text
[REDACTED]
```

---

## Error Contract

ขั้นต่ำ:

```text
CONFIG_MISSING
CONFIG_INVALID
CONFIG_TYPE_INVALID
CONFIG_VALUE_OUT_OF_RANGE
RUNTIME_CONTEXT_INVALID
```

Error ต้องบอก:

```text
field
code
safe message
```

แต่ห้ามคืน secret value

---

## Runtime Adapters

Core ไม่ detect runtime เอง

ถ้ามี integration helper ให้แยก adapter เช่น:

```text
adapters/node/
adapters/deno/
adapters/cloudflare/
```

แต่ **v0.1 ไม่จำเป็นต้อง implement ทุก runtime**

Implement เฉพาะ adapter ที่มี project pilot จริง

---

## Security

ต้องป้องกัน:

```text
secret leakage
raw config dumping
unsafe coercion
prototype pollution จาก untrusted config object
unexpected inherited properties
runtime-global mutation
```

Config ที่ parse แล้วควร treat เป็น immutable configuration

อย่างน้อยต้องไม่ mutate input object ของ Host

---

## Out of Scope

ห้ามทำใน v0.1:

```text
secret manager
Vault replacement
dotenv replacement
remote config platform
feature flags
dynamic configuration dashboard
environment deployment
config synchronization
database configuration management
```

Feature Flags เป็นคนละ Module

---

## Tests

ขั้นต่ำ:

```text
required config success
missing required config
default value
valid boolean parsing
invalid boolean
valid integer
invalid integer
invalid URL
custom validation
secret redaction
nested secret leakage
input object not mutated
runtime context validation
safe error serialization
```

---

## Definition of Done

```text
[ ] Core ไม่อ่าน global env
[ ] Host inject config
[ ] Schema contract ชัด
[ ] Required/default values
[ ] Explicit coercion
[ ] RuntimeContext contract
[ ] Secret field support
[ ] Safe redaction
[ ] Structured config errors
[ ] Tests ครบ
[ ] Integration example
[ ] MODULE.md
[ ] VERSION = 0.1.0
[ ] typecheck ผ่าน
[ ] tests ผ่าน
[ ] Known limitations documented
```

---
