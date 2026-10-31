# เสียงพร้อมเสิร์ฟ การชำระรายจาน และสมาชิกสมัครใจ

## จุดสำรองก่อนแก้ไข

- Branch: `feature/remove-option-groups-user-identity`
- Commit บน GitHub: `f39e85e2fd88cbd75bf42b0ff9396032c67da802`
- ตรวจด้วย `git ls-remote --heads origin feature/remove-option-groups-user-identity` ได้ hash ตรงกันก่อนแก้ source
- ก่อน commit มีเฉพาะ `docs/project-exam-guide-th.md` ที่ยังไม่ติดตาม ไม่มี staged/tracked diff ตรวจชื่อไฟล์และรูปแบบ private key, GitHub/Supabase secret token, JWT และ URL ฐานข้อมูลที่มีรหัสผ่านในไฟล์ที่จะสำรอง 220 ไฟล์ ไม่พบรูปแบบเหล่านี้ การสแกนนี้ไม่ใช่การรับประกันว่าไม่มีความลับทุกรูปแบบ
- ไม่รวม `.env*`, `.test-artifacts/`, metadata การ link Supabase หรือ database backup ใน Git
- งานฟีเจอร์นี้ยังไม่ push และยังไม่ deploy

## พฤติกรรมและไฟล์หลัก

### เสียง

`src/components/ready-plate-alerts.tsx` ใช้ Web Audio API สร้างเสียงใน browser ไม่ดาวน์โหลดเสียงหรือเรียกบริการภายนอก ปุ่มเปิด/ปิด ทดลองเสียง และ localStorage จำความต้องการของอุปกรณ์ ทุก document ใหม่ยังต้องกดอนุญาตก่อนเล่นเสียงได้

`src/lib/ready-plate-notifications.ts` ใช้คีย์ order/item/plate และจำรายการที่เห็นตลอดอายุหน้าจอ snapshot สำเร็จครั้งแรกเป็น baseline เงียบ จากนั้นตรวจเฉพาะจานใหม่ที่ทำเสร็จรอเสิร์ฟ รวมเสียงในช่วง 600 ms การ polling, Realtime, reconnect, การเสิร์ฟจนรายการหาย และรายการเดิมกลับเข้ามา ไม่ทำให้แจ้งซ้ำ

หน้าพร้อมเสิร์ฟเน้นรายการใหม่ด้วยกรอบและข้อความ แม้ปิดเสียง ไม่มี push notification นอกหน้าที่เปิดอยู่ `OrderRealtimeRefresh` และการรอ Auth/fallback polling เดิมยังทำงานตามเดิม เสียงฟีเจอร์นี้อยู่ในหน้าพร้อมเสิร์ฟ การแจ้งข้อความที่ sidebar เดิมยังอยู่

### การชำระเงิน

ก่อนออกแบบอ่าน baseline constraints, migrations และเอกสาร audit เดิม พบ `payments_order_id_key UNIQUE(order_id)`, FK ไป orders และ RPC `complete_order_payment` รวมถึง `unit_price` ที่ snapshot **รวมตัวเลือก/ของเพิ่มต่อจานแล้ว** จึงไม่บวกตัวเลือกซ้ำ

Migration `20261031000000_item_payments.sql`:

