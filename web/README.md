# Smart Order System (ระบบจัดการคำสั่งซื้อร้านอาหารอัจฉริยะ)

ระบบสั่งอาหารและบริหารจัดการร้านอาหารแบบเรียลไทม์ พัฒนาด้วย **Next.js (App Router)** ร่วมกับ **Supabase (PostgreSQL, Realtime, Auth, Storage)** รองรับการทำงานแยกตามบทบาทผู้ใช้งาน ได้แก่ **ลูกค้า (Customer)**, **พนักงานในครัว (Kitchen)**, **พนักงานบริการหน้าร้าน/แคชเชียร์ (Staff)** และ **ผู้ดูแลระบบ (Admin)**

---

## ฟีเจอร์หลักของระบบ (Key Features)

1. **ฝั่งลูกค้า (Customer Interface):**
   - สแกน QR Code เข้าสู่โต๊ะอาหาร เลือกดูเมนูอาหาร รายละเอียดตัวเลือก และสั่งอาหาร
   - **ระบบสมาชิกแบบทันที (Instant Membership):** สมัครสมาชิกผ่านเบอร์โทรศัพท์และเข้าใช้งานได้ทันทีโดยไม่ต้องรอแอดมินอนุมัติ สะสมแต้มและบันทึกประวัติออเดอร์ในนามสมาชิก
   - ติดตามสถานะออเดอร์รายจานแบบเรียลไทม์ (รอดำเนินการ / กำลังปรุง / พร้อมเสิร์ฟ / เสิร์ฟแล้ว)

2. **ฝั่งห้องครัว (Kitchen Display System):**
   - จัดการคิวทำอาหารตามลำดับมาก่อน-หลัง (FCFS) รายจาน
   - **ระบบเสียงแจ้งเตือนออเดอร์ใหม่เข้าครัว (Kitchen Chime):** ส่งเสียงแจ้งเตือนเฉพาะตัวเมื่อมีออเดอร์ยืนยันเข้ามาใหม่ พร้อมปุ่มเปิด/ปิดเสียงและปลดล็อก Web Audio API

3. **ฝั่งพนักงานหน้าร้าน & แคชเชียร์ (Staff & Cashier):**
   - ตรวจรับอาหารที่ปรุงเสร็จจากครัวพร้อมเสียงแจ้งเตือน "อาหารพร้อมเสิร์ฟ"
   - **ระบบชำระเงินยืดหยุ่น (Flexible Checkout):**
     - รองรับการจ่ายเหมาทั้งโต๊ะ หรือ **จ่ายแยกรายจาน (Split Payment)**
     - รองรับการ **จ่ายรวมออเดอร์จากโต๊ะอื่น (Combined Table Payment)** ในบิลเดียว
     - ระบบคำนวณเงินทอนอัตโนมัติเมื่อรับเงินสด พร้อมปุ่มลัด ฿100, ฿500, ฿1,000
     - เคลียร์โต๊ะและปิดรอบ Dining Session อัตโนมัติเมื่อชำระเงินครบถ้วน

4. **ฝั่งผู้ดูแลระบบ (Admin Dashboard):**
   - จัดการเมนู หมวดหมู่ ตัวเลือก และอัปโหลดรูปภาพเมนู
   - จัดการสต็อกวัตถุดิบ ตัดสต็อกอัตโนมัติ และปุ่ม **เติมสต็อกด่วน (Quick Stock Refill)**
   - จัดการสมาชิก รายชื่อ ประวัติการสั่งซื้อ และ Dashboard สถิติการตลาด
   - **รายงานยอดขายและการวิเคราะห์ (Reports & Analytics):**
     - กรองช่วงเวลาได้ 5 รูปแบบ (วันนี้, สัปดาห์นี้, เดือนนี้, ทั้งหมด, กำหนดเอง) อ้างอิงเวลาประเทศไทย (Asia/Bangkok)
     - แสดงกราฟยอดขาย กราฟช่วงเวลาขายดี (Peak Hours) และอัตรายกเลิกบิล
     - ส่งออกรายงานเป็นเอกสาร **PDF ขนาด A4** จัดหน้าสวยงามพร้อมพิมพ์

