# Date Time

Status: idea

## Purpose
รวม helper สำหรับจัดการวันเวลาอย่าง consistent

## Possible API
แนวคิด API ที่อาจใช้ในอนาคต — ยังไม่ถือเป็น final contract

```text
parseIsoDate()
toIsoString()
toTimezone()
startOfDay()
endOfDay()
addDuration()
isExpired()
isWithinRange()
```

## Expected Use Cases
Module/Project ประเภทไหนน่าจะใช้

```text
Booking
Subscription
Scheduler
Audit
Ticket
Retention
```

## Out of Scope
สิ่งที่ utility นี้ไม่ควรรับผิดชอบ

## Promotion Rule
เงื่อนไขก่อนเริ่ม implementation

## Notes
ข้อควรระวังหรือ design consideration

ต้องคำนึงถึง:

```text
timezone
UTC
local time
ISO8601
DST ของ timezone อื่นในอนาคต
```

ห้าม hard-code `Asia/Bangkok` ใน core utility ถ้าสามารถรับ timezone จาก caller ได้
