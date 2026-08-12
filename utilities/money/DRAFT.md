# Money

Status: idea

## Purpose
ป้องกัน bug เรื่อง floating-point และสร้างมาตรฐานจำนวนเงิน

## Possible API
แนวคิด API ที่อาจใช้ในอนาคต — ยังไม่ถือเป็น final contract

```text
toMinorUnits()
fromMinorUnits()
validateAmount()
formatCurrency()
```

## Expected Use Cases
Module/Project ประเภทไหนน่าจะใช้

## Out of Scope
สิ่งที่ utility นี้ไม่ควรรับผิดชอบ

```text
payment gateway
refund
tax
invoice
accounting
subscription
```

## Promotion Rule
เงื่อนไขก่อนเริ่ม implementation

## Notes
ข้อควรระวังหรือ design consideration

Internal monetary calculations ควรใช้ integer minor units

ตัวอย่าง:

```text
10000 satang = 100.00 THB
```
