# Work checkpoint — Smart Order System

## งานล่าสุด: Staff แท็บรอชำระเงิน

เสร็จแล้ว: แยกหน้ารายการรอชำระเงินออกจากหน้ารายการออเดอร์ โดยคง URL `/dashboard/orders?status=served` และเมนูเดิม ใช้โครงหน้าและการ์ดสอดคล้องกับพร้อมเสิร์ฟ แสดงเลขโต๊ะ/กลับบ้าน เลขบิล รายการอาหาร ตัวเลือก หมายเหตุ และยอดที่ต้องชำระ ไม่มีปุ่มครัวหรือจัดการออเดอร์

ตรวจ SQL เดิมแล้วรับชำระ **ต่อออเดอร์** ไม่รวมตามรอบโต๊ะ คง `total_amount` ที่บันทึกไว้และ RPC `complete_order_payment` พร้อมเงินสด/QR เดิม ไม่แก้ SQL หรือฐานข้อมูลจริง รอบนี้กรองเฉพาะ served ที่ไม่มี payment สถานะอื่นนอกจาก failed และตัดข้อมูลซ้ำตาม order ID หากอ่าน payment ไม่สำเร็จจะไม่เปิดปุ่มรับชำระ

เมื่อ RPC สำเร็จซ่อนบิลทันที แม้ refresh ล้มเหลว และโหลดสถานะใหม่ ใช้ realtime orders พร้อม polling สำรอง 5 วินาที เมื่อว่างแสดง “ไม่มีรายการรอชำระเงิน” การล็อกปุ่มเดิมป้องกัน double click และ transaction/row lock เดิมป้องกันการรับชำระซ้ำจากหลายหน้าจอ

ไฟล์ของงานรอบนี้:

- `src/app/dashboard/orders/page.tsx`
- `src/app/dashboard/orders/payments-view.tsx` (ใหม่)
- `src/lib/order-views.ts`
- `src/components/update-order-status-button.tsx`
- `tests/browser-served-orders.mjs`
- `tests/helpers/dashboard-mock.mjs`
- `tests/helpers/pending-payment-checks.mjs` (ใหม่)
- `tests/served-order-workflow.test.mjs`
- `docs/work-checkpoint.md`

ผลทดสอบ:

- `npm run build`: ผ่าน รวม TypeScript
- `node --test tests/*.test.mjs`: ผ่าน 84 กรณี
- หลังเพิ่มกรณี SQL สองบิลโต๊ะเดียวกัน: `node --test tests/served-order-workflow.test.mjs` ผ่าน ตรวจยอด 83.50/84.50 แยกกัน และปฏิเสธชำระบิลเดิมซ้ำ
- `node tests/browser-served-orders.mjs`: ผ่าน รวมจอ 1440px/375px ไม่มี horizontal overflow, snapshot เมนู/ตัวเลือก/ยอด, ตัดข้อมูลซ้ำ/จ่ายแล้ว/ยังไม่เสิร์ฟ, เงินสด/QR, failure แล้ว retry, double click ส่ง RPC เดียว, realtime ข้ามหน้าจอ, empty state, payment read error ปิดปุ่ม, sidebar navigation และสิทธิ์ Kitchen
- ตรวจภาพ `.test-artifacts/served-orders/pending-payments-1440.png` และ `pending-payments-375.png` แล้ว
- `npm run lint`: 0 errors, warning เดิม 4 รายการ
- `git diff --check`: ผ่าน

งานที่เหลือสำหรับคำขอนี้: ไม่มี ขั้นตอนถัดไปคือผู้ใช้ทดลองหน้าจอจากโค้ดใน working tree ตามต้องการ งานรอบนี้ใช้เฉพาะ fixture และ PGlite ไม่เปลี่ยนข้อมูลจริง ไม่ commit, push หรือ deploy การเปลี่ยนแปลงรอบก่อนยังอยู่ครบ

วันที่: 5 ตุลาคม 2026 (Asia/Bangkok)

สถานะ: **กลับมาทำงานต่อและตรวจผลรอบล่าสุดแล้ว** ไม่ commit หรือ push Git งานรอบใหม่ ข้อมูลผลทดสอบเดิมด้านล่างเป็นบันทึกของรอบก่อนหยุด; ดูผลเพิ่มเติมท้ายไฟล์

