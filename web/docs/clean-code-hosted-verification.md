# ผล apply และทดสอบ Supabase จริง — 25 ตุลาคม 2026

ผู้ใช้อนุมัติให้ทำต่อจากรายงาน Clean Code: ทดสอบ recovery, apply เฉพาะ migration ที่ตรวจแล้ว และใช้ข้อมูล TEST แยกเพื่อทดสอบจริง โดยไม่ commit/push/deploy ตัวเว็บ

## Backup และ recovery ก่อน apply

- Backup: `.test-artifacts/catalog-backup-2026-10-25T15-48-23-385Z/` มี 21 ตารางและ 3 views พร้อม manifest/OpenAPI
- นิยาม schema ก่อน apply: `.test-artifacts/clean-code-apply-preflight-utf8.json`
- Baseline แถวข้อมูลเดิม/Auth fingerprints: `.test-artifacts/clean-code-before-apply.json`
- รัน `scripts/verify-clean-code-recovery.mjs` ตรวจ SHA-256 ครบ 24 ไฟล์ นำข้อมูลกลับใน PGlite ครบ 21 ตาราง/3 views และผ่าน constraints 107 รายการ รวมการลบแล้ว rollback เปรียบเทียบ columns/defaults, RLS และ grants ของ reviews ตลอดจนนิยามจริงและ EXECUTE grants ของ RPC ทั้งสอง
- หลักฐาน: `.test-artifacts/clean-code-recovery-proof.json`

การทดสอบนี้พิสูจน์การกู้ public data และวัตถุเป้าหมาย ไม่ใช่ full-instance restore: Auth ในฐานจำลองใช้เพียง ID placeholders สำหรับตรวจ FK ของ profiles ไม่ได้กู้ Auth/Storage, sequence state, defaults/grants/triggers ของทุกวัตถุเพื่อเปิดระบบจำลองทั้งชุด ไม่มี Docker/Podman สำหรับ full SQL dump และไม่ได้ลอง rollback บน production

## Apply สำเร็จ

CLI dry-run แสดงเฉพาะสองไฟล์นี้ และ `db push --linked --yes` ใช้สำเร็จโดยไม่ seed หรือเปลี่ยน roles:

1. `20261025160000_remove_unused_reviews.sql`
2. `20261025161000_remove_legacy_stock_rpcs.sql`

ตรวจฐานจริงด้วย `supabase/verify-clean-code-cleanup.sql` พบว่า `to_regclass('public.reviews')`, `to_regprocedure('public.deduct_ingredient_stock(jsonb)')` และ `to_regprocedure('public.process_order_stock(uuid,jsonb)')` เป็น NULL ทั้งหมด และ migration history มีทั้งสอง version

ตรวจ PostgREST จริงแล้ว reviews ตอบ `PGRST205` และทั้งสอง RPC ตอบ `PGRST202` ไม่ใช่เพียงการลบไฟล์ในเครื่อง

เปรียบเทียบนิยามก่อน–หลัง พบเฉพาะการลบที่ตั้งใจ: columns/constraints/grants/RLS ที่เหลือ, functions อีก 37 ตัวพร้อม ACL, policies, triggers, views, Realtime publication และ cron ไม่เปลี่ยน ประวัติ migration เดิม 26 รายการยังตรงทุก field เพิ่มใหม่เป็น 28 รายการ หลักฐาน `.test-artifacts/clean-code-metadata-verification.json`

## วิธีทดสอบฐานจริง

ใช้ `tests/hosted-clean-code.mjs` เปิด Next.js จากสำเนา source ใน `.test-artifacts/` ที่ localhost:4422 เชื่อม Supabase project เดิมจริง ไม่มี mock HTTP/WebSocket หรือ deploy เว็บ สร้างบัญชี TEST สำหรับ Admin/Staff/Kitchen และสร้าง category, ingredient, menu, table ของการทดสอบโดยใช้ prefix สุ่ม

ใช้ service role เพื่อสร้าง/ล้าง TEST accounts และเตรียม category ที่ RLS เดิมไม่อนุญาตให้ผู้ใช้เพิ่ม ส่วน Admin สร้าง ingredient/menu/table ผ่าน RPC เดิมของผู้ใช้จริง Staff รับใช้/ชำระเงินผ่านหน้าจอจริงและ RPC ส่วน Kitchen เริ่มทำ/ทำเสร็จด้วย authenticated RPC เดิม

