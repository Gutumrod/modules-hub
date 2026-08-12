# Pagination

Status: idea

## Purpose
มาตรฐาน calculation ของ pagination

## Possible API
แนวคิด API ที่อาจใช้ในอนาคต — ยังไม่ถือเป็น final contract

```text
calculateOffset()
calculateTotalPages()
normalizePagination()
```

Normalized shape:

```text
page
pageSize
offset
total
totalPages
```

## Expected Use Cases
Module/Project ประเภทไหนน่าจะใช้

## Out of Scope
สิ่งที่ utility นี้ไม่ควรรับผิดชอบ

ห้าม query database เอง

## Promotion Rule
เงื่อนไขก่อนเริ่ม implementation

## Notes
ข้อควรระวังหรือ design consideration