## Git และจุดย้อนกลับ

- Branch: `feature/remove-option-groups-user-identity`
- Remote: `origin` → `https://github.com/naseefasalaeh/smart-order-system.git`
- Commit ก่อนเริ่มแก้สิทธิ์: `e35a55403f8d759f66ff91eba3fd94e9a08d5c87`
- Commit message: `chore: checkpoint before role permission isolation`
- Push checkpoint สำเร็จแล้ว ก่อนเริ่มแก้ระบบสิทธิ์
- ก่อนสร้าง checkpoint working tree สะอาด จึงใช้ empty commit บันทึกจุดเริ่มต้น
- ตรวจไฟล์ที่ติดตามใน Git และรูปแบบข้อมูลลับ ไม่พบไฟล์ `.env` หรือ private key ที่จะเพิ่มเข้า Git; ค่ารหัสผ่านที่พบจากการสแกนเป็นค่าจำลองในชุดทดสอบ
- งานแก้สิทธิ์และงานแก้หน้าสั่งอาหารทั้งหมดด้านล่างยังอยู่ใน working tree **ไม่ได้ commit หรือ push**

## งานระบบสิทธิ์ที่เสร็จในโค้ด

ตรวจหน้าที่จากเนื้อหาและการทำงานของหน้า ไม่ใช้ชื่อโฟลเดอร์เป็นตัวกำหนดสิทธิ์

| บทบาท | หน้าที่ที่อนุญาต | หน้าแรกหลังล็อกอิน |
| --- | --- | --- |
| Admin | ภาพรวมร้าน เมนู วัตถุดิบ โต๊ะ/QR ตัวเลือกเสริม รายงาน และผู้ใช้ | `/dashboard` |
| Staff | ออเดอร์ ยกเลิกออเดอร์ที่ยังยกเลิกได้ เสิร์ฟ/ส่งมอบ และรับชำระเงิน | `/dashboard/orders` |
| Kitchen (`kitchen_staff`) | คิวครัว เริ่มทำอาหาร และแจ้งพร้อมเสิร์ฟ | `/dashboard/kitchen` |

- เมนู Admin ไม่แสดงหน้างาน Staff/Kitchen อีกต่อไป
- ตัวตรวจสิทธิ์ฝั่งเซิร์ฟเวอร์ใช้ `forbidden()` และมีหน้า 403 ภาษาไทย เปิด `experimental.authInterrupts` ตามเอกสาร Next.js ที่ติดตั้งในโปรเจกต์
- หน้า orders/ready อนุญาต Staff เท่านั้น; หน้า kitchen อนุญาต Kitchen เท่านั้น; dashboard ภาพรวมอนุญาต Admin เท่านั้น
- หน้าย่อย options ตรวจสิทธิ์ Admin ก่อน redirect
- API ยกเลิกออเดอร์ผ่านบัญชีพนักงานอนุญาต Staff เท่านั้น เส้นทางลูกค้าที่ใช้ token ของรอบโต๊ะยังคงตรวจรอบและความเป็นเจ้าของออเดอร์
- API จัดการผู้ใช้เดิมมีการตรวจ Admin อยู่แล้ว และได้ทดสอบการปฏิเสธ Staff/Kitchen
- Live order refresh เรียก server refresh เมื่อสิทธิ์ไม่ถูกต้อง เพื่อให้แสดงผลจาก server guard
- เพิ่ม migration จำกัด RPC `advance_order_status` ให้ Kitchen และ `serve_order`/`complete_order_payment` ให้ Staff โดยรักษา transaction body, locks, stock และ audit เดิม และหยุด migration หาก guard เดิมไม่ตรงที่คาดไว้
- ใช้ migration สิทธิ์กับฐานข้อมูลจริงแล้วเมื่อกลับมาทำงานต่อ ไม่เปลี่ยนข้อมูลออเดอร์หรือสต็อก (รายละเอียดการตรวจท้ายไฟล์)

### ไฟล์ที่แก้หรือเพิ่มสำหรับระบบสิทธิ์