ทุกออเดอร์ใช้เมนูและวัตถุดิบของ TEST เท่านั้น ไม่กดเปลี่ยนออเดอร์เดิม ก่อนทดสอบ FCFS ตรวจว่าคิวเดิมไม่มี confirmed/preparing และตรวจซ้ำก่อนเริ่มครัว บันทึก request/IDs ก่อนล้างข้อมูล เปรียบเทียบแถวข้อมูลเดิมทั้ง 23 ตาราง/views และ Auth เดิมกับ baseline หลังแต่ละช่วง

## ผลการทดสอบ

รอบสำเร็จ: `TEST-clean-cf3ac264d2` หลักฐานอยู่ใน `.test-artifacts/clean-code-hosted/TEST-clean-cf3ac264d2/` ผล `checks: 13`, `errors: 0`, `cleaned: true`

| ตรวจบน Supabase จริง | ผล |
| --- | --- |
| Admin / Staff / Kitchen | Login จริงและตรวจ 11 dashboard routes ต่อบทบาท ผ่านทั้งหน้าอนุญาต 200 และหน้าต้องห้าม 403 |
| สิทธิ์ RPC | Staff/Kitchen แก้ ingredient ไม่ได้, Admin/Staff เริ่มครัวไม่ได้, Admin/Kitchen เสิร์ฟ/รับเงินไม่ได้, anon เสิร์ฟไม่ได้ |
| สั่งอาหาร | API จริงสร้าง TEST orders, คำนวณราคา 37 บาท/จานจากข้อมูล server, ตัดวัตถุดิบ 2 หน่วย/จานตามสูตร |
| FCFS | สั่งสองบิล ปฏิเสธเริ่มบิลที่สองก่อนบิลแรก เมื่อทำเสร็จครบทุกจานแล้วจึงเริ่มบิลถัดไปได้ แม้บิลแรกยังไม่รับเงิน |
| ทำเสร็จรายจาน | ปฏิเสธการบังคับ ready เมื่อยังทำไม่ครบ ปฏิเสธเสิร์ฟจานที่ยังไม่เสร็จ เมื่อครบจานเปลี่ยนเป็น ready อัตโนมัติ |
| เสิร์ฟรายจาน | Staff กดปุ่มบนเว็บจริง จานแรกเสิร์ฟได้ขณะออเดอร์ยัง preparing; retry จานเดิมไม่เพิ่ม audit/ไม่เสิร์ฟจานอื่น; ครบทุกจานจึงเป็น served |
| รับเงิน | เงินสดผ่านปุ่มบนเว็บจริง 74 บาทสำหรับสองจาน; กลับบ้าน/QR ผ่าน authenticated RPC จริง 37 บาทต่อบิล; ไม่หักสต็อกซ้ำและปฏิเสธชำระซ้ำ/ชำระก่อน served |
| ยกเลิก | API จริงปฏิเสธ Admin/Kitchen, Staff ยกเลิกได้และคืนสต็อก 4 หน่วย; retry ตอบ 409 ไม่คืนซ้ำ |
| สต็อกไม่พอ | ขอ 100 จาน ตอบ 409 และยอดสต็อกเดิมไม่เปลี่ยน |
| Realtime จริง | SDK แบบ filter UPDATE ได้ 6 callbacks, wildcard SDK ได้ 6 callbacks, browser ได้ 32 postgres_changes frames; private customer stream มี ready/change จริง |
| หน้าเว็บติดตามสถานะ | ผ่านด้วย Realtime ร่วมกับ polling ตามค่าปกติของแอป ไม่ mock response หรือ socket |
| รีเซ็ตสต็อกจริง | Admin ตั้ง daily schedule ให้ TEST ingredient ผ่าน RPC เดิม รอ cron เดิมถึง `2026-10-25T16:05:00Z` (23:05 น. ไทย) ขณะปิด browser ยอดพร้อมใช้ 6 เป็น 0 โดย usage 4 หน่วยของบิลรอชำระยังอยู่ จากนั้นเติม 7 หน่วย ปิด schedule และจ่ายเงินแล้วคงเหลือ 7 |
| stale form | expected_updated_at เก่าถูกปฏิเสธด้วย INGREDIENT_CHANGED |
| เวลาไทย/interval | เรียก helper บนฐานจริงตรวจ 3 กรณี ได้แก่ ก่อน/ตรงเที่ยงคืนไทย และรอบ 3 วัน ผ่าน 3/3 หลักฐาน `.test-artifacts/clean-code-hosted-cadence.json` |

## ข้อมูลเดิมและการล้าง TEST

