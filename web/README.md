# Smart Order System

ระบบสั่งอาหารด้วย Next.js และ Supabase แยกหน้าที่ Admin, Staff, Kitchen และลูกค้า

## เริ่มทำงาน

ติดตั้ง dependencies ด้วย `npm ci` และตั้งค่า `.env.local` ในเครื่อง:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` ใช้บน server เท่านั้น ห้ามส่งไป browser หรือ commit

ใช้ `npm run dev` เปิดเว็บที่ http://localhost:3000 หรือ `npm run build` แล้ว `npm start` เพื่อตรวจ production build

ก่อนแก้ Next.js อ่านคู่มือเวอร์ชันที่ติดตั้งใน `node_modules/next/dist/docs/` ตาม AGENTS.md

## เส้นทางโค้ดสำหรับนำเสนอ

| งาน | จุดเริ่มต้น |
| --- | --- |
| ลูกค้าเลือกอาหารและตะกร้า | src/app/table/[tableId]/MenuClient.tsx |
| ตรวจคำสั่งซื้อ ราคา ตัวเลือก และส่ง transaction | src/app/api/orders/route.ts |
| อ่านเมนูและตัวเลือกที่ขายได้ | src/lib/customer-menu-catalog.ts |
| ตรวจตัวตนและสิทธิ์แต่ละหน้า | src/lib/dashboard-auth.ts และ src/lib/supabase/verified-profile.ts |
| ครัวเริ่มงานตาม FCFS และทำเสร็จรายจาน | src/app/dashboard/kitchen/ และ src/components/kitchen-plates.tsx |
| พร้อมเสิร์ฟและส่งมอบรายจาน | src/app/dashboard/ready/ และ src/components/serve-plate-button.tsx |
| รับเงินสด/QR ต่อบิล | src/app/dashboard/orders/payments-view.tsx และ src/components/update-order-status-button.tsx |
| คำนวณสถานะรายจาน | src/lib/plate-progress.ts |
| Realtime และ polling สำรอง | src/components/order-realtime-refresh.tsx และ src/components/customer-order-events.ts |
| ตั้งค่ารีเซ็ตสต็อก | src/lib/ingredient-reset.ts และ [รายละเอียด](docs/ingredient-stock-reset.md) |
| Transaction, RPC, RLS และ trigger | supabase/migrations/ |

ลูกค้าส่งคำสั่งซื้อผ่าน API ให้ server ตรวจข้อมูลก่อนเรียก transaction ในฐานข้อมูล หน้าพนักงานใช้ session ของผู้ใช้และ RPC ที่ตรวจบทบาทอีกชั้นหนึ่ง ฐานข้อมูลบังคับ FCFS การตัด/คืนสต็อก การทำเสร็จ–เสิร์ฟรายจาน และการรับชำระเงิน หน้าจอใช้ Realtime ร่วมกับ polling เพื่อโหลดสถานะล่าสุด

Admin จัดการข้อมูลร้านและรายงาน, Kitchen ทำอาหาร, Staff เสิร์ฟและรับเงิน สิทธิ์อ้างอิง profile ที่ active และ RLS/RPC เดิม

## ตรวจงาน

- `npm run lint`
- `npx --no-install tsc --noEmit`
- `node --test tests/*.test.mjs`
- `npm run build`

Browser fixture tests ใช้ HTTP/WebSocket จำลองและ Microsoft Edge แบบ headless ให้รันทีละคำสั่งเพราะใช้ port 4400/4401 ร่วมกัน:

- `node tests/browser-customer-cart.mjs`
- `node tests/browser-served-orders.mjs`
- `node tests/browser-role-isolation.mjs`
- `node tests/browser-dashboard-roles-live.mjs`
- ฟอร์มสต็อก: ตั้ง `$env:ORDER_BROWSER_SUITE = 'stock-reset'` แล้วรัน browser-served-orders จากนั้น `Remove-Item Env:ORDER_BROWSER_SUITE`

ชื่อไฟล์ที่มี live ไม่ได้แปลว่าแตะ production ทุกไฟล์ ต้องอ่านหัวไฟล์ก่อนรัน ชุด hosted บางชุดสร้างผู้ใช้และออเดอร์จริง ต้องสำรองและตรวจขอบเขตก่อนใช้

## สำรองและแก้ฐานข้อมูล

`node scripts/catalog-backup.mjs` อ่านทุกตาราง/view ที่ service role เข้าถึงผ่าน PostgREST เก็บ JSON, OpenAPI และ SHA-256 ใน .test-artifacts/ ที่ Git ignore ไม่รวม Auth, Storage หรือ schema ที่ไม่เปิดผ่าน PostgREST และไม่ใช่ full SQL dump

supabase/audit-clean-code.sql อ่านนิยาม functions, policies, triggers, constraints, views, grants และ migration history เก็บผลนอก Git เพราะนิยาม function อาจมีข้อมูลอ่อนไหว

ทุกการแก้ฐานข้อมูลใช้ migration ใหม่พร้อม rollback ห้ามแก้ migration เก่าหรือ reset ฐานจริง ดู [บันทึกตรวจ Clean Code](docs/clean-code-review.md)

ทดสอบ Realtime recovery กับ Supabase จริงด้วย `node tests/hosted-clean-code.mjs --realtime` สคริปต์สร้าง/ล้างเฉพาะ TEST resources และตรวจข้อมูลเดิมก่อน–หลัง จึงต้องอ่านขอบเขตก่อนรัน ดู [ผล Realtime ล่าสุด รายการที่ลบจริง และวิธีคืนโค้ด/ฐานข้อมูล](docs/realtime-recovery-and-restore.md)