- `next.config.ts`
- `src/lib/dashboard-auth.ts`
- `src/lib/dashboard-navigation.ts`
- `src/app/login/page.tsx`
- `src/app/forbidden.tsx` (ใหม่)
- `src/app/dashboard/page.tsx`
- `src/app/dashboard/orders/page.tsx`
- `src/app/dashboard/orders/view.tsx`
- `src/app/dashboard/ready/page.tsx`
- `src/app/dashboard/ready/view.tsx`
- `src/app/dashboard/kitchen/page.tsx`
- `src/app/dashboard/kitchen/view.tsx`
- `src/app/dashboard/menus/[id]/options/page.tsx`
- `src/app/api/orders/[orderId]/cancel/route.ts`
- `src/components/live-order-view.tsx`
- `supabase/migrations/20261005000000_isolate_operational_roles.sql` (ใหม่)
- `tests/role-isolation.test.mjs` (ใหม่)
- `tests/browser-role-isolation.mjs` (ใหม่)

## งานหน้าสั่งอาหารและตะกร้าที่เสร็จในโค้ด

อาการที่ผู้ใช้แจ้ง: เปิดหน้าสั่งอาหารจาก Admin แล้วส่งออเดอร์ไม่ได้ แสดง “รอบโต๊ะนี้หมดอายุแล้ว กรุณาเริ่มรอบใหม่” และตะกร้ามองเห็นยากเพราะแยกจากเมนู

สาเหตุจากโค้ด: `MenuClient` ใช้ token รอบโต๊ะที่บันทึกไว้ใน localStorage ต่อ แม้รอบนั้นปิดแล้ว ลิงก์จากหน้า Admin ไม่ได้ล้าง token เดิม

- เปลี่ยนการเตรียม token ก่อนส่งออเดอร์เป็น async และตรวจรอบที่บันทึกไว้ผ่าน `/api/customer-orders` ที่มีอยู่แล้ว
- ถ้าเซิร์ฟเวอร์ยืนยันว่ารอบปิดแล้ว สร้าง UUID ใหม่ บันทึกลง key ของ Table ID และลบ legacy alias ที่อาจนำรอบเก่ากลับมาใช้
- ถ้ารอบยัง active ให้ใช้ token เดิม; ถ้าตรวจรอบไม่สำเร็จ ไม่หมุน token และไม่ส่งออเดอร์ต่อ
- การเปลี่ยนรอบไม่ล้างรายการในตะกร้า
- หากคำขอส่งออเดอร์ยังค้างจาก network/server failure เก็บ request ID และไม่ตรวจเปลี่ยนรอบใน retry เพื่อรักษาการป้องกันออเดอร์ซ้ำ; เมื่อถูกปฏิเสธด้วย HTTP 4xx ล้าง pending request ให้ตรวจรอบใหม่ในการยืนยันครั้งถัดไป
- เพิ่มตะกร้าสรุปในหน้าเมนู: จอใหญ่เป็นแผง sticky ข้างเมนู; มือถือแสดงแผงในหน้าเดียวกันและยังมีแถบตะกร้าด้านล่าง
- แผงสรุปแสดงชื่ออาหาร ตัวเลือก จำนวน ราคาต่อรายการ ยอดรวม และปุ่มเพิ่ม/ลด/แก้ไข/ลบ พร้อมปุ่มตรวจรายการและสั่งอาหาร
- การ์ดอาหารแสดงจำนวนจานของเมนูนั้นที่อยู่ในตะกร้า
- เพิ่มความกว้างหน้าเป็น `max-w-7xl` เพื่อรองรับเมนูและตะกร้าด้านข้าง
- เพิ่มชื่อ accessible ให้ปุ่มปิดตะกร้า
- ไม่แก้ API หรือโครงสร้างฐานข้อมูลในงานหน้าสั่งอาหารรอบนี้

### ไฟล์ที่แก้หรือเพิ่มสำหรับหน้าสั่งอาหาร

- `src/app/table/[tableId]/MenuClient.tsx`
- `src/app/table/[tableId]/page.tsx`
- `tests/browser-customer-cart.mjs` (ใหม่)

## ผลทดสอบที่ทำแล้ว

