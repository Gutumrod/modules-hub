# String Normalizer

Status: idea

## Purpose
รวม normalization ที่ generic จริง

## Possible API
แนวคิด API ที่อาจใช้ในอนาคต — ยังไม่ถือเป็น final contract

```text
normalizeWhitespace()
normalizeCase()
sanitizeFilename()
slugify()
normalizePhone()
```

## Expected Use Cases
Module/Project ประเภทไหนน่าจะใช้

## Out of Scope
สิ่งที่ utility นี้ไม่ควรรับผิดชอบ

## Promotion Rule
เงื่อนไขก่อนเริ่ม implementation

## Notes
ข้อควรระวังหรือ design consideration

ห้ามใส่ business-specific mapping แบบ:

```text
province normalization
vehicle model aliases
shop-specific naming
```

จนกว่าจะพิสูจน์ว่า generic จริง
