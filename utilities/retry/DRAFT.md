# Retry

Status: idea

## Purpose
เก็บ algorithm/helper generic เช่น:

```text
exponential backoff
jitter
sleep
attempt calculation
```

## Possible API
แนวคิด API ที่อาจใช้ในอนาคต — ยังไม่ถือเป็น final contract

```text
calculateBackoff()
sleep()
withRetry()
```

## Expected Use Cases
Module/Project ประเภทไหนน่าจะใช้

## Out of Scope
สิ่งที่ utility นี้ไม่ควรรับผิดชอบ

## Promotion Rule
เงื่อนไขก่อนเริ่ม implementation

## Notes
ข้อควรระวังหรือ design consideration

Utility ไม่ควรเป็นคนตัดสินว่า error ไหน retryable

Caller/Module เป็นคนกำหนด policy