### ระบบสิทธิ์

- `node --test tests/role-isolation.test.mjs` — ผ่าน (PGlite ฐานข้อมูลจำลอง)
  - Admin ถูกปฏิเสธ RPC งานครัว/เสิร์ฟ/ชำระเงิน
  - Staff และ Kitchen ใช้ workflow ตามหน้าที่
  - ครัว → พร้อมเสิร์ฟ → เสิร์ฟ → ชำระเงิน ผ่านทั้งทานที่ร้านและกลับบ้าน
  - ตรวจ audit, retry และการชำระซ้ำ รวมบัญชี inactive/ไม่มี profile/anon
- `node tests/browser-role-isolation.mjs` — ผ่านทั้ง Admin, Staff, Kitchen
  - หน้าแรกหลังล็อกอิน เมนู หน้าหลักและหน้าย่อยที่ตรวจ
  - หน้าที่ไม่มีสิทธิ์ตอบ HTTP 403
  - ตรวจ users API ด้วย GET/POST/PATCH/DELETE และ cancel API
- `npx tsc --noEmit` — ผ่าน
- `npm run lint` — ไม่มี error; มี warning เดิมเรื่อง `<img>` และตัวแปรที่ไม่ได้ใช้ในชุดทดสอบเดิม หลังแก้ warning ในชุดทดสอบใหม่แล้ว targeted lint ของไฟล์ใหม่ผ่าน
- `npx next build` — ผ่าน
- `git diff --check` — ผ่าน (Git แจ้งเตือน LF/CRLF ตามการตั้งค่าบน Windows)

### หน้าสั่งอาหารและตะกร้า

- `node tests/browser-customer-cart.mjs` — ผ่าน
  - ล็อกอิน Admin → หน้าโต๊ะ → กดเปิดหน้าสั่งอาหารในแท็บใหม่
  - จำลอง token ของรอบที่ปิดแล้ว: เปลี่ยน token และส่งรายการเดิมในตะกร้าได้
  - เพิ่ม/ลดจำนวน แก้ไข และลบรายการจากแผงตะกร้า
  - ตรวจหน้า desktop และมือถือขนาด 390 × 844 รวมไม่มี horizontal overflow
  - รอบ active ยังคง token เดิม
  - จำลองตรวจรอบล้มเหลว: ไม่ส่งออเดอร์ ไม่เปลี่ยน token และเก็บตะกร้า
  - จำลองส่งออเดอร์ HTTP 503 แล้ว retry: ใช้ request ID และ token เดิม
- `npx tsc --noEmit` — ผ่านหลังแก้หน้าสั่งอาหาร
- `npx next build` — ผ่านหลังแก้หน้าสั่งอาหาร
- Targeted ESLint ของหน้าสั่งอาหารและชุดทดสอบใหม่ — ไม่มี error; เหลือ warning `<img>` เดิมใน `MenuClient.tsx`
- ตรวจภาพ desktop/mobile ที่สร้างจาก browser test แล้ว
- ภาพและ log อยู่ใน `.test-artifacts/customer-cart/` ซึ่ง Git ignore

ขอบเขตการทดสอบ: ใช้เว็บจริงในเครื่องกับ Supabase HTTP fixture และ PGlite; ชุดทดสอบตะกร้าจำลอง response ของ `/api/orders` เพื่อทดสอบ client workflow และตรวจ payload ไม่ใช่การส่งออเดอร์เข้า Supabase จริง ยังไม่ทดสอบกับบัญชี/ข้อมูล production จริง

## งานค้างและข้อจำกัด

