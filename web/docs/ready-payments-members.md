# เสียงพร้อมเสิร์ฟ การชำระรายจาน และสมาชิกสมัครใจ

## จุดสำรองก่อนแก้ไข

- Branch: `feature/remove-option-groups-user-identity`
- Commit บน GitHub: `f39e85e2fd88cbd75bf42b0ff9396032c67da802`
- ตรวจด้วย `git ls-remote --heads origin feature/remove-option-groups-user-identity` ได้ hash ตรงกันก่อนแก้ source
- ก่อน commit มีเฉพาะ `docs/project-exam-guide-th.md` ที่ยังไม่ติดตาม ไม่มี staged/tracked diff ตรวจชื่อไฟล์และรูปแบบ private key, GitHub/Supabase secret token, JWT และ URL ฐานข้อมูลที่มีรหัสผ่านในไฟล์ที่จะสำรอง 220 ไฟล์ ไม่พบรูปแบบเหล่านี้ การสแกนนี้ไม่ใช่การรับประกันว่าไม่มีความลับทุกรูปแบบ
- ไม่รวม `.env*`, `.test-artifacts/`, metadata การ link Supabase หรือ database backup ใน Git
- จุดสำรองงานฟีเจอร์ก่อนตรวจต่อ: `22aad15f059c2f47e3504dfe5a34f4b411996e16`
- งานส่งมอบอนุญาตให้ commit/push บน branch เดิมแล้ว ดู hash ส่งมอบในข้อความสรุปและ `git log` เว็บยังไม่ deploy production

## พฤติกรรมและไฟล์หลัก

### เสียง

`src/components/ready-plate-alerts.tsx` ใช้ Web Audio API สร้างเสียงใน browser ไม่ดาวน์โหลดเสียงหรือเรียกบริการภายนอก ปุ่มเปิด/ปิด ทดลองเสียง และ localStorage จำความต้องการของอุปกรณ์ ทุก document ใหม่ยังต้องกดอนุญาตก่อนเล่นเสียงได้

`src/lib/ready-plate-notifications.ts` ใช้คีย์ order/item/plate และจำรายการที่เห็นตลอดอายุหน้าจอ snapshot สำเร็จครั้งแรกเป็น baseline เงียบ จากนั้นตรวจเฉพาะจานใหม่ที่ทำเสร็จรอเสิร์ฟ รวมเสียงในช่วง 600 ms การ polling, Realtime, reconnect, การเสิร์ฟจนรายการหาย และรายการเดิมกลับเข้ามา ไม่ทำให้แจ้งซ้ำ

หน้าพร้อมเสิร์ฟเน้นรายการใหม่ด้วยกรอบและข้อความ แม้ปิดเสียง ไม่มี push notification นอกหน้าที่เปิดอยู่ `OrderRealtimeRefresh` และการรอ Auth/fallback polling เดิมยังทำงานตามเดิม เสียงฟีเจอร์นี้อยู่ในหน้าพร้อมเสิร์ฟ การแจ้งข้อความที่ sidebar เดิมยังอยู่ หลายแท็บที่เปิดเสียงใน browser/origin/บัญชีเดียวกันใช้ Web Locks และรายการจานที่เคยดังใน localStorage เพื่อให้ดังครั้งเดียวต่อจานในอุปกรณ์นั้น หากไม่มี Web Locks/shared storage จะให้เฉพาะแท็บที่มี focus ส่งเสียง ไม่ประสานเสียงระหว่างคนละอุปกรณ์

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

เบอร์ใหม่สร้างสมาชิกและผูกกับ token ของอุปกรณ์ที่สมัคร เบอร์ที่มีอยู่แล้วสร้างคำขออุปกรณ์ inactive โดย **ไม่เปิดเผย/แก้ข้อมูลเดิม และไม่ผูกอัตโนมัติ** พนักงานช่วยที่ `/dashboard/members` ดูเบอร์ปกปิดและรหัสอ้างอิง ต้องตรวจหลักฐานเพิ่มเติมนอกเหนือจากการบอกเบอร์ พร้อมยืนยันและบันทึกวิธีตรวจสอบ หากตรวจไม่ได้ให้ใช้ลูกค้าทั่วไปตามเดิม ไม่มีทางนำเบอร์อย่างเดียวไปดูประวัติ/แก้สมาชิก เมื่ออนุมัติกู้การผูกอุปกรณ์ จะเพิกถอน token ของอุปกรณ์เดิมอื่นใน transaction เดียวกันเพื่อป้องกันเครื่องสูญหาย

