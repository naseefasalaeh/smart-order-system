# Realtime, การกลับมาเชื่อมต่อ และวิธีคืนระบบ

เอกสารนี้ติดตามผลจาก [การทดสอบ Supabase จริง](clean-code-hosted-verification.md) โดยไม่ commit, push หรือ deploy ตัวเว็บเพิ่ม และไม่มีการเปลี่ยน schema/policy/RPC เพิ่มจากสอง migrations ที่ apply ไปแล้ว

## ปัญหาและการแก้

พบการแข่งกันระหว่างการเริ่ม Auth จาก cookies และการ subscribe Realtime ใน browser: ช่องทางตอบรับการ join แต่ payload แรกยังไม่ใช่ JWT ของ Staff จึงไม่ได้รับข้อมูล orders ที่ RLS ป้องกันไว้ ขณะเดียวกันการอ่าน HTTP ภายหลังใช้ session ได้ ทำให้ polling กลบอาการนี้

หลักฐานก่อนแก้อยู่ที่รอบ `TEST-clean-9fc07530bc`: join ได้ bindings แต่ `subjectMatchesTestStaff=false`, ไม่มี UPDATE ของออเดอร์ TEST และหน้าจอไม่เปลี่ยนเมื่อบล็อก polling จากนั้นล้างข้อมูล TEST แล้วตรวจข้อมูลเดิมผ่าน ไม่ได้เปลี่ยน RLS เพื่อเปิดข้อมูลให้ anonymous

แก้ `src/components/order-realtime-refresh.tsx` ให้ `await supabase.realtime.setAuth()` ก่อน `channel.subscribe()` พร้อมตรวจ effect ว่ายัง active หลังรอ Auth ถ้าระหว่างนั้นออกจากหน้าแล้วจะไม่สร้าง subscription ค้าง เมื่อเตรียม Auth ไม่สำเร็จยังคง polling สำรอง ไม่เปลี่ยนสิทธิ์ผู้ใช้หรือข้อความ/หน้าตาของระบบ

เพิ่ม regression tests สองกรณีใน `tests/realtime-auth-startup.test.mjs`: Auth พร้อมช้าต้องไม่ join แบบ anonymous และออกจากหน้าขณะรอ Auth แล้วต้องไม่ join subscription เก่า

การปิด browser ทำให้ client หยุดรับ Realtime แต่ transaction/RPC และ pg_cron ทำงานใน Supabase ต่อได้ เมื่อเปิด browser ใหม่ หน้าจะอ่าน snapshot ล่าสุด เมื่อ online หรือกลับจากการพักหน้า ตัว refresh จะอ่านข้อมูลใหม่และสร้าง/กู้ subscription ส่วน polling ใช้เป็นทางสำรองระหว่าง socket มีปัญหา การกลับมาใช้งานจึงต้องเห็นสถานะล่าสุดโดยไม่พึ่งการเก็บ events ใน browser ที่ปิดไปแล้ว

ไฟล์ที่เปลี่ยนสำหรับงาน Realtime รอบนี้มี component ข้างต้น, test `tests/realtime-auth-startup.test.mjs`, helper `tests/helpers/hosted-realtime-checks.mjs`, โหมด `--realtime` ใน `tests/hosted-clean-code.mjs` และเอกสารรายงาน ไม่มีการเปลี่ยน package หรือเพิ่ม migration

## วิธีทดสอบบนฐานจริง

ใช้ `node tests/hosted-clean-code.mjs --realtime` กับเว็บ localhost:4422 ที่เชื่อม Supabase จริง ใช้เฉพาะบัญชี/โต๊ะ/เมนู/วัตถุดิบ/ออเดอร์ TEST ที่ลงทะเบียน IDs ไว้ ตรวจ fingerprints ก่อน–หลัง และล้างเฉพาะทรัพยากรเหล่านี้

โหมดนี้สร้าง baseline ใหม่ต่อรอบ ไม่อาศัยข้อมูลเก่าที่อาจเปลี่ยนตามการใช้งานจริง ทดสอบด้วยหน้าผู้สังเกตเดียวและรอ acknowledgement ของ subscription ปัจจุบัน ตรวจเฉพาะว่า JWT subject ตรงบัญชี TEST โดยไม่บันทึก token

