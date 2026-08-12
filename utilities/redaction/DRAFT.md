# Redaction

Status: idea

## Purpose
ลบข้อมูล sensitive ก่อน log, error หรือ serialization

## Possible API
แนวคิด API ที่อาจใช้ในอนาคต — ยังไม่ถือเป็น final contract

```text
redactObject()
redactHeaders()
redactString()
```

Default sensitive keys:

```text
password
secret
token
authorization
apiKey
cookie
session
```

## Expected Use Cases
Module/Project ประเภทไหนน่าจะใช้

```text
Notification
Payment
Webhook
Audit
AI
HTTP Client
Error handling
```

## Out of Scope
สิ่งที่ utility นี้ไม่ควรรับผิดชอบ

## Promotion Rule
เงื่อนไขก่อนเริ่ม implementation

## Notes
ข้อควรระวังหรือ design consideration
