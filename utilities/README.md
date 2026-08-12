# Shared Utilities

> พื้นที่เก็บแนวคิด **Shared Utilities** — reusable helpers ขนาดเล็ก ใช้ซ้ำข้ามหลาย Module/Project ได้
> แต่ยังไม่ต้องมี architecture, versioning หรือ lifecycle ใหญ่แบบ Full Module

## Purpose

`utilities/` ใช้เก็บ reusable helpers ขนาดเล็กที่ไม่มี business domain และไม่มี infrastructure lifecycle ใหญ่

ต่างจาก Full Module (เช่น Notification, Payment, Storage, Webhook Receiver) ที่มี `core`, `provider/adapter`, `config`, `tests`, `version`, `MODULE.md`, `integration` — Utility เป็นแค่ function/helper ขนาดเล็ก เช่น:

```text
date conversion
ID generation
pagination calculation
safe serialization
money conversion
redaction
```

## Rules

- Utility ต้อง generic
- ห้ามรู้จัก project ใด project หนึ่ง
- ห้าม hard-code business rules
- ห้ามอ่าน env/secrets
- ห้าม network request เว้นแต่ utility นั้นถูก promote/reclassified เป็น Module
- ห้าม dependency ใหญ่โดยไม่มีเหตุผล
- Prefer pure functions
- Input/output ต้อง predictable
- ต้องสามารถ test แยกได้เมื่อเริ่ม implementation

## Promotion

Utility จะถูก implement เมื่อพบการใช้งานซ้ำจริง

หาก utility เริ่มมี:

```text
provider
adapter
persistent storage
network
configuration
deployment concerns
```

ให้ประเมินใหม่ว่าควรย้ายไปเป็น Full Module หรือไม่

---

## Utility Drafts

| Utility | Path | Status |
|---|---|---|
| Date Time | [date-time/DRAFT.md](./date-time/DRAFT.md) | idea |
| ID Generator | [id-generator/DRAFT.md](./id-generator/DRAFT.md) | idea |
| Pagination | [pagination/DRAFT.md](./pagination/DRAFT.md) | idea |
| Query Filter | [query-filter/DRAFT.md](./query-filter/DRAFT.md) | idea |
| Redaction | [redaction/DRAFT.md](./redaction/DRAFT.md) | idea |
| Serialization | [serialization/DRAFT.md](./serialization/DRAFT.md) | idea |
| String Normalizer | [string-normalizer/DRAFT.md](./string-normalizer/DRAFT.md) | idea |
| Money | [money/DRAFT.md](./money/DRAFT.md) | idea |
| Retry | [retry/DRAFT.md](./retry/DRAFT.md) | idea |
| Request ID | [request-id/DRAFT.md](./request-id/DRAFT.md) | idea |

> สถานะเริ่มต้นทุกตัว: `idea` — ยังไม่ implement จนกว่าจะพบการใช้งานซ้ำจริง ≥2 Modules/Projects