---

## ข้อกำหนดของระบบ (Prerequisites)

- **Node.js**: เวอร์ชัน 20.x ขึ้นไป
- **npm**: เวอร์ชัน 10.x ขึ้นไป
- **Supabase Project**: บัญชีและฐานข้อมูล Supabase สำหรับรันโปรเจกต์

---

## ขั้นตอนการติดตั้งและเริ่มต้นใช้งาน (Getting Started)

### 1. ติดตั้ง Dependencies
เปิด Terminal ในโฟลเดอร์ `web` แล้วรัน:
```bash
npm install
```

### 2. ตั้งค่า Environment Variables
คัดลอกไฟล์ `.env.example` เป็น `.env.local`:
```bash
cp .env.example .env.local
```
จากนั้นแก้ไขไฟล์ `.env.local` โดยระบุค่าเชื่อมต่อจริงจาก Supabase Dashboard (Project Settings > API):
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-supabase-anon-or-publishable-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-secret-key
```

### 3. รันระบบสำหรับพัฒนา (Development Mode)
```bash
npm run dev
```
เปิดเบราว์เซอร์เข้าใช้งานที่: [http://localhost:3000](http://localhost:3000)

### 4. ตรวจสอบคุณภาพโค้ด (Lint & Typecheck)
```bash
# ตรวจสอบ TypeScript Types ทั้งหมด
npx tsc --noEmit

# ตรวจสอบรูปแบบโค้ดด้วย ESLint
npm run lint
```

### 5. Build สำหรับ Production
```bash
npm run build
npm start
```

---

## โครงสร้างโปรเจกต์ (Project Structure)

```text
web/
├── .env.example                 # ตัวอย่างตัวแปรสภาพแวดล้อม
├── public/                      # ไฟล์ Static Assets และรูปภาพอัปโหลด
├── src/
│   ├── app/                     # Next.js App Router
│   │   ├── api/                 # Backend API Routes (orders, membership, upload, etc.)
│   │   ├── dashboard/           # หน้าจอผู้ดูแลระบบ, ครัว, พนักงาน, ชำระเงิน, รายงาน
│   │   │   ├── ingredients/     # จัดการวัตถุดิบและสต็อก
│   │   │   ├── kitchen/         # หน้าจอคิวครัว (KDS)
│   │   │   ├── members/         # จัดการสมาชิกและสถิติการตลาด
│   │   │   ├── menus/           # จัดการเมนูอาหาร
│   │   │   ├── orders/          # รายการออเดอร์และหน้าชำระเงิน
│   │   │   ├── ready/           # รายการอาหารพร้อมเสิร์ฟ
│   │   │   └── reports/         # รายงานยอดขายและส่งออก PDF
│   │   └── table/[tableId]/     # หน้าจอสั่งอาหารสำหรับลูกค้าประจำโต๊ะ
│   ├── components/              # React UI Components
│   └── lib/                     # ฟังก์ชันช่วยเหลือและ Supabase Clients
└── supabase/
    ├── migrations/              # Database Migrations (SQL)
    └── rollback/                # SQL สำหรับย้อนกลับ Migrations
```

---

## สิทธิ์และบทบาทผู้ใช้งาน (User Roles)

| บทบาท (Role) | สิทธิ์การเข้าถึง | หน้าจอหลัก |
|---|---|---|
| **Admin** | จัดการทุกส่วนของร้าน, เมนู, วัตถุดิบ, สมาชิก, รายงาน | `/dashboard` |
| **Kitchen Staff** | ดูคิวทำอาหาร, อัปเดตสถานะทำอาหารรายจาน (FCFS) | `/dashboard/kitchen` |
| **Staff** | ดูอาหารพร้อมเสิร์ฟ, จัดการออเดอร์, รับชำระเงิน | `/dashboard/ready`, `/dashboard/orders` |
| **Customer** | ดูเมนู, สั่งอาหาร, สมัคร/สะสมแต้มสมาชิก, ดูสถานะอาหาร | `/table/[tableId]` |