- เก็บ payments เดิมและ order_id เดิมเป็น anchor ของใบรับเงิน เอา unique ของ order_id ออก
- เพิ่ม `amount_satang`, `request_id`, canonical `request_payload`, `received_by`
- เพิ่ม `payment_allocations(payment_id, order_item_id, quantity, amount_satang)` พร้อม RLS และสิทธิ์อ่านเฉพาะ staff/admin; ลูกค้าอ่านผ่าน API ที่ตรวจ dining-session token เท่านั้น
- ย้าย paid payments เดิมเป็น allocation เต็มจำนวนโดยไม่เปลี่ยน ID/ยอด/เวลาของ receipt เดิม หากยอดเก่าไม่ตรง snapshot ของ items ให้ migration หยุด `LEGACY_PAYMENT_TOTAL_REQUIRES_REVIEW` เพื่อให้ตรวจสอบ ไม่เดาหรือแก้ยอดเอง failed/pending/refunded เดิมยังคงอยู่ แต่ไม่หักจำนวนที่จ่ายสำเร็จ
- `collect_item_payment` ตรวจ role staff, วิธี cash/qr_code, จำนวนเต็ม, การซ้ำของ items, ราคา snapshot และ session เดียวกัน ใช้ transaction, advisory lock ต่อ request_id, order locks ตาม UUID ที่เรียงแล้ว และ item locks ป้องกันเก็บจำนวนเกิน เมื่อ request_id เดิมแต่ payload เปลี่ยนจะปฏิเสธ
- ออเดอร์ที่ไม่มี session รวมกับออเดอร์อื่นไม่ได้ เลขโต๊ะไม่ถูกใช้เป็นเงื่อนไขรวมบิล
- คงกติกาเดิมว่ารับชำระเมื่อออเดอร์เสิร์ฟครบ (`served`) ไม่รับชำระล่วงหน้าระหว่างครัวทำงาน จ่ายบางจานได้หลังเสิร์ฟครบแล้ว โดยสถานะครัวยังแยกจากจำนวนที่ชำระ
- เปลี่ยนเป็น completed เมื่อจำนวนทุก item ชำระครบแล้วเท่านั้น Partial payment แตะ updated_at เพื่อปลุก Realtime/polling ของหน้าที่เกี่ยวข้อง
- RPC เดิม `complete_order_payment` เป็นทางจ่ายยอดคงเหลือของออเดอร์นั้น ใช้กลไกเดียวกัน จึงไม่เรียกเก็บราคาทั้งบิลซ้ำหลังมี partial payment

`session-payment.tsx` จัดกลุ่ม session เลือกทั้งหมดหรือจำนวนต่อ item แสดงจ่ายแล้ว/ค้าง ยอดครั้งนี้/คงเหลือ และ receipt แยกเงินสดกับ QR ให้พนักงานยืนยันตามเดิม ไม่มีตรวจธนาคาร/สลิปอัตโนมัติ ป้องกัน double click ในหน้าจอ และเก็บคำขอที่ผลยังไม่ชัดใน sessionStorage เพื่อลองรหัสเดิมหลัง reload

`order-views.ts`, `payment-progress.tsx`, `payment-history.tsx`, customer-orders API/หน้าออเดอร์ลูกค้า และหน้าประวัติ แสดงยอดตาม allocations ไม่มีข้อมูลสมาชิกใน public payload ประวัติ receipt ที่จัดสรรให้ออเดอร์หนึ่งแสดงเฉพาะส่วนของออเดอร์นั้น หน้ารอชำระแสดงออเดอร์ที่จ่ายครบใน session เดียวกันประกอบด้วยเมื่อยังมีออเดอร์อื่นค้างอยู่

รายงานรวมเงินรับจริงจาก receipt ID แต่ละรายการครั้งเดียวตาม paid_at รวม partial payment แม้ออเดอร์ยังไม่ completed ไม่ใช้ order_id เป็นตัว deduplicate อีกต่อไป กราฟจำนวนออเดอร์แยกนับ completed orders ไม่ใช่จำนวน receipts ส่วนยอดเมนูเดิมยังเป็นยอดออเดอร์ completed ของเดือน และตารางกลุ่มสมาชิกนับออเดอร์ที่ไม่ยกเลิกตาม created_at โดยระบุฐานเวลาต่างกันบนหน้าจอ

### สมาชิก

Migration `20261031010000_optional_members.sql` เพิ่ม:

- `members`: เบอร์ normalized รูปแบบ +66, phone_verified=false, เพศ, ช่วงอายุ, promotion_consent แยกต่างหาก และรุ่นคำอธิบายความยินยอม ไม่เก็บวันเกิด
- `member_devices`: SHA-256 ของ token สุ่ม 256-bit, active, อายุ 180 วัน และ audit การอนุมัติ ไม่มี token plaintext ในฐานข้อมูล
- `orders.member_id`: เจ้าของออเดอร์เมื่อสั่ง ไม่เปลี่ยนเมื่อคนอื่นจ่ายหรือรวมบิล

