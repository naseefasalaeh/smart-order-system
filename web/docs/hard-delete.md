# Admin Hard Delete — 15 กันยายน 2026

ทำต่อบน `feature/catalog-redesign` โดยเก็บงาน Catalog redesign เดิมไว้ ยังไม่ commit/push

## พฤติกรรมใหม่

- ปุ่มลบเมนูและวัตถุดิบแสดงเฉพาะ Admin และต้องพิมพ์ชื่อให้ตรงในหน้าต่างยืนยัน ไม่มีโหมด Archive ใน action หรือ RPC อีกต่อไป
- ลบเมนูจริงจาก `menus` พร้อมสูตรพื้นฐาน กลุ่ม ตัวเลือก สูตรตัวเลือก และลิงก์ Add-on ของเมนู; Add-on กลางยังอยู่
- ลบวัตถุดิบจริงจาก `ingredients` และความสัมพันธ์ใน `menu_ingredients`, `menu_option_ingredients`, `addon_ingredients`
- เมนู/ตัวเลือก/Add-on ที่สูตรเสียจากการลบวัตถุดิบจะถูกปิดขายจน Admin ตรวจสูตรและเปิดใหม่ นี่ไม่ใช่การเก็บวัตถุดิบที่ลบเป็น Soft Delete
- `orders`, `order_items`, `order_item_options`, `payments` และประวัติการใช้วัตถุดิบไม่ถูกลบ; FK ของประวัติเปลี่ยนเป็น NULL พร้อมเก็บ snapshot เดิม
- วัตถุดิบที่มี usage ในออเดอร์หักสต็อกและยังไม่ completed/cancelled จะถูกบล็อก รวม ready/served เพื่อไม่ทิ้งออเดอร์ที่ยังดำเนินการ
- ถ้ามีออเดอร์เก่าหักสต็อกแต่ไม่มี usage records จะบล็อกการลบวัตถุดิบไว้ก่อน เพราะพิสูจน์วัตถุดิบที่ใช้ไม่ได้ ต้องจัดการออเดอร์นั้นก่อน

## Snapshot และสิทธิ์

- `order_items`: `menu_id_snapshot`, `menu_name_snapshot`, `menu_price_snapshot` (ราคาต่อจานที่เรียกเก็บจริง รวมตัวเลือก ตรงกับ `unit_price`)
- `order_item_options`: เก็บ `option_name`, `additional_price`, `quantity` เดิม และเพิ่ม `menu_option_id_snapshot`
- `order_ingredient_usages`: เพิ่ม `ingredient_id_snapshot`, `ingredient_name_snapshot`, `ingredient_unit_snapshot`; `quantity_used` เดิมยังอยู่
- Backfill ประวัติก่อนใช้ FK ใหม่ และ trigger เก็บ snapshot สำหรับการสั่งครั้งถัดไป; การแก้ชื่อเมนูหรือ snapshot ภายหลังไม่เปลี่ยน snapshot ที่บันทึกแล้ว
- ชื่อของรายการเก่าที่ไม่เคยมี snapshot ใช้ชื่อ ณ วัน migration ไม่สามารถย้อนหาชื่อก่อนถูกแก้ในอดีตได้; ราคาที่บันทึกใช้ยอดที่เรียกเก็บจริง ไม่ใช่ราคาปัจจุบัน
- `is_catalog_admin()` อ่าน `profiles.role` ภายในฐานข้อมูล ไม่เชื่อ user metadata; revoke สิทธิ์ให้ผู้ใช้แก้ profile role เองและ revoke direct DELETE/TRUNCATE บนเมนู/วัตถุดิบ
- RPC `delete_catalog_item_safely(text,bigint,text)` เป็น SECURITY DEFINER แต่ตรวจ authenticated + Admin; signature เก่าที่รับ `p_archive` ถูกถอด
- ตามการยืนยันของผู้ใช้ เปลี่ยน `staff@example.com` จาก staff เป็น admin แล้ว โดยไม่เปลี่ยนรหัสผ่านหรือข้อมูลอื่น

## Migration และข้อมูลจริง

รัน `supabase/migrations/20260915010000_admin_hard_delete_snapshots.sql` แล้ว เป็น transaction พร้อม timeout, backup และการตรวจความเท่ากันของประวัติก่อน commit transaction ไม่มีคำสั่งล้างเมนู/วัตถุดิบร้านใน migration

- สำรองก่อน migration: `.test-artifacts/catalog-backup-2026-09-14T17-15-16-240Z/` พร้อม SHA-256 และ schema OpenAPI (Git ignore)
- สำรองภายใน DB: `catalog_backup.before_hard_delete` ไม่เปิดให้ anon/authenticated อ่าน
- ทุกการลบผ่าน RPC เก็บ snapshot ของ catalog/recipe ก่อนลบไว้ใน `catalog_backup.hard_delete_events` พร้อมผู้ลบและเวลา
- Lock ลำดับ catalog → orders → ingredients เพื่อไม่ให้ order ใหม่แทรกหลังตรวจ usage และก่อนลบ การลบ rollback ทั้งชุดเมื่อผิดพลาด
- CASCADE ใหม่อยู่เฉพาะความสัมพันธ์สูตร; FK ของ order history ใช้ SET NULL ไม่มี CASCADE จาก catalog ไปยังประวัติ
- ตรวจหลัง migration และ cleanup: ข้อมูลเดิมครบ 17 ตารางตรงกับสำรองเมื่อไม่นับคอลัมน์ snapshot ที่เพิ่ม; snapshot ครบทุกแถวที่ต้องมี

