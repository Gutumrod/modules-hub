# @module-hub/auth-supabase

ตัวช่วย AuthContext และ authorization สำหรับ Supabase Auth ดูวิธีตั้งค่าและ contract ที่ [MODULE.md](./MODULE.md) และ [DESIGN.md](./DESIGN.md)

## หมายเหตุความปลอดภัย (0.2.2)

ค่า authorization เริ่มต้นจะมาจาก Supabase `app_metadata` หรือ resolver ที่ host กำหนดอย่างชัดเจนเท่านั้น โดยจะไม่ใช้ `user_metadata` ที่ผู้ใช้แก้ไขเองเป็นแหล่งสิทธิ์ และจะไม่ถือ role ของ JWT/Postgres ได้แก่ `authenticated`, `anon` และ `service_role` เป็น app role ฟังก์ชันดึง metadata คืน `appMetadata` กับ `userMetadata` คนละ namespace จึงไม่มี key จาก user metadata ไปเขียนทับ application metadata
