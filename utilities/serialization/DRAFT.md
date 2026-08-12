# Serialization

Status: idea

## Purpose
จัดการ JSON serialization อย่างปลอดภัย

## Possible API
แนวคิด API ที่อาจใช้ในอนาคต — ยังไม่ถือเป็น final contract

```text
isJsonSerializable()
safeStringify()
safeParse()
```

## Expected Use Cases
Module/Project ประเภทไหนน่าจะใช้

## Out of Scope
สิ่งที่ utility นี้ไม่ควรรับผิดชอบ

## Promotion Rule
เงื่อนไขก่อนเริ่ม implementation

## Notes
ข้อควรระวังหรือ design consideration

รองรับ error ที่ชัดเจนสำหรับ:

```text
circular reference
BigInt
invalid JSON
unsupported values
```
