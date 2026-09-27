# @module-hub/auth

ตัวช่วยจัดการ AuthContext และ authorization ที่ใช้ได้กับ identity provider หลายแบบ ดูวิธีตั้งค่าและ contract ที่ [MODULE.md](./MODULE.md) และ [DESIGN.md](./DESIGN.md)

## หมายเหตุความปลอดภัย (0.1.1)

สำหรับ identity รูปแบบ Supabase จะอ่าน claim ด้าน authorization จาก `app_metadata` หรือ resolver ที่ host กำหนดอย่างชัดเจนเท่านั้น ส่วน identity ทั่วไปสามารถส่ง `roles`, `tenantId` และ `permissions` ระดับบนสุดที่ normalize แล้วได้ โดยจะไม่ใช้ `user_metadata` เป็นแหล่งสิทธิ์ และจะไม่ถือ role ของ JWT/Postgres ได้แก่ `authenticated`, `anon` และ `service_role` เป็น app role ข้อมูล Supabase `app_metadata` และ `user_metadata` ที่คืนใน context จะแยกอยู่ที่ `metadata.appMetadata` และ `metadata.userMetadata`
