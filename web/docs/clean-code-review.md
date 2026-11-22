# บันทึกตรวจ Clean Code — 25 ตุลาคม 2026

## จุดสำรองก่อนเริ่ม

- Branch: `feature/remove-option-groups-user-identity`
- Commit: `e84161d5d80691a94dcbe7c8143d5adca67b742c`
- Push ขึ้น origin สำเร็จก่อนเริ่มแก้โค้ด ไม่รวม `.env.local`
- รอบติดตามผู้ใช้อนุมัติให้ apply migration ลบ reviews/RPC เก่าแล้ว ทำสำเร็จทั้ง 2 migrations โดยยังไม่มี commit, push หรือ deploy ตัวเว็บเพิ่ม ดู [ผลทดสอบฐานจริง](clean-code-hosted-verification.md)
- รอบติดตาม Realtime พบ subscription เริ่มก่อน Auth พร้อม แก้ให้รอ Auth แล้วทดสอบ push/polling แยกกัน, หลุด/เชื่อมต่อใหม่ และปิด/เปิด browser ผ่านครบ ดู [ผลล่าสุดพร้อมรายการลบจริงและวิธีคืนระบบ](realtime-recovery-and-restore.md)

## สิ่งที่ปรับ

| ส่วน | การปรับและเหตุผล |
| --- | --- |
| `src/lib/order-views.ts` | ลบ currentOrderFilters, historyOrderFilters และ visibleFilters ที่ไม่มีผู้ใช้งานค่าแล้ว รายการแท็บจริงอยู่ใน OrderStatusTabs จึงไม่มีผลต่อหน้าจอ |
| `src/lib/plate-progress.ts` | แยกชื่อชุดจานเสร็จ/เสิร์ฟ และเงื่อนไขสถานะบางส่วน อ่านลำดับกรองและเรียงจานได้ตรงไปตรงมา |
| `src/components/plate-progress.tsx` | คำนวณจำนวนจานแต่ละสถานะครั้งเดียวแทนการเรียก pendingPlates และนับซ้ำใน JSX ข้อความและ class เดิม |
| `src/lib/ingredient-reset.ts` | แยก validDays, validStart, validTime โดยรักษากฎวันที่จริง เวลา และช่วงวัน 1–3650 รวมข้อความผิดพลาดเดิม |
| หน้าเพิ่ม/แก้วัตถุดิบ | ระบุชนิดข้อมูล reset แยกการอ่าน/จัดการข้อผิดพลาดและ RPC parameters ตั้งชื่อ stockChanged เพื่ออธิบายว่าการแก้ metadata ไม่เขียนทับสต็อกใหม่ |
| หน้าครัว | เปลี่ยน first/preparing เป็น firstPendingOrder/hasPreparingOrder เพื่อสื่อเงื่อนไข FCFS โดยไม่เปลี่ยนการเรียงหรือสิทธิ์ |
| `scripts/catalog-backup.mjs` | ค้นหาทุกตาราง/view ที่เปิดใน OpenAPI และเลือกคอลัมน์เรียงตาม primary key แทนรายชื่อกำหนดตายตัว รวมตารางที่เคยตกหล่นและรองรับการเลิกใช้ reviews |
| Browser/hosted audit harness เดิม 5 ไฟล์ | เอา reviews ออกจากรายชื่อตารางประกอบการทดสอบ workflow เพื่อรองรับ schema หลัง migration ส่วนสคริปต์สำรองยังเก็บ reviews ตราบที่ตารางมีอยู่ |
| Dashboard browser regression | เปลี่ยน test เก่าที่รอปุ่ม ready ให้ทำเสร็จด้วย checkbox รายจานตามระบบปัจจุบัน และให้ default fixture จำลองการทำเสร็จหนึ่งจาน ตรวจจำนวน RPC และสถานะ ready หลังบันทึก แยกนับการอ่านรายการกับ sidebar workload และตรวจตัวตนของ workload ตามการทำงานปัจจุบัน |
| README | แทนข้อความเริ่มต้นของ Next.js ด้วยวิธีเริ่มระบบ แผนที่โค้ดสำหรับนำเสนอ คำสั่งทดสอบ และขอบเขตข้อมูลสำรอง |

ตรวจ imports ของ source modules แล้วไม่พบไฟล์นอก route/proxy ที่ไม่มีผู้เรียกใช้ และไม่พบ exported symbol ใน lib ที่ปรากฏเพียงตอนประกาศ Dependencies ปัจจุบันมีผู้ใช้งานใน runtime, build หรือ tests จึงไม่ลบ package โดยคาดเดา เช่น qrcode ใช้โดย TableQRCode, PGlite ใช้ทดสอบ SQL และ Playwright ใช้ browser tests