การควบคุมเครือข่ายใน test ไม่สร้างข้อมูล/event ปลอม: WebSocket proxy ส่งข้อความไป–กลับ Supabase จริงโดยไม่แก้ payload ใช้ปิด connection จริงเมื่อจำลองหลุด ส่วนการพิสูจน์ push-only จะ abort เฉพาะ fingerprint polling requests เพื่อกัน polling มาช่วย เมื่อทดสอบ polling-only จะบล็อก WebSocket และปล่อย HTTP จริงตามปกติ

รอบสำเร็จคือ `TEST-clean-8e7fa4bddd`: **14 checks ผ่าน, 0 errors, 0 skipped, cleaned=true** หลักฐานอยู่ใน `.test-artifacts/clean-code-hosted/TEST-clean-8e7fa4bddd/results.json`, `realtime-proof.json`, `before.json` และ `after-cleanup.json`

| กรณีทดสอบบน Supabase จริง | ผล |
| --- | --- |
| Auth ของ subscription | join ของ Staff ทั้ง 6 ครั้งใช้ JWT subject ตรงบัญชี TEST ตั้งแต่คำขอแรก |
| Push อย่างเดียว | บล็อก fingerprint polling HTTP แล้วเสิร์ฟจาก client อื่นสองครั้งต่อเนื่อง หน้าจอเปลี่ยน 0 → 1 → 2/10 จาน พร้อมตรวจ UPDATE frames ของออเดอร์นั้นจริง |
| พัก browser แล้วกลับมา | Freeze lifecycle ผ่าน Chromium CDP เปลี่ยนข้อมูลระหว่างพัก แล้ว resume/focus หน้าจอเห็น 3/10 |
| หลุดแล้วเชื่อมต่อใหม่ | ปิดทั้ง HTTP ของ browser และ WebSocket จริง เปลี่ยนเป็น 4/10 ขณะหลุด เปิดเครือข่ายแล้วเห็นค่าที่พลาด จากนั้นรับ push ใหม่เป็น 5/10 โดยยังบล็อก polling |
| Polling อย่างเดียว | ปิด WebSocket/บล็อกการ reconnect ปล่อย HTTP จริง แล้วเปลี่ยนเป็น 6/10 ตรวจว่า polling อ่านฐานจริงและหน้าจอเปลี่ยน โดยไม่มี UPDATE frame มาช่วยในช่วงนั้น |
| ปิด browser ของการทดสอบทั้งหมด | Backend RPC เปลี่ยนเป็น 7/10 ได้ และ cron เดิมทำงานเวลา `2026-10-25T16:31:00Z` หรือ 23:31 น. ไทย รีเซ็ตเฉพาะ TEST ingredient จาก 80 เป็น 0 โดยไม่ต้องมี browser เปิด |
| เปิด browser ใหม่ | ใช้ cookies/session TEST ที่เก็บไว้ในหน่วยความจำกับ browser process ใหม่ หน้า Staff อ่าน 7/10 และหน้า Admin อ่านสต็อก 0 ตั้งแต่โหลดหน้าแรก จากนั้นรับ push ใหม่เป็น 8/10 ได้ |
| ลูกค้าหลุดแล้วกลับมา | ใช้ private session token ของ TEST หน้า Orders เห็น 8/10 → offline → backend เปลี่ยนเป็น 9/10 → online แล้วเห็น 9/10 และรับสถานะ served หลังจานครบ |
| ข้อมูลเดิม/cleanup | ล้างเฉพาะ TEST IDs แล้ว hashes ของข้อมูลเดิมทั้ง 23 ตาราง/views และ Auth เดิมตรง baseline ออเดอร์เดิมยัง 97 บิล Auth เดิมยัง 4 บัญชี ไม่มีการแก้ข้อมูลเดิมเพื่อให้ตรวจผ่าน |

