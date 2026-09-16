# Catalog redesign — ส่งมอบ 14 กันยายน 2026

> พฤติกรรมการลบและสิทธิ์ Admin ถูกปรับเพิ่มเติมวันที่ 15 กันยายน ดู [Admin Hard Delete](hard-delete.md) สำหรับสถานะล่าสุด

Branch: `feature/catalog-redesign` จาก checkpoint `2985fbd20542faf3e1bf2dd6d77a0811886b863e` บน `project-structure` ยังไม่ commit หรือ push งานชุดนี้

## สิ่งที่ทำเสร็จ

- เมนูใหม่ 11 รายการ: อาหารจานเดียว 6 และกับข้าว 5 พร้อมสูตรพื้นฐานและกลุ่มเนื้อสัตว์บังคับเลือก ไก่/เนื้อ/ทะเล
- ต่อจาก `menu_option_groups` และ `menu_options` เดิม เพิ่ม `kind` เพื่อแยกเนื้อสัตว์ ตัวเลือกทั่วไป และ Add-on
- Add-on กลางอยู่ใน `addons` และสูตรใน `addon_ingredients`; `menu_options.addon_id` เป็นลิงก์อนุญาตต่อเมนู ไม่คัดลอกสูตรหรือราคากลาง
- views `effective_menu_options` / `effective_menu_option_ingredients` คืนค่ากลางล่าสุดให้หน้าเมนูและ API; ประวัติยังใช้ `order_item_options` และ snapshots เดิม
- `/dashboard/addons` จัดการชื่อ ราคา สูตร จำนวนสูงสุด และเปิด/ปิด; หน้าเพิ่ม/แก้เมนูมี checkbox และ modal สร้าง Add-on กลางโดยไม่ออกจากหน้า
- การบันทึกข้อมูลเมนูพร้อมลิงก์ Add-on และการบันทึก Add-on พร้อมสูตรเป็น RPC แบบ atomic; เอาเครื่องหมายถูกออกแล้วปิดลิงก์ ไม่ลบ ID ที่เคยถูกสั่ง
- ลูกค้าเลือกทานที่ร้าน/กลับบ้านระดับออเดอร์; `orders.dining_type` แสดงในหน้าลูกค้า Orders และ Kitchen
- ฐานข้อมูลตรวจราคากับตัวเลือกซ้ำ และคำนวณสูตรใหม่ภายในธุรกรรมก่อนหักสต็อก; API คำนวณเงินเป็นสตางค์เพื่อเลี่ยงทศนิยมคลาดเคลื่อน
- แก้ QR หลังบ้านให้ใช้ `table_number` ตรงกับ route ลูกค้า พร้อมปุ่มกรองหมวดอาหาร

## Migration ที่นำไปใช้แล้ว

| ไฟล์ | เนื้อหา |
|---|---|
| `20260914170000_shared_addons.sql` | ตาราง/สูตรกลาง, RLS, FK, effective views, order dining type, RPC บันทึกและตรวจราคา/สูตร, ขยาย safe deletion ให้รู้จักสูตร Add-on |
| `20260914171000_seed_catalog_redesign.sql` | สำรองก่อนล้างข้อมูลจำลองที่ไม่มีอ้างอิง, ปิดขายเมนูเก่าที่มีประวัติ, สร้าง 11 เมนูพร้อมสูตรและตัวเลือก |

ทั้งสองไฟล์มี `begin/commit`, lock timeout และ statement timeout; timestamp ไม่ซ้ำกับ migrations เดิม และ remote history ตรงกับ local ทั้ง 8 รายการ ไม่มี migration ค้าง

## การเก็บข้อมูลเดิมและสำรอง