เก็บ migration เก่า เอกสารตรวจย้อนหลัง fixtures และ tests ที่จำเป็นไว้ กลุ่มตัวเลือกเมนูยังมีทั้ง customer catalog และ order API ใช้งาน จึงไม่ลบตารางหรือโค้ดกลุ่มตัวเลือก

## สำรองและตรวจ Supabase

ข้อมูลสำรองก่อน apply ล่าสุดอยู่ใน `.test-artifacts/catalog-backup-2026-10-25T15-48-23-385Z/` ครอบคลุม 21 ตารางและ 3 views ที่เปิดผ่าน PostgREST รวม order_plate_services และ restaurant_table_aliases ตรวจจำนวนแถวและ SHA-256 ของทั้ง 24 ไฟล์กับ manifest แล้ว และทดสอบนำกลับเข้า PGlite ได้ครบ 21 ตาราง/3 views พร้อมตรวจ constraints 107 รายการ ไฟล์อยู่ภายใต้ Git ignore

ก่อนหน้านั้นมีข้อมูลสำรอง 19 ตารางที่ `.test-artifacts/catalog-backup-2026-10-25T15-06-45-784Z/` ไม่ใช้ชุดแรกอ้างว่าครบทั้งฐานข้อมูล

นิยามจากฐานข้อมูลจริงเก็บแยกใน `.test-artifacts/clean-code-schema-before.json` และ `clean-code-schema-final.json`: 39 functions ใน public, 42 policies, 12 triggers, 107 constraints, 166 columns, 3 views, grants, RLS, publication และ history 26 migrations เปรียบเทียบ sections เดิมก่อน/หลังแล้วไม่เปลี่ยน มีการตรวจ function อ้าง reviews ใน schema อื่นเพิ่มเติม ไม่พบรายการอ้าง และ Supabase ไม่มี deployed Edge Functions

ข้อมูลสำรอง JSON/OpenAPI และ catalog definitions ไม่ใช่ full PostgreSQL dump ไม่รวม Auth/Storage และ schema ที่ไม่เปิดผ่าน PostgREST ลอง SQL dump แล้วไม่สำเร็จเพราะเครื่องไม่มี Docker/Podman ทดสอบกู้คืน public data และ rollback ของวัตถุที่จะลบในฐานข้อมูลจำลองก่อน apply จริง ไม่ได้ทำ rollback บน production

### สถานะ reviews

ตารางจริงมี 0 แถว ไม่มี application/API/RPC caller ใน source ไม่มี function อ้างใน schema ที่ไม่ใช่ระบบ ไม่มี policy, trigger, view, publication membership หรือ incoming FK พบเฉพาะชนิดข้อมูล/default/constraint ของตารางเอง รวม FK จาก reviews ไป orders

Migration `20261025160000_remove_unused_reviews.sql` **apply บน Supabase จริงแล้ว** ตามคำสั่งติดตาม ตรวจทั้ง catalog และ PostgREST แล้วไม่พบ reviews ตารางว่างจึงไม่มีแถวข้อมูลถูกลบ

Migration ใช้ transaction และ lock ตรวจว่าไม่มีข้อมูลใหม่ ไม่มี function อ้าง ไม่มี policy/trigger/publication เพิ่ม แล้ว `DROP TABLE ... RESTRICT` โดยไม่ใช้ CASCADE หากมี view หรือ incoming FK ใหม่จะหยุด Rollback อยู่ที่ `supabase/rollback/20261025160000_restore_reviews.sql` สำหรับสร้างตารางว่างตาม columns, constraints, grants, owner และ RLS ที่ตรวจพบเดิม ไม่เขียนทับตารางที่มีอยู่ ไม่แก้ migration เก่า

ก่อนนำ migration ไปใช้จริงต้องสร้าง backup ใหม่และตรวจ drift อีกครั้ง ข้อมูลสำรองรอบนี้ไม่รับรองข้อมูลที่เพิ่มภายหลัง

### RPC สต็อกเก่าที่ไม่มีผู้เรียก

ตรวจพบ `deduct_ingredient_stock(jsonb)` และ `process_order_stock(uuid,jsonb)` ไม่มีผู้เรียกใน source ปัจจุบัน ไม่มี function อื่นใน schema ที่ไม่ใช่ระบบอ้าง ไม่มี pg_depend ผูกเข้ามา และไม่มี cron เรียก API ปัจจุบันใช้ `create_order_with_stock` ซึ่งมี transaction และ guards ของระบบปัจจุบัน ไม่ได้เรียกสอง RPC เก่า