`/api/membership` รับสมัครโดยสมัครใจจากแผงพับในหน้าเมนู ไม่ขวางขั้นตอนสั่งอาหาร เก็บ token ใน HttpOnly/SameSite=Strict cookie และ Secure ใน production ตรวจ Origin ของคำขอสมัคร แสดงว่าเบอร์ยังไม่ยืนยัน ไม่ส่ง SMS/OTP และไม่คืนเบอร์หรือ demographic ผ่าน API สถานะ

เบอร์ใหม่สร้างสมาชิกและผูกกับ token ของอุปกรณ์ที่สมัคร เบอร์ที่มีอยู่แล้วสร้างคำขออุปกรณ์ inactive โดย **ไม่เปิดเผย/แก้ข้อมูลเดิม และไม่ผูกอัตโนมัติ** พนักงานช่วยที่ `/dashboard/members` ดูเบอร์ปกปิดและรหัสอ้างอิง ต้องตรวจหลักฐานเพิ่มเติมนอกเหนือจากการบอกเบอร์ พร้อมยืนยันและบันทึกวิธีตรวจสอบ หากตรวจไม่ได้ให้ใช้ลูกค้าทั่วไปตามเดิม ไม่มีทางนำเบอร์อย่างเดียวไปดูประวัติ/แก้สมาชิก

`create_member_order` เรียก transaction สั่งเดิมและผูก member ภายใน transaction เดียว ตรวจ hash ที่ active/ไม่หมดอายุเท่านั้น cookie ไม่ถูกต้องหรือยังรอตรวจเป็น guest การ retry ออเดอร์เดิมไม่เปลี่ยนเจ้าของ แม้ระหว่างนั้นอุปกรณ์ได้รับอนุมัติ ตารางสมาชิกไม่มี SELECT policy หรือ GRANT ให้ anon/authenticated หน้าพนักงานอ่านผ่าน server หลังตรวจ role staff เท่านั้น Admin ดูสถิติรวมผ่าน `member_menu_statistics` แยก guest/member/ไม่ระบุเพศหรืออายุ ไม่มีเบอร์หรือ token ในผลลัพธ์

## ฐานข้อมูลจริงและข้อจำกัด

**ยังไม่ได้รัน migration หรือแก้ข้อมูลบนฐานจริง** ไม่มี production reset หรือการขยาย RLS ของตารางเดิม ไม่มี dependency/บริการเสียเงินเพิ่ม

ตรวจโครงสร้างจาก migrations, fixture baseline, docs และ artifact metadata audit ที่มีอยู่ (audit เดิมวันที่ 26 ตุลาคม 2026) ไม่อ้างว่าเป็นการ audit schema จริงใหม่ ณ วันทำฟีเจอร์ เครื่องนี้ไม่พบ pg_dump/psql/Docker จึงยังไม่สร้าง full SQL backup ใหม่และยังไม่ทดสอบหลาย connection ของ PostgreSQL จริง PGlite เป็นฐานแยกสำหรับทดสอบ SQL/roles/migration/rollback แต่ serialize งานใน connection เดียว ไม่ใช่หลักฐานพิสูจน์ deadlock/locking ของสอง backend จริง

ก่อนนำขึ้นฐานจริง ต้องทำดังนี้ในช่วงหยุดรับรายการชั่วคราว:

1. อ่าน metadata ล่าสุดเทียบ constraints, grants, RPC, triggers, policies กับ schema ที่ทดสอบ โดยเฉพาะ payment unique/FK และ trigger การปิด session
2. สำรอง schema/data ที่กู้คืนได้จริงด้วย pg_dump/Supabase CLI รวม orders, order_items, options, payments, dining_sessions, profiles และ functions/policies/triggers เก็บนอก Git และจำกัดสิทธิ์ไฟล์ สคริปต์ `scripts/catalog-backup.mjs` เดิมเป็น PostgREST JSON backup เสริม ไม่ใช่ full SQL backup
3. Restore backup ในฐาน PostgreSQL แยกที่เข้ากันได้กับ Supabase ทดสอบ migration ทั้งสองตามลำดับ และ rollback ก่อนมีธุรกรรมใหม่ เทียบ ID/ยอด/เวลาประวัติเดิม
4. ทดสอบสอง authenticated staff connections ชำระ item เดียวพร้อมกัน และรวมชุด orders ที่ทับซ้อนกัน ตรวจว่ามีเพียงจำนวนที่ค้างถูกชำระ และยอด receipts รวมตรง allocations
5. ทดสอบ Supabase RLS/Realtime จริงทุกบทบาท รวมสมาชิก guest/new/existing/expired/recovery และ public API ก่อนอนุญาต apply/deploy