ลูกค้ากดยกเลิกการผูกในแผงสมาชิกได้ (`DELETE /api/membership`) ตรวจ Origin และเพิกถอน hash ฝั่งฐานจริงก่อนล้าง cookie ถ้าเพิกถอนไม่สำเร็จจะไม่อ้างว่า logout สำเร็จ token หมดอายุ/ถูกเพิกถอนไม่สามารถผูกออเดอร์ใหม่ และ cookie ใช้ไม่ได้จะถูกล้างเมื่ออ่านสถานะ ออเดอร์เก่าไม่ถูกย้ายเจ้าของ การอ่าน token เพื่อสั่งอาหารใช้ row lock ร่วมกับการเพิกถอน

`create_member_order` เรียก transaction สั่งเดิมและผูก member ภายใน transaction เดียว ตรวจ hash ที่ active/ไม่หมดอายุเท่านั้น cookie ไม่ถูกต้องหรือยังรอตรวจเป็น guest การ retry ออเดอร์เดิมไม่เปลี่ยนเจ้าของ แม้ระหว่างนั้นอุปกรณ์ได้รับอนุมัติ ตารางสมาชิกไม่มี SELECT policy หรือ GRANT ให้ anon/authenticated หน้าพนักงานอ่านผ่าน server หลังตรวจ role staff เท่านั้น Admin ดูสถิติรวมผ่าน `member_menu_statistics` แยก guest/member/ไม่ระบุเพศหรืออายุ ไม่มีเบอร์หรือ token ในผลลัพธ์

## สถานะฐานจริง: 1 พฤศจิกายน 2026 เวลาไทย

**Apply migrations ทั้งสามกับ Supabase เดิมแล้ว** ตรวจ linked project ตรงกับ URL ของแอปก่อนทำงาน history เพิ่มจาก 28 เป็น 31 versions ได้แก่ `20261031000000`, `20261031010000` และ `20261101000000` สองรายการแรกทำ schema/history ใน transaction เดียวกัน และรายการแก้ lock เพิ่มเติมทำ definition/history ใน transaction ของตัวเอง มี lock timeout และ reload PostgREST schema ไม่มี reset ฐานจริง ไม่มี dependency/บริการเสียเงินเพิ่ม

ก่อน apply ได้ใช้ native pg_dump/pg_dumpall จาก PostgreSQL 17.11 (portable) สำรอง PostgreSQL 17.6 ของ Supabase ผ่าน login ชั่วคราวของ CLI จากนั้น restore ลง PostgreSQL 17.11 ที่ localhost แยกจากฐานจริง เปรียบเทียบแถวข้อมูลทั้ง 51 ตารางและ sequence 14 ตัวตรงกัน ทดสอบ migration/rollback และ concurrency จริงก่อน apply

หลัง apply ตรวจค่าเดิมของ orders/payments โดยตัดเฉพาะคอลัมน์ใหม่ออกแล้ว hash ตรงเดิม ตารางอื่นตรงเดิม ประวัติ payments เดิมไม่เปลี่ยน ID/ยอด/เวลา และ paid allocations รวมตรง receipt เก่า RLS/grants ของตารางและ views เดิม, triggers, functions ที่ไม่เกี่ยวข้อง และ cron jobs เดิมตรงกัน publication membership/filter ไม่เปลี่ยน แต่ all-columns publication ของ orders มี `member_id` UUID เพิ่มตาม schema จึงไม่อ้างว่ารายการคอลัมน์ publication ไม่เปลี่ยน ไม่มีเบอร์หรือ demographic ใน orders/public customer API