รอบสำเร็จสร้างบัญชี TEST 3 บัญชีและออเดอร์ TEST 4 บิล ใช้วัตถุดิบ/สูตร/เมนู/หมวด/โต๊ะของตัวเอง ทุกบิลถูกล้างพร้อม items, options, plate audit, payments, usages และ sessions จากนั้นล้าง recipe/menu/ingredient/category/table/aliases และบัญชี TEST ตาม IDs ที่บันทึกไว้ ตรวจชื่อ/โต๊ะของทรัพยากรก่อนลบ

`registry.cleaned=true` และ `after-cleanup.json` ยืนยันว่าแถวเดิมทั้ง 23 ตาราง/views มี hashes เท่า baseline ก่อน migration (ยกเว้น reviews ว่างที่ตั้งใจลบ) ออเดอร์เดิมยัง 97 บิล และ Auth เดิมยัง 4 บัญชีพร้อม fingerprint เดิม ไม่พบแถวเดิมถูกเปลี่ยนจากการทดสอบ ไม่มีการปรับข้อมูลเดิมเพื่อทำให้ fingerprint ผ่าน

การสร้างออเดอร์จริงใช้ sequence/เลขลำดับจริง จึงมีเลขที่ถูกใช้แล้วจาก TEST และไม่ได้ย้อน sequence เพื่อปิดช่องว่าง เพราะการย้อนอาจชนข้อมูลหรือการใช้งานพร้อมกัน ผลเทียบ hashes ไม่ครอบคลุม sequence state

มีการหยุด/แก้ test harness ก่อนรอบสำเร็จ เช่น ตัวกรอง view ก่อนมี TEST menu ID และการเตรียม category ที่ RLS เดิมเป็น read-only แก้เฉพาะ test setup ไม่เปลี่ยน policy แอป แต่ละรอบล้าง TEST resources และตรวจข้อมูลเดิมอีกครั้ง หลักฐานรอบก่อนหน้าเก็บใน `.test-artifacts/clean-code-hosted/` โดยไม่ลบทิ้ง

## ข้อจำกัดและผลติดตาม

- ข้อจำกัด push-only ของรอบนี้ **ตรวจพบสาเหตุและแก้แล้วในรอบติดตาม**: ต้องรอ Auth ก่อน subscribe จึงจะ join ด้วย JWT ของ Staff การทดสอบใหม่แยก push-only, polling-only, offline/reconnect และเปิด browser ใหม่ผ่าน ดู [หลักฐานและวิธีคืนระบบ](realtime-recovery-and-restore.md)
- ผล 13 checks ในเอกสารนี้เป็นหลักฐานก่อนแก้ Auth รอบติดตามใช้ `TEST-clean-8e7fa4bddd` ผ่าน 14 checks โดยตรวจ UPDATE frames และค่าบน UI จริง ไม่อาศัย polling กลบกรณี push-only
- ใช้เว็บ localhost เชื่อม hosted Supabase จริง ไม่ได้ deploy หรือทดสอบบน URL เว็บ production
- QR เป็นการบันทึกวิธีชำระเงินของระบบ ไม่ได้มีการโอนเงินจริงหรือทดสอบธนาคาร/payment gateway
- รอ cron daily จริงหนึ่งรอบสำหรับ TEST ingredient; รอบหลายวันตรวจสูตรคำนวณบนฐานจริง ไม่ได้รอหลายวันหรือทดสอบทุกเวลา/ทุกเมนู/ทุกชุดตัวเลือก รวมถึงไม่ได้ทำ concurrent load/stress test บน production
- Recovery เป็นการทดสอบใน PGlite จากข้อมูลจริง ไม่ใช่การสั่ง rollback หรือ full-instance restore บน hosted Supabase

## Checks ในเครื่องหลัง apply

- Unit/API/SQL tests: **90/90 ผ่าน**
- ESLint: **0 errors**, warnings เดิม 4 จุด (img 2 จุด, destructuring ใน test 2 จุด)
- Typecheck: **ผ่าน**
- Production build: **ผ่าน**
- ไม่มี commit/push เพิ่ม HEAD และ upstream ยังเป็น `e84161d5d80691a94dcbe7c8143d5adca67b742c` ไม่ deploy ตัวเว็บ และไม่แก้ migration เก่า

หลังแก้ Realtime เพิ่ม regression tests 2 กรณี ผลล่าสุดเป็น **92/92 tests ผ่าน** และ checks อื่นยังผ่านตาม [รายงานติดตาม](realtime-recovery-and-restore.md)
