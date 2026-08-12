# Request ID

Status: idea

## Purpose
สร้างและ normalize request/correlation identifiers

## Possible API
แนวคิด API ที่อาจใช้ในอนาคต — ยังไม่ถือเป็น final contract

```text
generateRequestId()
getOrCreateRequestId()
isValidRequestId()
```

## Expected Use Cases
Module/Project ประเภทไหนน่าจะใช้

```text
HTTP Client
Webhook
Audit
Notification
Payment
Error handling
Observability
```

## Out of Scope
สิ่งที่ utility นี้ไม่ควรรับผิดชอบ

## Promotion Rule
เงื่อนไขก่อนเริ่ม implementation

## Notes
ข้อควรระวังหรือ design consideration
