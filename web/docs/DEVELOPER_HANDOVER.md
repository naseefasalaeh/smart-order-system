# Developer Handover — Smart Order System

อัปเดตจาก source ใน branch `feature/remove-option-groups-user-identity` ณ 2026-11-01 (เวลาไทย) เอกสารนี้สรุปโครงสร้างและพฤติกรรมที่ตรวจจากไฟล์ใน repository เท่านั้น; สถานะฐานข้อมูล/production ต้องตรวจแยกก่อน deploy

## 1. ภาพรวม

เว็บจัดการร้านอาหารและสั่งอาหารตามโต๊ะผ่าน QR ครอบคลุม Admin, Staff, Kitchen และลูกค้า ช่วยรับออเดอร์ ส่งงานครัว ติดตามจาน เสิร์ฟ รับชำระเงิน จัดการเมนู/วัตถุดิบ และลูกค้าสมัครสมาชิกได้

สถาปัตยกรรมเป็น Next.js App Router (Next 16.3.0) + React 19 + TypeScript, Tailwind CSS 4 และ Supabase (Postgres, Auth, RLS, RPC, Realtime) ทั้ง Server Components/Route Handlers และ Browser Components ใช้ Supabase SSR/client ตามบริบท; กติกาที่ต้อง atomic หรือป้องกัน concurrency อยู่ใน Postgres RPC/trigger ไม่ควรย้ายมาเป็นหลาย client writes

## 2. ฟีเจอร์ตามบทบาท

| บทบาท | หน้าที่หลัก / จุดเริ่ม |
|---|---|
| Admin | Dashboard/รายงาน, เมนูและสูตร, ตัวเลือก/add-on, วัตถุดิบ/หมวดและรอบ reset stock, โต๊ะ/QR, จัดการบัญชีผู้ใช้/สถานะ/บทบาท; ดู `src/app/dashboard/page.tsx`, `menus/`, `ingredients/`, `tables/`, `users/`, `reports/` |
| Staff | รายการพร้อมเสิร์ฟและยืนยันเสิร์ฟ, รายการรอชำระ/รับเงิน, ชำระเต็มบิลหรือเลือกจำนวนรายเมนู, ตรวจคำขอผูกอุปกรณ์สมาชิกเดิม; `src/app/dashboard/ready/`, `payments/`, `orders/payments-view.tsx`, `members/page.tsx` |
| Kitchen | รับงานและเปลี่ยน confirmed → preparing, กดเสร็จเป็นรายจาน; `src/app/dashboard/kitchen/`, `src/components/kitchen-plates.tsx` |
| ลูกค้า | เปิดเมนูโต๊ะจาก `/table/[tableId]`, เลือกตัวเลือก/add-on/หมายเหตุและสั่ง, ติดตามคิวและสถานะ/ประวัติ, สมัครสมาชิกแบบสมัครใจ; `src/app/table/`, `src/app/api/customer-orders/`, `src/app/api/membership/` |

ฟีเจอร์หลักมี implementation และ test scripts อยู่ใน repo แต่หลักฐานนี้ไม่ได้รัน suite ซ้ำในรอบ handover. ข้อจำกัดที่ยืนยันจาก docs/source: ไม่มีการเชื่อมธนาคารหรือยืนยันสลิปอัตโนมัติ; QR เป็น payment method ที่ Staff ยืนยันเอง; เสียงพร้อมเสิร์ฟต้องอนุญาตใน browser และไม่มี push นอกหน้าที่เปิด; membership ไม่ใช่ OTP/phone verification (มี `phoneVerified: false`) และอุปกรณ์ที่สองอาจต้องให้พนักงานตรวจ; stock reset ไม่มี stock movement/history ledger แยก

## 3. โครงสร้างและจุดแก้ไข