1. Migration สิทธิ์ RPC apply แล้ว นิยาม guard และสิทธิ์ execute ผ่านการตรวจบนฐานข้อมูลจริง
2. ยังไม่ได้ deploy โค้ดรอบใหม่
3. ปรับ header มือถือให้แยกบรรทัดแล้ว และเพิ่มชื่ออาหารพร้อมจำนวนในแถบตะกร้าด้านล่าง
4. การใช้ `/api/customer-orders` ตรวจรอบอาศัยพฤติกรรมเดิมที่ปิดรอบเมื่อทุกออเดอร์เป็น completed/cancelled ควรตรวจ workflow นี้กับสภาพจริงก่อนใช้งานจริง
5. ปรับ regression browser ของ served workflow, sidebar และ live dashboard ให้ใช้สิทธิ์ใหม่ ชุด SQL ที่ทดสอบ migration เก่าตามประวัติรักษาความคาดหวังเดิมไว้ ชุด performance/remote integration เก่าทั้งหมดไม่ได้รันซ้ำในรอบนี้
6. เพิ่มและทดสอบ race ระหว่างตรวจรอบกับส่งออเดอร์ หลายแท็บเปลี่ยนรอบพร้อมกัน และ retry หลังแท็บอื่นเปลี่ยน token แล้ว

## ขั้นตอนสำหรับการนำโค้ดไปใช้งานต่อ

1. ตรวจ `git status` และ diff ปัจจุบันก่อนแก้ต่อ รักษางานที่ยังไม่ commit ทั้งหมดไว้
2. โค้ด UX และ regression ที่ระบุไว้ตอนหยุดทำเสร็จแล้ว ดูผลล่าสุดท้ายไฟล์
3. Migration ฐานข้อมูลใช้แล้ว ไม่ต้อง apply ซ้ำ; โค้ดเว็บยังไม่ได้ deploy
4. หากจะ deploy ให้ใช้ผลทดสอบและรายการไฟล์ในเอกสารนี้ตรวจทานก่อน
5. ชุด performance เก่าเป็นการเปรียบเทียบกับ baseline เดิม ไม่ได้ใช้แทน regression สิทธิ์ใหม่
6. ทดสอบทั้ง 3 บทบาทและ workflow สั่งอาหารด้วยบัญชีทดสอบที่กำหนด โดยไม่กระทบออเดอร์จริง
7. สรุปผลให้ผู้ใช้ และยังไม่ commit/push จนกว่าจะได้รับคำสั่งใหม่

ไฟล์ checkpoint นี้เพิ่มตามคำขอหยุดงาน และยังไม่ commit หรือ push เช่นเดียวกัน

## ผลรอบกลับมาทำงานต่อ — 5 ตุลาคม 2026

### สิ่งที่เพิ่ม

- ตรวจ Git และอ่าน checkpoint ก่อนแก้ต่อ ยังคง HEAD เดิม `e35a55403f8d759f66ff91eba3fd94e9a08d5c87`
- Header มือถือจัดวางเป็นแนวตั้งก่อน breakpoint ของ desktop; แถบตะกร้าด้านล่างแสดงชื่อเมนูและจำนวน พร้อมตัดข้อความยาวโดยไม่ดันจอเกินความกว้าง
- ใช้ Web Locks เมื่อเบราว์เซอร์รองรับ เพื่อให้หลายแท็บอ่าน/เปลี่ยน token ของโต๊ะเดียวกันตามลำดับ หากไม่รองรับยังใช้ขั้นตอนตรวจรอบเดิม
- Pending request เก็บ session token ของคำขอเดิมไว้ การ retry หลังแท็บอื่นเปลี่ยน localStorage จึงยังใช้ token/request ID เดิม ไม่สร้างออเดอร์ใหม่โดยไม่ตั้งใจ
- เมื่อเซิร์ฟเวอร์ปฏิเสธ 4xx เก็บตะกร้าไว้และรอผู้ใช้ยืนยันอีกครั้ง ไม่ส่งออเดอร์ซ้ำอัตโนมัติ
- ตรวจ desktop/mobile กับหลายชื่อเมนูยาว รวมการเลือกเนื้อสัตว์และ topping ที่ต้องคงตัวเลือก/ยอดรวมตรงกับ payload
- เพิ่ม SQL audit และ verification ของ RPC โดยไม่ส่งคืนข้อมูลส่วนตัว

### ฐานข้อมูลจริง