- อ่าน schema, constraints, policies, views, trigger ตัด/คืนสต็อกและ RPC รับเงินจากฐานข้อมูลจริงก่อนแก้
- ก่อนเริ่มพบ orders 65, order_items 69, order_item_options 34, usages 118 และ payments 47; มี confirmed 1 ออเดอร์ จึงไม่ล้างประวัติหรือสูตรที่อ้างอิง
- สำรอง JSON พร้อม SHA-256 ใน `.test-artifacts/catalog-backup-2026-09-14T16-24-55-042Z/` ซึ่ง Git ignore
- migration เก็บสำรอง 14 ตารางอีกชั้นใน schema ส่วนตัว `catalog_backup.before_redesign` ภายใต้ lock และตรวจว่าประวัติไม่เปลี่ยนก่อน commit transaction
- เมนูเก่าที่มีประวัติเก็บชื่อ ราคา และสูตรเดิมไว้ ปิดขายเท่านั้น; วัตถุดิบที่มีสูตร/ประวัติอ้างอิงเก็บทั้งแถวและยอดคงเหลือเดิม
- ผลตรวจหลัง migration: 11 เมนูใหม่, Add-on 4 รายการ, สูตรพื้นฐานที่ขาด 0, ประวัติ/ชื่อเมนูเก่า/วัตถุดิบที่คงไว้ตรงกับสำรอง
- Browser ใช้ข้อมูล TEST และบัญชีเฉพาะชุด ล้างเสร็จแล้ว; ตรวจซ้ำไม่พบชื่อ TEST ใน catalog, tables, orders, profiles หรือบัญชี Auth และ fingerprint ทั้ง 19 ตารางตรงกับหลัง cleanup
- Fingerprint ครอบคลุมแถวข้อมูล ไม่ครอบคลุม sequence counters ที่การสร้างข้อมูลทดสอบใช้ไป

## ไฟล์ที่เปลี่ยน (จัดกลุ่ม)

- UI ใหม่: `src/app/dashboard/addons/{page.tsx,actions.ts}`, `src/components/{addon-editor.tsx,menu-addon-picker.tsx}`
- เพิ่ม/แก้เมนู: `src/app/dashboard/menus/new/page.tsx`, `src/app/dashboard/menus/[id]/edit/{page.tsx,actions.ts,OptionGroupsEditor.tsx}`
- สั่งอาหาร: `src/lib/customer-menu-catalog.ts`, `src/app/api/orders/route.ts`, `src/app/api/customer-orders/route.ts`, `src/app/table/[tableId]/{MenuClient.tsx,orders/CustomerOrdersClient.tsx}`
- หลังบ้าน: หน้า `dashboard`, `orders`, `kitchen`, `menus`, `ingredients`, `reports`, `tables` เพิ่มทางเข้า Add-on; Orders/Kitchen เพิ่มรูปแบบรับอาหาร และ Tables แก้ QR
- ฐานข้อมูล: migrations สองไฟล์ข้างต้น, `supabase/{audit-catalog-redesign.sql,verify-catalog-redesign.sql}`
- การตรวจสอบ: `scripts/catalog-backup.mjs`, `tests/{catalog-redesign.test.mjs,browser-catalog-redesign.mjs,fixtures/catalog-baseline.sql}`, `package.json`, เอกสารฉบับนี้

## ผลทดสอบรอบสุดท้าย

- `git diff --check` และ staged diff check ผ่าน; ไม่มีไฟล์ staged
- `npm run lint` ผ่าน: 0 errors, 2 warnings เดิม `no-img-element` ที่ MenuClient และ TableQRCode
- `npx tsc --noEmit --incremental false` ผ่าน
- `node --test tests/catalog-redesign.test.mjs tests/catalog-deletion.test.mjs` ผ่าน 27/27
- `npm run build` ผ่าน ครบ 19 หน้า/เส้นทางที่ build ประมวลผล
- ทดสอบ SQL/API ด้วย PGlite: migration, เก็บประวัติ, ราคาและสูตรครบ 11 เมนู × 3 เนื้อสัตว์, เงินทศนิยม, ปฏิเสธราคา/ตัวเลือกผิด, วัตถุดิบไม่พอ, คืนสต็อกครั้งเดียวหลังแก้สูตร, ไม่หักซ้ำตอนเข้าครัว/รับเงิน, RLS และ FK
- Browser จริงผ่าน: สร้าง Add-on ใน modal, ใช้ซ้ำเมนูอื่น, เพิ่มเมนูพร้อม Add-on, สั่งเนื้อ+ไข่ดาว+เพิ่มข้าวแบบกลับบ้าน ยอด 80 บาทและ usage ถูกต้อง, Kitchen → พร้อมเสิร์ฟ → เงินสด, แก้ราคากลางแล้ว snapshot เดิมยัง 10 บาท, ไก่/ทะเลหลายจานและยกเลิกคืนครั้งเดียว, Dashboard/Reports/Ingredients/Tables ไม่มี page error
- รอบส่งมอบเรียกโหมด `verify --remote-test` แบบอ่านอย่างเดียว ไม่รันทดสอบที่สร้างข้อมูลซ้ำ

