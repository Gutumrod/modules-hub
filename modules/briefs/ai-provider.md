# MODULE 11 — AI Provider

## Objective

สร้าง abstraction สำหรับ AI inference พื้นฐาน

ไม่ใช่ Agent Framework

---

## v0.1 Scope

รองรับ:

```text
generateText
generateStructured
```

เท่านั้น

---

## Provider Interface

```ts
interface AIProvider {
  generateText(request)
  generateStructured(request)
}
```

---

## Request

```ts
type AIRequest = {
  model?: string

  system?: string

  prompt: string

  temperature?: number

  maxOutputTokens?: number

  metadata?: Record<string, unknown>
}
```

---

## Response

```ts
type AIResponse = {
  success: boolean

  text?: string

  structured?: unknown

  provider: string
  model?: string

  usage?: {
    inputTokens?: number
    outputTokens?: number
  }

  error?: ErrorShape
}
```

---

## v0.1 Provider

เลือก implement ตัวเดียวก่อน

แนะนำ:

```text
OpenAI หรือ Ollama
```

ตาม project pilot ที่จะใช้

ไม่ต้องทำสองตัวพร้อมกันเพียงเพราะรองรับได้

---

## Structured Output

ต้องมี schema/validator จาก Host

Provider output ต้อง validate ก่อนคืน `success`

---

## Timeout

ทุก request ต้องมี timeout

---

## Error Normalize

Normalized:

```text
RATE_LIMITED
MODEL_NOT_FOUND
INVALID_RESPONSE
TIMEOUT
NETWORK_ERROR
PROVIDER_ERROR
```

---

## Secrets

Host inject:

```text
API key
base URL
model
```

Core ห้ามอ่าน env เอง

---

## Out of Scope

ห้ามทำ:

```text
agent orchestration
memory
tools
MCP
RAG
vector database
prompt management platform
automatic model routing
multi-agent
```

---

## Tests

```text
text success
structured success
invalid structured response
provider error
timeout
rate limit
usage normalization
secret leakage
```

---

## Definition of Done

```text
[ ] Provider contract
[ ] Text generation
[ ] Structured generation
[ ] One real provider
[ ] Validation
[ ] Timeout
[ ] errors
[ ] tests
[ ] MODULE.md
```

---