Migration `20261025161000_remove_legacy_stock_rpcs.sql` **apply บน Supabase จริงแล้ว** พร้อม rollback `supabase/rollback/20261025161000_restore_legacy_stock_rpcs.sql` จากนิยามจริงและ EXECUTE grants เดิม Migration ตรวจ function/cron references ซ้ำและใช้ DROP FUNCTION RESTRICT ทดสอบลบ/คืน definitions และ grants รวมกรณีมี caller/cron ใหม่แล้ว ตรวจ catalog และ PostgREST ยืนยันว่าทั้งสอง RPC หายไปจริง

เก็บ `handle_new_user` เพราะเป็นงาน Auth, `valid_plate_numbers` เพราะใช้ใน constraints และ `run_ingredient_stock_resets` เพราะ cron เรียก การไม่พบชื่อใน application imports จึงไม่เพียงพอสำหรับการลบ function

## ผลตรวจ

ตารางต่อไปนี้เป็นผลรอบแรกก่อน apply ส่วนการทดสอบบน Supabase จริงหลัง apply ดู [รายงานติดตาม](clean-code-hosted-verification.md)

| การตรวจ | ผล |
| --- | --- |
| `node --test tests/*.test.mjs` | 90/90 ผ่าน รวม API, SQL, สต็อก, ยกเลิก/คืนสต็อก, FCFS, รายจาน, เงินสด/QR, roles และ reset |
| Migration/rollback reviews | ผ่านใน PGlite: ลบ/คืนตาราง, columns/RLS, เก็บ orders เดิม, ปฏิเสธเมื่อมีข้อมูล, view, incoming FK, PL/pgSQL caller หรือ policy |
| Migration/rollback legacy stock RPCs | ผ่านใน PGlite: definitions/EXECUTE grants คืนเหมือนเดิม และปฏิเสธ function/cron caller ใหม่ |
| `npm run lint` | 0 errors; warning เดิม 4 จุด: img 2 จุด และ test destructuring 2 จุด |
| `npx --no-install tsc --noEmit` | ผ่าน |
| `npm run build` | ผ่าน |
| Browser customer cart | ผ่าน: Admin link, session/token, retry, หลายแท็บ, ตัวเลือกอาหาร และ mobile/desktop |
| Browser served orders | ผ่าน: ทานที่ร้าน/กลับบ้านใน fixture, รายจาน, FCFS, หลาย terminal, จ่ายต่อบิล, เงินสด/QR, double click, badges/toast, Realtime/polling, navigation |
| Browser stock-reset suite | ผ่าน: none/daily/interval, เวลาไทย, mobile, save/reload, metadata-only, stale form และสิทธิ์ |
| Browser dashboard roles/recovery | ผ่าน: 10 routes ของทั้ง 3 บทบาท, retry เมื่อ query/profile/write ล้มเหลว, เปลี่ยน role/ปิดบัญชีแล้ว 403, รายจานครัว, event ระหว่างโหลด, socket ขาด/polling และ Server Action double submit |
| Supabase guards จริง | Admin, Staff, Kitchen ผ่าน โดยใช้ order ID ว่างและ rollback transaction ไม่เปลี่ยนออเดอร์จริง |
| Supabase cron จริง | pg_cron 1.6.4, งาน smart-order-ingredient-stock-reset active ทุกนาที, 3 รอบล่าสุด succeeded; วัตถุดิบ 1 รายการตั้งเวลา อีก 10 รายการยกยอด |

Browser fixture ทดสอบ UI/HTTP/WebSocket และ PGlite ทดสอบ SQL แยกจาก Supabase hosted ไม่ได้สั่งอาหาร รับเงินจริง หรือทดสอบ Realtime hosted แบบ end-to-end รอบนี้ ไม่ได้รอให้วัตถุดิบจริงถึงรอบรีเซ็ตแล้วสังเกตยอดเปลี่ยน ใช้ผล cron จริงประกอบการทดสอบ cadence/refill/stock/authorization ในฐานข้อมูลจำลอง

ขอบเขตการตรวจครอบคลุม imports และ dependencies ทั้ง source, tests, scripts พร้อมนิยามฐานข้อมูลที่กล่าวข้างต้น แต่ไม่ได้ทดสอบทุกเมนู/ทุกชุดตัวเลือกบน production หรือรับรอง caller จากระบบภายนอก repository นี้