## ค่าตั้งต้นและข้อจำกัด

- ราคาฐานเริ่มต้นจานเดียว 50 บาท/กับข้าว 80 บาท; โปรตีน +0/+10/+20 ตาม Requirement ควรตรวจราคาและสูตรก่อนขายจริง
- วัตถุดิบที่สร้างใหม่เริ่ม 0; วัตถุดิบเดิมที่จำเป็นต้องเก็บยังมียอดเดิม ต้องนับสต็อกจริงก่อนเปิดรับออเดอร์ เมนูที่วัตถุดิบไม่พอจะสั่งไม่ได้
- Add-on “เพิ่มเนื้อ” ตั้งสูตรเป็นเนื้อวัว 100 กรัม ราคา 20 บาท เป็นสูตรตายตัวของ Add-on ไม่เปลี่ยนตามเนื้อสัตว์ที่ลูกค้าเลือก
- “กลับบ้าน” เป็นข้อมูลทั้งออเดอร์ แต่ยังเข้าผ่าน QR/โต๊ะและ dining session เดิม ไม่มีช่องทางสั่งกลับบ้านแบบไม่ใช้โต๊ะ
- เมนู/วัตถุดิบเก่าที่มีประวัติยังเห็นได้ในหลังบ้าน จึงมีจำนวนข้อมูลทั้งหมดมากกว่า 11; 11 คือชุดเมนูใหม่
- สิทธิ์หลังบ้านยังใช้ผู้ล็อกอินตามระบบเดิม ไม่ได้เพิ่มการแยก admin/staff/kitchen; การรับเงินเป็นการยืนยันโดยพนักงาน ไม่ได้เพิ่ม payment gateway
- ทดสอบ functional flow และ rollback แล้ว แต่ยังไม่ได้ทดสอบโหลดสูงหรือการแข่งขันจากหลาย PostgreSQL sessions พร้อมกัน; transaction ตรวจ catalog ใช้ table SHARE locks จึงอาจรอการแก้ไข catalog ชั่วคราว
- ไม่ควร rollback ด้วยการรัน migrations เก่าทับหรือ restore ตาราง orders แบบเหมารวมหลังมีออเดอร์ใหม่ ให้เก็บ backup และทำ forward migration/restore เฉพาะรายการหลังตรวจอ้างอิง

## Browser checklist สำหรับผู้ใช้

1. เปิด `/dashboard/menus`: ตรวจ 11 เมนูใหม่และ 2 หมวด ตรวจราคาและสูตร แล้วกรอกยอดนับจริงใน `/dashboard/ingredients`
2. เปิด `/dashboard/addons`: ตรวจไข่ดาว/ไข่เจียว/เพิ่มข้าว/เพิ่มเนื้อ ลองสร้าง Add-on พร้อมสูตรและเปิดขาย
3. หน้าเพิ่มและแก้เมนู: ติ๊ก Add-on, บันทึก, เปิดเมนูอื่นและเลือก Add-on เดียวกัน; เอาติ๊กออกจากเมนูหนึ่งแล้วตรวจว่าหายเฉพาะเมนูนั้น
4. สแกน QR → ข้าวกะเพรา → เนื้อ → ไข่ดาว + เพิ่มข้าว → กลับบ้าน → ยืนยัน: ราคาตั้งต้น 80 บาท; stock ใช้ข้าว 300g, เนื้อวัว 150g, ไข่ 1 ฟอง, กะเพรา 20g, พริก 10g, กระเทียม 10g
5. ตรวจ Orders/Kitchen ว่าแสดง “กลับบ้าน”, เริ่มทำ → พร้อมเสิร์ฟ → รับเงิน แล้วตรวจรายงานและสต็อกว่าไม่หักซ้ำ
6. สร้างออเดอร์ทานที่ร้านอีกใบและยกเลิกก่อนพร้อมเสิร์ฟ ตรวจคืนสต็อกครบครั้งเดียว; ตรวจเลือกเนื้อสัตว์ไม่ครบและ stock ไม่พอแล้วสั่งไม่ได้
7. ตรวจประวัติเก่าว่าชื่อ ราคา ตัวเลือก และยอดชำระเดิมยังอยู่ ก่อนอนุมัติ commit/push