- `src/app/` — routes/pages/layout/API. Customer: `table/[tableId]/MenuClient.tsx`, `table/[tableId]/orders/`; dashboard routes แยกตามงาน.
- `src/app/api/orders/route.ts` — ตรวจ catalog/ตัวเลือก/ราคาจาก server ก่อนสร้างออเดอร์; `api/orders/[orderId]/cancel/route.ts` — ยกเลิก.
- `src/app/api/customer-orders/` และ `customer-queue/` — อ่านข้อมูลลูกค้าผ่าน session token; `membership/route.ts` — สมัคร/อ่านสถานะ/ยกเลิกผูก.
- `src/lib/` — business logic ที่แชร์กัน: `dashboard-auth.ts`, `order-views.ts`, `order-workload.ts`, `plate-progress.ts`, `payment-progress.ts`, `unpaid-orders.ts`, `customer-menu-catalog.ts`, `member-input.ts`, `ingredient-reset.ts`, `bangkok-date.ts`.
- `src/lib/supabase/{client,server,admin,verified-profile}.ts` — Supabase clients และ identity verification. Admin/service-role client ใช้บน server เท่านั้น.
- `src/components/` — UI และ client state: `kitchen-plates.tsx`, `serve-plate-button.tsx`, `session-payment.tsx`, `payment-history.tsx`, `order-realtime-refresh.tsx`, `ready-plate-alerts.tsx`.
- `supabase/migrations/` — schema, RPC, triggers, RLS และ grants แบบเรียง timestamp; `supabase/rollback/` — rollback เฉพาะ migration บางชุด.
- `tests/` — Node tests (รวม PGlite), browser fixture/live tests, PostgreSQL concurrency/hosted tests; `scripts/` — audit/verification/backup/feature tooling.
- `docs/` — บันทึก feature และ verification; อ่าน `ready-payments-members.md`, `served-order-workflow.md`, `ingredient-stock-reset.md`, `realtime-recovery-and-restore.md` ก่อนแก้ logic ที่เกี่ยวข้อง.

ไฟล์ App Router ใช้ conventions ของ Next เวอร์ชันที่ติดตั้ง (16.3.0) ซึ่ง repo ระบุว่าอาจมี breaking changes: อ่านคู่มือที่เกี่ยวข้องใต้ `node_modules/next/dist/docs/` ตาม `AGENTS.md` ก่อนเขียนโค้ด Next

## 4. Database / Supabase

Migrations ทั้งหมดใน repository เรียงตั้งแต่ `20260829000000` ถึง `20261101000000`. ตารางหลักที่ปรากฏใน source/migrations ได้แก่ `profiles` (เชื่อม Supabase Auth ID และ role/active), `restaurant_tables`, `menus`, `menu_categories`, `ingredients`, `ingredient_categories`, `menu_ingredients`, `addons`, `addon_ingredients`, `menu_option_groups`, `menu_options`, `orders`, `order_items`, `order_item_options`, `order_ingredient_usages`, `payments`, `payment_allocations`, `order_plate_services`, `members`, `member_devices`. Relations โดยแนวทาง: orders ผูกโต๊ะและ items; items snapshot เมนู/ราคาและ usage; สูตรเชื่อม menu/add-on กับ ingredients; payment allocation ผูก receipt กับ item; order อาจผูก member; device เป็นอุปกรณ์ของ member. ตรวจ FK/constraint แบบเต็มใน migration ที่เกี่ยวข้องก่อนแก้ schema.

Migrations สำคัญ:

- `20260902170000_create_order_transaction.sql`, `20260902171000_restore_stock_from_usage_once.sql`: สร้าง order หัก stock และยกเลิกคืน usage แบบป้องกันคืนซ้ำ.
- `20260916160000_order_workflow_permissions.sql`, `20260917120000_standardize_shop_roles.sql`, `20260918100000_active_shop_accounts.sql`, `20261005000000_isolate_operational_roles.sql`: workflow, role normalization และการกั้นสิทธิ์ active accounts.
- `20260923100000_served_order_payment.sql`: serve audit + จำกัดรับชำระหลังเสิร์ฟ.
- `20261025000000_kitchen_fcfs_plates.sql`, `20261025010000_partial_plate_service.sql`: FCFS, progress/serve รายจานและ audit.
- `20261025020000_ingredient_stock_reset.sql`, `20261025021000_schedule_ingredient_stock_reset.sql`, `20261025022000_ingredient_stock_version.sql`: reset schedule, cron และ concurrency/version.
- `20261031000000_item_payments.sql`: receipts หลายรายการต่อ order และ allocations.
- `20261031010000_optional_members.sql`, `20261101000000_member_recovery_lock_order.sql`: สมาชิกสมัครใจ, อุปกรณ์และ lock-order fix.