## ผลทดสอบ

- Local tests: `node --test tests/catalog-deletion.test.mjs tests/catalog-redesign.test.mjs tests/hard-delete.test.mjs` ผ่าน 36/36
- ครอบคลุม role/Admin, self-promotion ถูกปฏิเสธ, direct DELETE ถูกปฏิเสธ, active/ready order block, ลบจริงพร้อมประวัติครบ, cancel หลังลบเมนู, ลบวัตถุดิบหลังคืนสต็อก, ประวัติ completed, ปิดขายสูตรที่ขาด, snapshot ไม่เปลี่ยนตามการแก้ชื่อ, เมนูที่เหลือหัก–คืน stock ถูกต้อง
- Browser จริง: staff ไม่มีปุ่มและเรียก RPC ไม่ได้; Admin ลบเมนูจริง; Orders/Kitchen/หน้าลูกค้าแสดงชื่อจาก snapshot; Reports โหลดได้; วัตถุดิบถูกบล็อกก่อนยกเลิกและลบได้หลังยกเลิก; ประวัติชื่อ/ราคา/ตัวเลือก/usage ยังครบ; เมนูอีกจานสั่งทะเลและคืน stock ได้
- ทดสอบเฉพาะข้อมูล TEST ที่ลงทะเบียนไว้ ล้างทั้งข้อมูล บัญชี และ audit events ของชุดทดสอบแล้ว; fingerprint 19 ตารางตรงก่อน/หลัง ไม่มี TEST ค้าง
- Browser เริ่มแรกเชื่อม localhost ไม่ได้เพราะ dev server หยุดอยู่ เปิดเซิร์ฟเวอร์แล้วทดสอบครบ ไม่มี browser page error ในรอบที่ผ่าน
- ESLint, TypeScript และ production build ผ่าน; ESLint มี 2 warnings เดิมเกี่ยวกับ `<img>`
- ชุดทดสอบ SQL การลบเดิมยังทดสอบ baseline migration ปี 2026-09-09; พฤติกรรมปัจจุบันทดสอบใน `hard-delete.test.mjs` และ `browser-hard-delete.mjs` ไม่ใช้ browser suite เก่าที่คาดหวัง Archive

## ไฟล์หลักที่เพิ่ม/ปรับ

- Migration ใหม่ข้างต้น; `src/app/dashboard/catalog-delete-actions.ts`, `src/lib/catalog-deletion.ts`, `src/components/catalog-delete-button.tsx`
- ปุ่มตามสิทธิ์: `src/app/dashboard/menus/page.tsx`, `src/app/dashboard/ingredients/{page.tsx,IngredientsClient.tsx}`
- อ่านชื่อ snapshot: `src/app/dashboard/{orders,kitchen,reports}/page.tsx`, `src/app/api/customer-orders/route.ts`, `src/app/table/[tableId]/orders/CustomerOrdersClient.tsx`
- Tests: `tests/hard-delete.test.mjs`, `tests/browser-hard-delete.mjs`, `tests/catalog-deletion.test.mjs`, helper ใน `tests/browser-catalog-redesign.mjs`, script ใน `package.json`
- เครื่องมือ: `scripts/catalog-backup.mjs` เพิ่ม Add-on ใน backup, `scripts/set-catalog-admin.mjs`, `scripts/verify-hard-delete.mjs`

## สิ่งที่ผู้ใช้ควรตรวจใน Browser

1. เข้าระบบ `staff@example.com` แล้วตรวจปุ่มลบที่หน้าเมนูและวัตถุดิบ
2. ใช้เมนูทดลองที่ตั้งใจลบ สั่งและรับเงินให้จบก่อน แล้วลบเมนู ตรวจประวัติว่าชื่อ ราคา และตัวเลือกยังอยู่
3. สร้างออเดอร์อีกใบที่ใช้วัตถุดิบทดลอง ตรวจว่าลบวัตถุดิบไม่ได้และมีหมายเลขออเดอร์แจ้งเตือน
4. ยกเลิกออเดอร์ ตรวจยอดคืน แล้วลบวัตถุดิบ ตรวจว่านำออกจากทุกสูตรและประวัติยังอยู่
5. แก้สูตรเมนู/ตัวเลือกที่ถูกปิดขายก่อนเปิดใหม่ แล้วลองสั่งเมนูที่เหลือและตรวจ stock

การลบจริงไม่มีปุ่ม undo; backup เป็นข้อมูลกู้คืนสำหรับผู้ดูแลฐานข้อมูล ไม่ใช่ Archive ใน catalog และยังไม่ได้ทดสอบโหลดสูง/หลาย PostgreSQL sessions พร้อมกัน
