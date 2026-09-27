# @module-hub/payment

Payment core ที่แยก provider พร้อม Stripe adapter ดู contract และขอบเขต integration ที่ [MODULE.md](./MODULE.md) และ [DESIGN.md](./DESIGN.md)

## หมายเหตุความปลอดภัย (0.1.1)

ก่อนคืนเงินด้วย Checkout Session ID (`cs_...`) ระบบจะดึง session และต้องพบว่าจ่ายแล้วพร้อม PaymentIntent จากนั้นจึงใช้ PaymentIntent ID ในการคืนเงิน ตัว parser ของ Stripe webhook จะปฏิเสธเมื่อไม่มี event ID หรือ payment ID และจะไม่สร้าง ID ขึ้นเอง ส่วน host webhook receiver ยังรับผิดชอบการตรวจ signature การทดสอบใช้ Stripe response แบบ mock เท่านั้น จึงยังต้องตรวจใน Stripe test mode และผ่านการทบทวนอิสระก่อนใช้งาน production