RLS เปิดใช้กับตาราง operational หลายชุด; policies และ grants เป็นขอบเขตความปลอดภัยจริง ไม่ควรพึ่งการซ่อนปุ่มใน UI. `getVerifiedProfile()` ตรวจ `auth.getUser()` กับ profile ที่อ่านด้วย JWT ให้ ID ตรงกัน; dashboard ตรวจ active/role อีกชั้น. API ลูกค้าจำกัดข้อมูลด้วย table session token. RPC ที่มี `SECURITY DEFINER` ต้องรักษา `search_path`, authorization, lock order และ grants; อ่าน migration ก่อนปรับ.

Realtime ใช้ Supabase subscription ของ orders/payment state และ UI มี fallback polling/refresh; เอกสาร `ready-payments-members.md` อธิบาย recovery และ limitations. Cron `smart-order-ingredient-stock-reset` ถูกกำหนดทุกนาทีใน migration แต่การมีไฟล์ migration ไม่ยืนยันว่า job ถูกติดตั้ง/ทำงานใน hosted project ปัจจุบัน.

**ข้อจำกัดการยืนยัน:** ไม่ได้เชื่อม Supabase หรืออ่าน hosted schema/migration history ในงานนี้ จึงยืนยันไม่ได้ว่า migrations ล่าสุดถูก apply, RLS/Realtime publication/cron ของ production ตรง repository หรือไม่. ห้ามใช้ `db reset`/apply migration กับฐานจริงโดยไม่ตรวจ environment, backup และ migration history.

## 5. Business logic สำคัญ

- **สร้างออเดอร์:** customer UI ส่งข้อมูลไป `POST /api/orders`; server โหลดราคา/availability/options จาก catalog, validate และส่ง transaction RPC ใน DB. Order snapshot คือข้อมูลราคาตอนสั่ง; unit price รวมตัวเลือก/add-on ตามเอกสาร feature. Stock deduction และ usage ต้อง atomic. Cancellation คืน stock จาก usage ได้ครั้งเดียว.
- **คิวครัว FCFS:** RPC `advance_order_status` ป้องกันการเริ่มออเดอร์หลังลำดับก่อนหน้าที่ยังไม่เริ่ม (ตรวจ migration `20261025000000...`). สถานะหลัก confirmed → preparing → ready/เสร็จรายจาน → served → completed; อย่าแก้สถานะตรงจาก client หรือข้าม RPC.
- **สถานะรายจาน:** `completed_plates` คือจานที่ครัวทำเสร็จ; `served_plates` คือจานที่ Staff เสิร์ฟแล้ว. `pendingPlates()` คำนวณเฉพาะจานเสร็จที่ยังไม่เสิร์ฟ. Partial serve เก็บ audit ใน `order_plate_services`; DB trigger/RPC ป้องกัน client เขียน progress เอง. Order อาจแสดง partially_served โดยคำนวณจากข้อมูลจาน.
- **ชำระเงิน:** `collect_item_payment` รับ request idempotency key + canonical payload, ตรวจ Staff, method, session, snapshot, จำนวนและยอด; locks ป้องกันเก็บเกิน/ซ้ำ. ใช้จำนวนเต็ม `amount_satang`. `payment_allocations` แยกจำนวนจานที่ชำระแล้วตาม receipt. จ่ายรายจานได้หลังเสิร์ฟครบ; order completed เมื่อทุกรายการชำระครบ. `complete_order_payment` ยังคงเป็นทางชำระยอดคงเหลือของ order ผ่านกลไกเดียวกัน. รวมได้ตาม dining session เดียวกัน ไม่ใช้หมายเลขโต๊ะอย่างเดียว; ไม่มี session ก็รวมข้าม order ไม่ได้. ห้ามเปลี่ยนกลับไป unique payment ต่อ order หรือคำนวณราคา add-on ซ้ำ.
- **สมาชิก:** สมัครโดยสมัครใจ; browser ได้ random token, cookie เป็น HttpOnly, DB เก็บ hash ใน `member_devices`. Member เดิม/อุปกรณ์ใหม่ผ่านการตรวจของ Staff; สถิติใช้ RPC และข้อมูลสมาชิกไม่ถูกเปิดใน customer order payload. หลีกเลี่ยง logging เบอร์หรือ token/hash.
- **สต็อก:** สูตร/usage หักตั้งแต่สร้าง order; reset stock ไม่ลบ usage/order/payment และไม่ใช่ประวัติ stock. Due reset ถูกจัดการด้วย row lock/skip locked และ save ใช้ expected `updated_at`; metadata-only edit ต้องไม่คืน stock. คืน usage เมื่อ cancel ครั้งเดียว.

## 6. สถานะล่าสุดและหลักฐาน