- `supabase migration list --linked` และ `db push --linked --dry-run` ยืนยันว่าค้างเฉพาะ `20261005000000_isolate_operational_roles.sql`
- ตรวจนิยามจริงของ RPC ก่อนใช้ migration: guard ตรงกับที่ migration คาดไว้
- ใช้ migration นี้สำเร็จด้วย Supabase CLI; ไม่มี seed หรือ migration อื่นถูกใช้
- ตรวจหลังใช้: `advance_order_status` อนุญาต Kitchen เท่านั้น และ `serve_order`/`complete_order_payment` อนุญาต Staff เท่านั้น; anon ไม่มี execute และ authenticated มี execute ภายใต้ guard
- ทดสอบด้วย profile active ของทั้ง 3 บทบาท โดยตั้ง JWT claims ภายใน transaction และใช้ order ID เป็น NULL เพื่อให้ไม่มีออเดอร์ถูกแก้ แล้ว rollback ทั้ง transaction: **ผ่านทั้ง Admin, Staff, Kitchen**
- checksum ของข้อมูล 10 ตารางก่อน/หลัง migration ตรงกันทั้งหมด: menus, ingredients, menu_ingredients, menu_options, menu_option_groups, menu_option_ingredients, orders, order_items, order_item_options, order_ingredient_usages
- ผล audit อยู่ใน `.test-artifacts/role-data-before.json`, `role-data-after.json`, `role-schema-after.json` ซึ่ง Git ignore

### ผลทดสอบรอบล่าสุด

- `node --test tests/*.test.mjs`: **84 tests ผ่านทั้งหมด** รวม catalog, API/SQL stock transaction, cancellation, active accounts, verified identity และ role isolation
- `node tests/browser-customer-cart.mjs`: **ผ่าน** ลิงก์จาก Admin, token ปิด/active/ไม่มี token/legacy, lookup failure, retry HTTP 503, token เปลี่ยนจากแท็บอื่น, หลายแท็บ renew รอบเดียวกัน, รอบปิดระหว่าง lookup/submit, หลายรายการชื่อยาว, meat/topping selections และ layout มือถือ/desktop
- `node tests/browser-served-orders.mjs`: **ผ่าน** Staff เสิร์ฟ/ชำระทั้งทานที่ร้านและกลับบ้าน, double click ส่ง RPC ครั้งเดียว, Kitchen controls, realtime สองหน้า, ข้อความลูกค้า และ sidebar navigation บน desktop/mobile
- `node tests/browser-role-isolation.mjs`: **ผ่านทั้ง 3 บทบาท** หน้าแรก เมนู URL หน้าย่อย users API และ cancel API
- `node tests/browser-dashboard-roles-live.mjs`: **ผ่าน** รวม retry เมื่อโหลดข้อมูล/profile ล้มเหลว, ยกเลิกออเดอร์แล้ว retry, Kitchen start/ready, realtime burst และ event ระหว่างโหลด, polling กู้ event ที่หาย, เปลี่ยนบทบาท/ปิดบัญชีแล้วแสดง 403, socket หลุด, double submit ของ Server Action และการบันทึกเมนู/ตัวเลือกเสริม
- `npm run build`: **ผ่าน** รวม TypeScript
- `npm run lint`: **0 errors**, warning เดิม 4 รายการ (`<img>` 2 จุด และตัวแปร destructuring ในชุดทดสอบเดิม 2 จุด)
- Targeted ESLint ของ browser tests ใหม่และ helper ที่แก้: **ผ่าน**
- ไม่ commit หรือ push Git และไม่ได้ deploy โค้ดเว็บ
- `git diff --check`: **ผ่าน** และ HEAD ยังคงเป็น checkpoint เดิม ไม่มี commit ใหม่

### ไฟล์เพิ่มเติมจาก checkpoint เดิม

- `tests/browser-served-orders.mjs`
- `tests/helpers/sidebar-navigation-checks.mjs`
- `tests/helpers/dashboard-live-checks.mjs`
- `tests/browser-dashboard-roles-live.mjs` (ใหม่)
- `supabase/audit-role-isolation.sql` (ใหม่)
- `supabase/verify-role-isolation.sql` (ใหม่)
- `docs/work-checkpoint.md` (อัปเดต)

ขอบเขต: browser ใช้ HTTP/WebSocket fixture; ไม่ได้ส่งออเดอร์จริงหรือสร้างบัญชีทดสอบบน production การตรวจ guard บนฐานข้อมูลจริงใช้ transaction rollback ตามรายละเอียดข้างต้น