เพิ่ม `20261101000000_member_recovery_lock_order.sql` หลังทำซ้ำ deadlock ในฐานแยกได้จริง: ออเดอร์ถือ SHARE ที่ device และกำลังตรวจ member FK ขณะที่ recovery ถือ member FOR UPDATE แล้วรอเพิกถอน device แก้ member lock เป็น FOR NO KEY UPDATE เพื่อยัง serialize recovery แต่เข้ากับ FK KEY SHARE ได้ ทดสอบก่อนแก้พบ deadlock 1 connection หลังแก้ทั้ง 2 connections สำเร็จ พร้อมทดสอบ rollback definition/history และ permissions ไม่เปลี่ยน ก่อน apply ได้สำรองและ restore สถานะล่าสุดอีกชุดที่มี 54 ตารางตรงกัน การตรวจหลัง apply พบเปลี่ยนเฉพาะ definition นี้กับ history เพิ่ม 1 แถว ไม่มีข้อมูล/sequence/สิทธิ์อื่นเปลี่ยน

## Logical backup และ restore

โฟลเดอร์ส่วนตัวนอก Git: `D:\Projects\smart-order-system\web\.test-artifacts\ready-members-live` จำกัด NTFS ACL ให้บัญชีที่ใช้ทำงาน, SYSTEM และ Administrators ต้องใช้บัญชี/PowerShell ที่เข้าถึงโฟลเดอร์นี้ได้ เก็บไฟล์นี้ไว้และคัดลอกไปยังที่สำรองที่ผู้ดูแลควบคุมก่อน cleanup workspace

ไฟล์หลัก:

- `related-database.dump`: custom-format logical backup ของ schemas public, auth, catalog_backup, supabase_migrations รวมข้อมูล, functions, triggers, policies, indexes, constraints, ACL/default privileges ที่อยู่ใน scope
- SHA-256: `15d8407ea671315c7ad352142f6c4e80dd908ed6349bf2d5b93661f0fac4d8d6`
- `roles-no-passwords.sql`: attributes/memberships ของ roles โดยไม่มีรหัสผ่าน SHA-256 `0f13b77da64f36fd76d559e41e045dbb59473ea5000a3326db3688eaae69ceed`
- `manifest.json`, `schema-before.private.json`, `data-before.private.json`, `schema-after-apply.private.json`, `applied-verification.json`, `restore-verification.json`, `migration-rehearsal.json`, `postgres-concurrency.json` และ captures รอบสุดท้าย
- โฟลเดอร์ `TEST-feature-*` มี registry ID ทุก resource ทดสอบ, ผล smoke, fingerprints ก่อน/หลัง cleanup และ log ส่วนตัว ไม่เก็บใน Git

backup ล่าสุดก่อน lock fix อยู่ subfolder `before-lock-fix/` ในโฟลเดอร์เดียวกัน กู้คืนและเทียบแล้ว 54 ตาราง/14 sequences ตรงกัน:

- `related-database.dump` SHA-256 `db60f9667c5299405a5afe10a8b42552cd03995a5c4631746745c83c2576a381`
- `roles-no-passwords.sql` SHA-256 `34d082b7ad8da486d067490cdb523f459425a067eaecc5648434afce8b63122e`
- มี manifest และ restore-verification ของตัวเอง ไม่ได้เขียนทับ backup ก่อนเริ่มฟีเจอร์

นี่ **ไม่ใช่ full-instance backup**: ไม่รวม Storage object files, Edge Functions, API/JWT secrets, platform/network settings, extension binaries หรือ role passwords ส่วน publication/cron schedules ที่เกี่ยวข้องมี metadata ใน schema audit เพื่อประกอบการกู้บน Supabase ที่เตรียมไว้ ไม่ได้จำลอง pg_cron service บน Windows

ตรวจ checksum ด้วย `Get-FileHash -Algorithm SHA256` ก่อนกู้ สคริปต์ `scripts/feature-postgres-local.mjs restore` กู้ลงฐาน localhost ใหม่เสมอโดยไม่ reset ฐานที่มีอยู่ ใช้รหัสสุ่มและฟังเฉพาะ 127.0.0.1:55439 การกู้บน standalone ปรับเฉพาะ bootstrap owner และ grantor ของ role memberships ให้เป็นเจ้าของ cluster ในเครื่อง โดยเก็บ membership options และ dump ต้นฉบับไว้ครบ ไม่อ้างว่า grantor ของ cluster roles เหมือน Supabase ทุกตัว