สรุปหลักฐาน transport: UPDATE frames จริง 16 รายการ, fingerprint polls ที่บล็อก 16 ครั้ง, ปิด transport 2 ครั้งและบล็อก reconnect 3 ครั้ง ไม่ใช้คำว่า SUBSCRIBED อย่างเดียวสรุปว่าหน้าจอสดแล้ว

Tests ในเครื่องหลังแก้: **92/92 ผ่าน**, typecheck/build ผ่าน, ESLint 0 errors และ warning เดิม 4 จุด Browser fixture regression ของ roles, event ระหว่างโหลด, polling, retry และ double submit ผ่านด้วย

ข้อจำกัดที่ยังมี: ทดสอบผ่าน Edge headless/Chromium และ localhost ที่เชื่อม hosted Supabase จริง ไม่ได้ deploy หรือยืนยันเว็บ production ว่าใช้ source ที่แก้แล้ว การพักหน้าใช้ CDP freeze/resume และการหลุดใช้ network/transport controls ไม่ได้ทดสอบทุก OS/browser, การหมดอายุ JWT หลัง offline นานหลายชั่วโมง หรือ load/stress ทุกระดับ

## สิ่งที่ลบจริงทั้งหมดในรอบ Clean Code

| ประเภท | รายการที่ลบ |
| --- | --- |
| ไฟล์ source/config/tests/docs | **ไม่มีไฟล์ถูกลบทั้งไฟล์** เมื่อเทียบ checkpoint `e84161d` |
| Dependencies | **ไม่มี package ถูกลบ**; package.json และ package-lock.json ไม่เปลี่ยนจาก checkpoint |
| โค้ดที่ไม่ใช้ | `currentOrderFilters`, `historyOrderFilters` และค่า `visibleFilters` ที่คืนจาก `src/lib/order-views.ts`; แท็บ UI ใช้ OrderStatusTabs อยู่แล้ว |
| ตารางจริง | `public.reviews` ซึ่งตรวจว่ามี 0 แถวก่อนลบ |
| คอลัมน์ของตารางดังกล่าว | `id`, `order_id`, `rating`, `comment`, `created_at` หายไปพร้อมการลบตาราง ไม่ได้ลบคอลัมน์ในตารางอื่น |
| Constraints ของ reviews | `reviews_pkey`, `reviews_order_id_key`, `reviews_order_id_fkey`, `reviews_rating_check` |
| Indexes ที่ผูกกับ constraints | `reviews_pkey`, `reviews_order_id_key` ถูก PostgreSQL ลบพร้อมตาราง รวมชนิดข้อมูล/TOAST/default ภายในที่เป็นของตารางนี้ |
| RPC เก่า | `public.deduct_ingredient_stock(jsonb)` และ `public.process_order_stock(uuid,jsonb)` |
| Policies/triggers/jobs อื่น | **ไม่ได้ลบ**; reviews ไม่มี policy/trigger/publication membership ก่อนลบ นิยามที่เหลือและ cron ไม่เปลี่ยน |

Migrations ที่ใช้จริงคือ `20261025160000_remove_unused_reviews.sql` และ `20261025161000_remove_legacy_stock_rpcs.sql` ใช้ RESTRICT ไม่ใช้ CASCADE เก็บ migration เก่า เอกสารย้อนหลัง และ fixtures ที่ยังต้องใช้ไว้

## วิธีคืนโค้ดและฐานข้อมูลให้ตรงกัน

ขั้นตอนด้านล่างเป็นคู่มือ **ยังไม่ได้ดำเนินการคืนระบบจริง** ก่อนทำต้องสำรองข้อมูล/schema และเก็บ working tree ปัจจุบันรวม untracked files โดยไม่รวม secrets ลง Git ตรวจว่ามี migration หรือ dependency ใหม่หลังสองรายการนี้หรือไม่ และหยุดการเขียนของระบบในช่วงเปลี่ยนเวอร์ชัน

### วิธีแนะนำ: คืนเฉพาะวัตถุด้วย migration ใหม่

