# Query Filter

Status: idea

## Purpose
สร้าง normalized query/filter/sort contract

## Possible API
แนวคิด API ที่อาจใช้ในอนาคต — ยังไม่ถือเป็น final contract

Possible shape:

```text
search
filters
sort
dateRange
page
pageSize
```

## Expected Use Cases
Module/Project ประเภทไหนน่าจะใช้

## Out of Scope
สิ่งที่ utility นี้ไม่ควรรับผิดชอบ

ห้าม generate SQL แบบ generic ใน v1

Repository ของแต่ละ Project/Module เป็นคน map query ไป backend เอง

## Promotion Rule
เงื่อนไขก่อนเริ่ม implementation

## Notes
ข้อควรระวังหรือ design consideration