คำสั่งกู้มาตรฐานใน **ฐานเป้าหมายใหม่ที่เตรียม roles/extensions แล้ว**:

```text
pg_restore --list related-database.dump
pg_restore --exit-on-error --dbname <NEW_TARGET_DATABASE> related-database.dump
```

อย่ารัน `--clean`, reset หรือ restore ทับฐานจริงโดยตรง การกู้กลับใช้งานต้องจับคู่เวอร์ชันโค้ดกับ schema และ reconcile ธุรกรรมหลัง backup ก่อน ข้อมูล auth ใน dump เป็นข้อมูลอ่อนไหว และการกู้ database ไม่คืนไฟล์ Storage หรือการตั้งค่า control plane ที่อยู่นอก scope

เครื่องมือในเครื่องอยู่ `.test-artifacts/pg-tools/native/pgsql/bin` แพ็กเกจ PostgreSQL ดาวน์โหลดจาก [EDB binaries](https://www.enterprisedb.com/download-postgresql-binaries) ผ่าน HTTPS; SHA-256 ของ zip `4b8db0930c38f6ef845db919551dedda3b6b845aeb0927b3d79a6e8e9e4537cf` ไม่อ้างว่าไฟล์ executable มี Authenticode signature

จบงานแล้วหยุด PostgreSQL localhost ที่สร้างทดสอบ และลบไฟล์เชื่อมต่อ cloud ชั่วคราว เก็บ native binaries, archive, backup, รหัสของ cluster ทดสอบในโฟลเดอร์ส่วนตัว และหลักฐานไว้ การรันชุด PostgreSQL ซ้ำต้องเริ่ม cluster ทดสอบเดิมก่อน; hosted suite ไม่ต้องเริ่ม cluster นี้ ใช้ native client binaries และ Supabase CLI ที่ login ไว้ (`SUPABASE_CLI_EXE` เปลี่ยนตำแหน่ง CLI ได้)

## PostgreSQL concurrency และ hosted smoke

`tests/postgres-feature-concurrency.mjs` ใช้ psql หลาย processes/backend connections จริงในฐานแยก ตรวจ backend PIDs และพบ wait_event_type=Lock ครอบคลุม:

- RPC ชำระเต็มเดิมยังคืน response รูปแบบเดิม ใช้กับเว็บเวอร์ชันที่ยังใช้งานอยู่ได้
- แข่งจ่ายจำนวนเดียวกัน, แบ่งคนละหนึ่งจาน และจ่ายรวมชนกับบางรายการ
- request เดิมซ้ำ, key เดิมแต่ payload ต่างกัน, retry หลัง client timeout ที่เกิดหลัง COMMIT
- inject failure หลังสร้าง receipt แต่ระหว่าง allocations แล้วไม่มีข้อมูลค้างบางส่วน
- จำนวนจัดสรรไม่เกินอาหาร, เงิน receipt เท่ากับ allocations, ยอดคงเหลือไม่ติดลบ, completed เฉพาะเสิร์ฟ/จ่ายครบ
- คนละ session แม้เลขโต๊ะเดียวกันถูกปฏิเสธ
- สมัครเบอร์เดียวกันพร้อมกันได้ member เดียว อุปกรณ์ที่สองรอตรวจ ไม่แก้ demographic/consent เดิม; staff recovery เพิกถอนอุปกรณ์เก่า และตรวจ self-revocation/role denial
- rollback ก่อนธุรกรรมใหม่คืนข้อมูล/schema/functions/grants/sequences/history ได้ และ rollback หลังมีประวัติใหม่หยุดที่ guard โดยไม่ลบประวัติเพื่อให้ผ่าน
- `tests/postgres-member-lock-order.mjs` ทำซ้ำ/แก้ device-member FK deadlock ด้วย 2 connections จริง พร้อมตรวจ rollback และ ACL ของ function

`tests/hosted-feature-smoke.mjs` ใช้ Next dev ที่ localhost:4424 ต่อ Supabase จริงแบบลำดับ ไม่มีการแข่งจ่ายบนฐานจริง สร้างเฉพาะ resources ชื่อ TEST พร้อม registry ใช้ ingredient/menu/table/users/member ของชุดทดสอบ ตรวจ guest/member ผ่าน HTTP จริง, FCFS/เสิร์ฟรายจาน, Auth/Realtime จริง, เงินสดบางจำนวนแล้วรวม QR, receipts 2 ครั้งรวม 11100 สตางค์ตรง allocations, ownership ไม่เปลี่ยน และสถิติ Admin แยก member 2 จาน/guest 1 จาน รวมหมดอายุ/กู้สมาชิก/เพิกถอน/CSRF/ปกปิดข้อมูลและ role permissions

Hosted smoke ผ่านทั้งก่อนและหลัง lock fix แต่ละรอบได้ Realtime events จริง 8 ครั้ง และลบเฉพาะ ID ทดสอบที่ลงทะเบียนไว้แล้ว hash/count ทุกตารางหลัง cleanup ตรงก่อน smoke ไม่ได้ deploy เว็บ แต่ **sequence 8 ตัวเลื่อนและไม่ได้ย้อน**: menus_id_seq, categories_id_seq, ingredients_id_seq, order_items_id_seq, orders_order_number_seq, restaurant_tables_id_seq, order_ingredient_usages_id_seq และ auth.refresh_tokens_id_seq ค่าก่อน/หลังเก็บในผลส่วนตัว ไม่อ้างว่าฐานทั้ง instance/cluster-global catalogs ไม่เปลี่ยน เพราะ CLI ใช้ login role ชั่วคราวและ test login ใช้ Auth จริง

ข้อจำกัดที่เหลือ: เสียงทดสอบกับ Edge/Chromium ไม่ได้ทดสอบอุปกรณ์ iOS/Safari ทุกแบบ ไม่มี SMS/OTP, push ภายนอก, ระบบตรวจธนาคารหรือสลิป และยังไม่ deploy เว็บ production

## คำสั่งตรวจ

```text
node --test tests/*.test.mjs
npx --no-install tsc --noEmit
npm run lint
npm run build
node tests/browser-served-orders.mjs
node tests/browser-customer-cart.mjs
node tests/browser-role-isolation.mjs
node tests/postgres-feature-concurrency.mjs
node tests/postgres-member-lock-order.mjs verify-fix
node tests/hosted-feature-smoke.mjs
```

Browser fixture suites ใช้ local HTTP/Phoenix และ Edge headless รันทีละคำสั่งเพราะใช้ port ร่วมกัน ส่วน PostgreSQL และ hosted suites แยกตามคำอธิบายข้างต้น Hosted suite สร้าง/ล้าง TEST บนฐานจริง จึงต้องตรวจ registry/backup/queue ก่อนใช้ ไม่ใช่ชุดที่ควรรันอัตโนมัติทั่วไป

ผลตรวจในเครื่อง:

- Unit/SQL regression รวม 96 tests ผ่าน รวม FCFS, partial serving, roles, transaction rollback, payment allocations, idempotency, member privacy และ normalization
- ชุดสมาชิกเพิ่มตรวจรวมจ่าย guest+member แล้วเจ้าของออเดอร์ไม่เปลี่ยน, retry หลังอนุมัติไม่ย้ายออเดอร์ guest และ token หมดอายุไม่ผูกสมาชิก
- Typecheck และ production build ผ่าน
- Lint ผ่าน ไม่มี error มี warning เดิม 4 จุด (img 2 จุด และตัวแปรใน test เดิม 2 จุด)
- browser-served-orders ผ่าน: Web Audio จริงบน Edge, baseline/reload/reconnect, การจ่ายเงินสด/QR บางจำนวน, session grouping, retry รหัสเดิมหลัง reload, double click, สองหน้าจอ Realtime, FCFS/เสิร์ฟรายจาน, mobile/desktop, สมาชิกใหม่/เบอร์เดิม, HttpOnly cookie, การปกปิดเบอร์และ staff review
- browser-customer-cart ผ่าน รวมการต่อรอบโต๊ะ ตะกร้า ตัวเลือก ราคา และจอมือถือ/desktop
- browser-role-isolation ผ่าน Admin/Staff/Kitchen รวม `/dashboard/payments` และ `/dashboard/members`
- ตรวจภาพ `pending-payments-375.png` ใน `.test-artifacts/served-orders/` ด้วย ข้อมูลในภาพเป็น fixture

## วิธีเปิดใช้

ฐาน Supabase พร้อมสำหรับโค้ด branch นี้แล้ว ขั้นตอนที่เหลือคือให้เจ้าของสั่ง deploy เว็บเวอร์ชันนี้ด้วย env เดิม (`NEXT_PUBLIC_SUPABASE_URL`, publishable key และ service-role เฉพาะ server) ไม่มี env หรือบริการเสียเงินใหม่ ไม่ต้อง apply ทั้งสาม migrations ซ้ำ เว็บเวอร์ชันเดิมยังรับจ่ายเต็มผ่าน RPC เดิมได้ แต่ฟีเจอร์บางจาน/สมาชิกจะใช้เมื่อเปิดโค้ดเวอร์ชันใหม่ ไม่ควรสลับกลับเว็บเก่าหลังเริ่มใช้ partial/multi-order receipts โดยไม่ตรวจรายงานและ schema คู่กัน

พนักงานเปิด `/dashboard/ready` กดเปิดเสียงครั้งแรกและทดลองเสียงได้; เปิด `/dashboard/payments` เลือกรอบโต๊ะและจำนวน แล้วกดรับเงินสด/ตรวจรับ QR ตามการรับเงินจริง; ลูกค้าเปิดแผงสมาชิกในหน้าเมนูโดยสมัครใจ; กรณีเบอร์เดิมให้พนักงานตรวจที่ `/dashboard/members` Admin ดูสถิติรวมที่ `/dashboard/reports`

## ย้อนกลับ

โค้ด: เก็บงานปัจจุบันก่อนเปิด branch ตรวจจุดสำรอง ด้วย `git switch -c restore/pre-features f39e85e2fd88cbd75bf42b0ff9396032c67da802` หากยังมี uncommitted changes ต้องเก็บ patch/ไฟล์ใหม่หรือ commit ในเครื่องก่อน การ switch อย่างเดียวอาจพางานที่ยังไม่ commit ไปด้วย ห้าม force push หรือ reset ฐานจริง

ฐานข้อมูล: อ่านและรันในฐานแยกก่อน ย้อนตามลำดับ `supabase/rollback/20261101000000_member_recovery_lock_order.sql` → `20261031010000_optional_members.sql` → `20261031000000_item_payments.sql` สองรายการที่คืนโครงสร้างสมาชิก/การจ่ายมี transaction/lock และหยุดเมื่อมีข้อมูลสมาชิกหรือ receipt ใหม่แล้ว เพื่อไม่ลบประวัติจริง เมื่อ guard ผ่านจึงคืน schema และลบเฉพาะ migration history version ของตัวเองใน transaction เดียวกันให้กลับตรง schema การปรับนี้ไม่ใช่การลบประวัติการชำระเงินเพื่อฝืน guard

rollback ของ lock fix คืน definition รุ่นก่อนที่มี deadlock ดังนั้นใช้เฉพาะช่วง maintenance สำหรับย้อนครบชุด/ฐานแยก ไม่ควรถอน lock fix ตัวเดียวในระบบที่เปิดรับออเดอร์ ให้เลือก forward fix ตามปกติ ทดสอบการย้อนครบทั้งสามแล้วบน PostgreSQL แยก และข้อมูล/schema/RPC/grants/sequences/history เดิมกลับตรงก่อนฟีเจอร์

หากมีธุรกรรมใหม่แล้ว การ downgrade กลับโครงสร้างหนึ่ง payment ต่อ order ทำให้บางส่วน/หลาย order แสดงผิดได้ ห้ามฝืนลบข้อมูลเพื่อผ่าน guard ให้ใช้ forward fix หรือ restore ที่มีแผน reconcile ธุรกรรมหลังจุด backup และตรวจยอดโดยผู้ดูแลก่อน ห้ามนำโค้ดเก่ากลับรับเงินกับ schema ใหม่โดยไม่ตรวจความเข้ากันได้