หากต้องการคืน reviews/RPC แต่เก็บ Clean Code และการแก้ Realtime ไว้ ให้ใช้โค้ดปัจจุบัน สร้าง recovery migrations ใหม่สองไฟล์ด้วย version ที่ใหม่กว่าล่าสุด โดยนำเนื้อหาจากไฟล์ต่อไปนี้ตามลำดับ:

1. `supabase/rollback/20261025161000_restore_legacy_stock_rpcs.sql`
2. `supabase/rollback/20261025160000_restore_reviews.sql`

ไม่แก้ migrations ที่ apply ไปแล้ว และไม่ใช้ `migration repair` สำหรับวิธีนี้ ทำ dry-run ตรวจว่าเพิ่มเฉพาะ recovery migrations แล้วจึง apply เมื่อได้รับอนุญาต ประวัติ 28 รายการเดิมยังอยู่และมี recovery versions เพิ่มในทั้งโค้ดและฐานข้อมูล โค้ดปัจจุบันทำงานกับวัตถุที่คืนได้ เพราะ flow หลักใช้ RPC ปัจจุบัน ไม่ได้กลับไปเรียก legacy RPC โดยอัตโนมัติ

Rollback คืน reviews ว่างตาม backup พร้อม columns/defaults/constraints/owner/RLS/grants และคืนนิยาม/EXECUTE grants ของ RPC จากฐานจริง ไม่แตะ orders/stock/payments เดิม การคืนครั้งนี้ไม่ใช่ full database restore และไม่ย้อน sequence

### หากต้องกลับทั้งโค้ดก่อน Cleanup และ schema เดิม

ใช้วิธีนี้เฉพาะเมื่อสอง cleanup migrations ยังเป็นรายการล่าสุดและไม่มีงาน schema ใหม่ผูกอยู่ ถ้ามี migrations ต่อแล้วให้ใช้ forward recovery ด้านบน

เก็บ working tree เดิมไว้ แล้วเปิด checkout แยกโดยไม่ใช้ hard reset หรือทับไฟล์งานค้าง:

```powershell
git worktree add --detach D:\Projects\smart-order-system-restore e84161d5d80691a94dcbe7c8143d5adca67b742c
```

โค้ดอยู่ใน `D:\Projects\smart-order-system-restore\web` ตั้งค่า environment และ link ไป Supabase project เดิมใน checkout นี้อย่างระมัดระวัง เพราะ `.env.local` กับ link metadata ไม่ได้อยู่ใน Git ส่วน rollback files ให้อ้างสำเนาที่เก็บจาก working tree ปัจจุบันก่อนย้อนโค้ด

ภายใต้ maintenance ให้รัน rollback SQL ทั้งสองไฟล์ตามลำดับข้างต้นผ่าน `supabase db query --linked --file <path>` ตรวจ schema, grants/RLS และข้อมูลเดิมก่อน แล้วจึงทำให้ history ตรงกับ checkout 26 migrations:

```powershell
supabase migration repair --linked --status reverted 20261025161000 20261025160000
supabase migration list --linked
```

`migration repair` เปลี่ยนเฉพาะ history ไม่คืนตารางหรือ function จึงต้องทำ **หลัง** rollback SQL และตรวจผลแล้วเท่านั้น ห้าม mark reverted แล้ว `db push` จาก working tree ปัจจุบันที่ยังมี cleanup migrations เพราะจะสั่งลบซ้ำ

ตรวจว่า local/remote history ตรงกัน รัน lint/typecheck/tests/build และ smoke tests กับฐานที่คืนแล้วจึงเปิดบริการด้วย checkpoint โค้ด checkpoint ไม่มีการแก้ Realtime ครั้งล่าสุด จึงต้องตรวจพฤติกรรม Realtime อีกครั้งก่อนใช้งาน ไม่ควรนำโค้ดเก่าขึ้นโดยไม่ตรวจ schema/history

ไม่มีวิธีใดในคู่มือนี้ต้องล้างข้อมูลเดิมหรือย้อนเลขลำดับ และไม่ใช่คำสั่งให้ deploy/rollback โดยอัตโนมัติ