การตรวจรอบนี้ใช้ local fixtures เท่านั้น ไม่ได้สร้างออเดอร์/สมาชิกทดสอบบน production และยังไม่ได้ยืนยันเสียงบน iOS/Safari หรือทุกอุปกรณ์

## คำสั่งตรวจ

```text
node --test tests/*.test.mjs
npx --no-install tsc --noEmit
npm run lint
npm run build
node tests/browser-served-orders.mjs
node tests/browser-customer-cart.mjs
node tests/browser-role-isolation.mjs
```

Browser suites ใช้ local HTTP/Phoenix fixtures และ Edge headless รันทีละคำสั่งเพราะใช้ port ร่วมกัน ไม่ใช้เป็นหลักฐานการอนุญาตของ Supabase จริง ผลล่าสุดและข้อจำกัดสรุปในข้อความส่งมอบของงาน

ผลตรวจในเครื่อง:

- Unit/SQL regression รวม 96 tests ผ่าน รวม FCFS, partial serving, roles, transaction rollback, payment allocations, idempotency, member privacy และ normalization
- ชุดสมาชิกเพิ่มตรวจรวมจ่าย guest+member แล้วเจ้าของออเดอร์ไม่เปลี่ยน, retry หลังอนุมัติไม่ย้ายออเดอร์ guest และ token หมดอายุไม่ผูกสมาชิก
- Typecheck และ production build ผ่าน
- Lint ผ่าน ไม่มี error มี warning เดิม 4 จุด (img 2 จุด และตัวแปรใน test เดิม 2 จุด)
- browser-served-orders ผ่าน: Web Audio จริงบน Edge, baseline/reload/reconnect, การจ่ายเงินสด/QR บางจำนวน, session grouping, retry รหัสเดิมหลัง reload, double click, สองหน้าจอ Realtime, FCFS/เสิร์ฟรายจาน, mobile/desktop, สมาชิกใหม่/เบอร์เดิม, HttpOnly cookie, การปกปิดเบอร์และ staff review
- browser-customer-cart ผ่าน รวมการต่อรอบโต๊ะ ตะกร้า ตัวเลือก ราคา และจอมือถือ/desktop
- browser-role-isolation ผ่าน Admin/Staff/Kitchen รวม `/dashboard/payments` และ `/dashboard/members`
- ตรวจภาพ `pending-payments-375.png` ใน `.test-artifacts/served-orders/` ด้วย ข้อมูลในภาพเป็น fixture

## ย้อนกลับ

โค้ด: เก็บงานปัจจุบันก่อนเปิด branch ตรวจจุดสำรอง ด้วย `git switch -c restore/pre-features f39e85e2fd88cbd75bf42b0ff9396032c67da802` หากยังมี uncommitted changes ต้องเก็บ patch/ไฟล์ใหม่หรือ commit ในเครื่องก่อน การ switch อย่างเดียวอาจพางานที่ยังไม่ commit ไปด้วย ห้าม force push หรือ reset ฐานจริง

ฐานข้อมูล: อ่านและรันในฐานแยกก่อน ใช้ `supabase/rollback/20261031010000_optional_members.sql` แล้ว `supabase/rollback/20261031000000_item_payments.sql` ตามลำดับย้อน ทั้งสองมี transaction/lock และหยุดเมื่อมีข้อมูลสมาชิกหรือ receipt จากฟีเจอร์ใหม่แล้ว เพื่อไม่ลบประวัติจริง

หากมีธุรกรรมใหม่แล้ว การ downgrade กลับโครงสร้างหนึ่ง payment ต่อ order ทำให้บางส่วน/หลาย order แสดงผิดได้ ห้ามฝืนลบข้อมูลเพื่อผ่าน guard ให้ใช้ forward fix หรือ restore ที่มีแผน reconcile ธุรกรรมหลังจุด backup และตรวจยอดโดยผู้ดูแลก่อน ห้ามนำโค้ดเก่ากลับรับเงินกับ schema ใหม่โดยไม่ตรวจความเข้ากันได้
