# ID Generator

Status: idea

## Purpose
สร้าง identifiers ที่ predictable และลดการ implement random ID ซ้ำ

## Possible API
แนวคิด API ที่อาจใช้ในอนาคต — ยังไม่ถือเป็น final contract

```text
generateId()
generatePrefixedId()
generateReadableId()
```

ตัวอย่าง:

```text
BK-A7X92Q
TKT-F39K2D
```

## Expected Use Cases
Module/Project ประเภทไหนน่าจะใช้

## Out of Scope
สิ่งที่ utility นี้ไม่ควรรับผิดชอบ

```text
database sequence management
invoice numbering business rules
distributed ID infrastructure
```

## Promotion Rule
เงื่อนไขก่อนเริ่ม implementation

## Notes
ข้อควรระวังหรือ design consideration