- Branch: `feature/remove-option-groups-user-identity`; `HEAD` = `2dd7e72` (`feat: finish verified ready alerts payments and membership`, 2026-11-01 01:44 +07).
- งานล่าสุด:
  - นำส่วน "ออเดอร์ล่าสุด" (Recent Orders) และ Query ที่เกี่ยวข้องออกจากหน้ารายงาน (`/dashboard/reports`)
  - แก้ไขปัญหา React 19 Hydration Mismatch ในคอมโพเนนต์ `ReportsCharts` (เปลี่ยน SVG title เป็น aria-label / title attribute)
  - ปรับปรุง UI และ Accessibility ของ `OptionalMembership` และ `ReportsCharts` ให้แสดงผล Responsive และเข้าถึงได้ดียิ่งขึ้น
  - เพิ่มระบบ Daily Order Sequence Reset (`20261107000000_daily_order_sequence_reset.sql`) พร้อม Rollback: รีเซ็ตลำดับเลขออเดอร์กลับเป็น 1 ทุกเที่ยงคืนเวลาไทย (17:00 UTC) ผ่าน pg_cron และปลด constraint `orders_order_number_key` ให้รองรับเลขออเดอร์เริ่มใหม่ในแต่ละวัน
  - สร้าง Utility จัดรูปแบบเลขออเดอร์ `src/lib/order-number.ts` (`formatOrderNumber` เติม 0 นำหน้า 3 หลัก เช่น `#001` และ `formatOrderCode` พร้อมรหัสวัน เช่น `261107-001`)
  - ใช้งานเลขออเดอร์แบบมาตรฐานครอบคลุมทุกหน้า: Dashboard, Kitchen, Orders, Ready, Session Payment, Workload, MenuClient, CustomerOrdersClient และ Customer Queue API
- ผลทดสอบล่าสุดที่ยืนยันแล้ว:
  - `npm run lint`: ผ่าน (0 errors)
  - `npx --no-install tsc --noEmit`: ผ่าน (0 errors)
  - `node --test tests/*.test.mjs`: ผ่านครบทั้งหมด 99/99 tests (0 failures)
- งานค้าง/ยืนยันไม่ได้: deployment/production schema และ migration status ปัจจุบัน; live cron/Realtime settings; ต้องตรวจ compatibility ก่อน deploy โดยเฉพาะ migration ใหม่และ API/schema. ดูข้อจำกัดเรื่อง browser/platform และไม่มี bank/slip automation ด้านบน.

## 7. เริ่มพัฒนาต่อ

1. `git status --short --branch`, อ่าน `README.md`, `AGENTS.md` และเอกสาร feature ที่เกี่ยวข้อง; ตรวจ branch/commit ก่อนเริ่ม.
2. ติดตั้ง Node.js ที่รองรับ Next 16, จากโฟลเดอร์ `web`: `npm ci`.
3. สร้าง `.env.local` ในเครื่องจาก Supabase dev project: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server only; ห้ามแสดง/commit). ค่า `PERF_LOG=1` เปิด timing logs ได้.
4. ตรวจว่า Supabase dev schema ตรงกับ migrations ก่อนทดสอบ DB-dependent pages; ใช้ project แยกสำหรับ live/browser suites.
5. `npm run dev` เปิด `http://localhost:3000`; `npm run build` แล้ว `npm start` สำหรับ production-mode local. `npm run lint`, `npx --no-install tsc --noEmit`, `node --test tests/*.test.mjs` เป็นชุดตรวจที่เอกสารระบุ. Browser fixture/live และ hosted/PostgreSQL tests อ่าน script ก่อนรัน เพราะบางชุดสร้าง Auth users/orders/TEST records หรือใช้ ports ร่วมกัน; รันทีละคำสั่งและใช้ DB ทดสอบเท่านั้น.
6. หากแก้ migration: เพิ่ม migration ใหม่พร้อม rollback/recovery plan, ตรวจ RLS/grants, test concurrency และ migration history; ห้ามแก้ไฟล์ migration เก่าเพื่อแก้ production หรือ reset ฐานจริง. อ่าน `docs/realtime-recovery-and-restore.md` และเอกสาร feature ก่อน.

ห้ามใส่ secrets/API keys ใน source, เอกสาร, log หรือ commit. ไม่ได้ตรวจ `.env.local` หรือค่า environment จริง และไม่แสดงค่าลับในเอกสารนี้.
