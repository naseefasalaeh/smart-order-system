# Final Report — ยืนยัน workspace ปัจจุบัน

สร้าง 2026-09-23T06:32:34.968Z

รายงานนี้ต่อจาก [ผล performance เดิม](dashboard-performance-final.md) ซึ่งเก็บ paired A/B/C แล้ว ไม่รันก่อนงานซ้ำ และไม่ใช้ผลเดิมรับรองงานเสิร์ฟที่เพิ่มภายหลังโดยอัตโนมัติ

## สาเหตุและสิ่งที่แก้

Kitchen 404 เดิมเกิดจาก guard ใช้ notFound() กับ profile failure/ไม่มีสิทธิ์; fixture 503 ทำซ้ำได้ แก้แยก login, access-denied และ retryable error พร้อมรักษา session รายละเอียด Auth, form pending และการลด refresh อยู่ในรายงานเดิม ไม่มี log เพียงพอระบุ upstream failure ของเหตุการณ์เดิมรายครั้ง

รอบนี้พบ hosted Orders subscribed แต่ไม่มี event ของ TEST order ขณะที่ Kitchen/Ready รับ event; ข้อมูล served commit แล้วแต่ UI ค้าง การเปลี่ยนชื่อ channel ไม่ช่วย จึงไม่เก็บการเปลี่ยนชื่อนั้นไว้ แก้หน้า Orders ให้ใช้ lightweight change polling ทุก 5 วินาทีแม้ subscribed เช่นเดียวกับ Ready ไม่ refresh ถ้าข้อมูลไม่เปลี่ยน ยังไม่สามารถระบุสาเหตุภายในบริการ Realtime ที่ส่ง event ไม่ถึง tab นี้ได้

แก้ตัวทดสอบให้ทำ ready → served → payment และใช้ข้อความปัจจุบัน; ตั้ง fixture ready ก่อนทดสอบ disconnect; เพิ่มกรณี subscribed แต่ไม่มี event; เพิ่ม production mode และ mobile viewport ใน hosted workflow ไม่มี feature ใหม่หรือ refactor เพิ่ม

## ผลทดสอบ

| ชุด | ผล | หลักฐาน |
|---|---|---|
| Production fixture desktop/mobile, 5 รอบต่อ desktop action | PASS | .test-artifacts/dashboard-performance/current-after-production/results.json |
| Dev fixture desktop/mobile measurements | PARTIAL: test setup เก่าของ disconnect; samples ก่อนหน้านั้นครบ | .test-artifacts/dashboard-performance/current-after-dev/results.json |
| Final dev roles/retry/realtime/permissions | PASS | .test-artifacts/dashboard-performance/current-final-after-dev-live-only/results.json |
| Final production roles/retry/realtime/permissions | PASS | .test-artifacts/dashboard-performance/current-final-after-production-live-only/results.json |
| Hosted production 7 รอบ × 5 actions | PASS | .test-artifacts/hosted-performance/current-after-production-1790144457301/results.json |
| Hosted production serve/payment desktop + mobile | PASS | .test-artifacts/served-orders/live/test-results.json |
| lint | PASS | .test-artifacts/dashboard-performance/final-lint.log |
| typescript | PASS | .test-artifacts/dashboard-performance/final-typescript.log |
| unit | PASS | .test-artifacts/dashboard-performance/final-unit.log |
| production-build | PASS | .test-artifacts/dashboard-performance/final-production-build.log |

lint: 0 errors, 4 warnings (img 2 จุด และ unused destructured test fields 2 จุด) SQL workflow test เพิ่มเติมผ่าน 1/1 โดยใช้ PGlite ชั่วคราว ไม่เรียก hosted migration

ครอบคลุม Login, Orders, Kitchen, Ready, Menu, Ingredients, Tables, Add-on และ Users; Admin/kitchen_staff/staff/inactive; kitchen URL ตรง/refresh; missing/expired/revoked session; temporary Auth/Profile failure; retry, double submit, realtime burst/race/disconnect และ subscribed missed-event recovery

## เวลา production ก่อนงาน → ปัจจุบัน (fixture)

หน่วย ms: median [min–max], n. Fixture หน่วง HTTP 100 ms ไม่ใช่ความเร็ว hosted database. ±10% เป็นเกณฑ์บรรยาย ไม่ใช่ statistical significance. Payment ปัจจุบันเริ่มหลัง served; ไม่รวมการเสิร์ฟไว้ใน payment และไม่อ้างว่า workflow ทั้งหมดเร็วขึ้น

| Action | ก่อน DOM | ปัจจุบัน DOM | ปัจจุบัน Playwright | ผล DOM |
|---|---:|---:|---:|---|
| login | 737 [713–784], n=5 | 541 [520–791], n=5 | 551 [524–793], n=5 | เร็วขึ้น -26.6% |
| kitchen.start | 485 [483–502], n=5 | 251 [247–266], n=5 | 343 [322–359], n=5 | เร็วขึ้น -48.3% |
| kitchen.ready | 472 [468–496], n=5 | 255 [246–260], n=5 | 335 [332–351], n=5 | เร็วขึ้น -45.9% |
| orders.payment | 483 [471–489], n=5 | 259 [235–307], n=5 | 354 [314–398], n=5 | เร็วขึ้น -46.4% |
| ingredient.save | 989 [973–995], n=5 | 667 [656–930], n=5 | 682 [670–947], n=5 | เร็วขึ้น -32.5% |
| menu.save | 1108 [1065–1130], n=5 | 531 [505–1006], n=5 | 852 [839–1505], n=5 | เร็วขึ้น -52.1% |
| table.toggle | 744 [719–768], n=5 | 508 [482–568], n=5 | 848 [833–957], n=5 | เร็วขึ้น -31.7% |
| user.save | 490 [464–503], n=5 | 384 [376–468], n=5 | 855 [846–882], n=5 | เร็วขึ้น -21.5% |

Add-on desktop/mobile ก่อน→หลัง n=5 และ dev timing อยู่ในรายงานเดิม; โค้ด Add-on ไม่ได้เปลี่ยนในรอบนี้ ส่วน mobile action อื่นมี behavioral samples ไม่เพียงพอสรุป speedup แยกทุกปุ่ม

## Hosted production: network / API / DOM / Playwright

ค่าเหล่านี้เป็นช่วงเวลาซ้อนกัน ห้ามบวกกัน: Supabase fetch วัดถึง headers รวม network/service; Next headers ไม่ใช่ Server Action จบ; users handler มี timer จริง; Click→DOM เป็น MutationObserver ไม่ใช่ paint/CPU. ไม่ประมาณ SQL หรือ pure rendering ด้วยการลบเวลา

| Action | Supabase fetch union ถึง DOM | Next request→headers | users API handler | Click→DOM | Playwright detection หลัง DOM |
|---|---:|---:|---:|---:|---:|
| login | 604 [552–769], n=7 | 18 [0–98], n=7 | ไม่ได้วัด | 1346 [995–2053], n=7 | 18 [9–64], n=7 |
| user.save | 500 [469–769], n=7 | 535 [505–782], n=7 | 513 [485–779], n=7 | 534 [510–791], n=7 | 311 [55–367], n=7 |
| ingredient.save | 569 [509–631], n=7 | 331 [298–391], n=7 | ไม่ได้วัด | 617 [573–707], n=7 | 22 [16–58], n=7 |
| menu.save | 602 [524–642], n=7 | 327 [272–361], n=7 | ไม่ได้วัด | 666 [578–690], n=7 | 164 [151–320], n=7 |
| table.toggle | 532 [482–703], n=7 | 330 [244–455], n=7 | ไม่ได้วัด | 554 [506–731], n=7 | 304 [95–363], n=7 |

Order actions ปัจจุบัน (production fixture): RPC จาก browser ไม่มี Next API/Server Action ใน critical path ค่านี้ไม่ใช่ hosted network

| Action | RPC→headers | Read headers→DOM โดยประมาณ | Click→DOM | DOM→Playwright |
|---|---:|---:|---:|---:|
| kitchen.start | 115 [113–118], n=5 | 5 [3–6], n=5 | 251 [247–266], n=5 | 91 [75–93], n=5 |
| kitchen.ready | 123 [110–125], n=5 | 3 [2–5], n=5 | 255 [246–260], n=5 | 89 [76–93], n=5 |
| orders.payment | 120 [113–121], n=5 | 3 [2–69], n=5 | 259 [235–307], n=5 | 99 [44–115], n=5 |

Login browser→Supabase แยกจาก server fetch:

- /auth/v1/token: 411 [222–866], n=7
- /rest/v1/profiles: 240 [168–294], n=7

paired A/B/C เดิม 9 รอบต่อเวอร์ชัน: Login DOM 1365 → 1343 → 1073 ms; users DOM 663 → 728 → 504 ms. Users Playwright 846 → 851 → 858 ms ใกล้เดิม แม้ DOM/handler เร็วขึ้น เพราะเวลาตรวจพบของ Playwright. ตาราง Auth variance และ network ของ paired อยู่ในรายงานเดิม ไม่ใช้รอบปัจจุบันคนละช่วงเวลาแทน paired

## ข้อจำกัดและการจัดประเภท failure

- hosted timeout งานเสิร์ฟ: ข้อมูล commit แต่ Orders tab พลาด event และไม่มี backstop เป็นช่องโหว่การฟื้นตัวของระบบ; การแก้ backstop ไม่ใช่หลักฐานว่า event ถูกส่งถึง tab แล้ว
- dev disconnect fixture timeout: bug ตัวทดสอบที่ยังตั้ง status=served แต่ไปหา ready card; แก้ setup และยืนยัน live suite ใหม่ เก็บผลล้มเหลวไว้
- sandbox network failure เกิดก่อน provisioning; รันด้วย network permission ไม่ใช่ system bug
- signOut TEST global เดิมแก้ scope local แล้ว; revoked-session case ยังใช้ global เฉพาะ TEST ที่ตั้งใจ revoke
- Production คือ local next build/start ต่อ hosted Supabase ไม่ได้ deploy; mobile เป็น viewport emulation ไม่ใช่เครื่องจริง
- ช่วงวัดใหม่มี browser/build tests ทำงานพร้อมกันบางช่วง จึงมี CPU/load confounding; dev มี HMR ระหว่างรอบ ห้ามใช้เป็น controlled benchmark หรือแทน paired เดิม
- DOM timestamp เป็น semantic mutation; streaming headers, cross-clock rounding และ wait polling ทำให้ไม่สามารถแยก pure DOM rendering / network transport / SQL execution ทั้งหมดได้

## TEST cleanup และ migration

Hosted performance fingerprintChanges=[]; hosted workflow cleaned=true; errors=0. Workflow ตรวจ original 23 tables/views + Auth ทุกช่วงและหลัง cleanup. ลบเฉพาะ registered TEST IDs ไม่มีการซ่อมหรือเขียนทับข้อมูลจริง

ไม่มี migration ถูกเรียกในรอบนี้ ไม่มี reset/Undo/checkout ทับ และยังไม่ commit/push. แต่ไม่สามารถยืนยันว่าไม่เคยมี migration ก่อนรอบนี้: artifact apply.txt และ schema-after-verified.json บันทึก migration 20260923100000 ถูกใช้ก่อนเริ่มรอบนี้แล้ว เก็บไฟล์และงานเดิมไว้ทั้งหมด

Fingerprint ยืนยันเฉพาะข้อมูล/คอลัมน์ที่ inventory อ่านได้และ Auth users ไม่ครอบคลุม sequences, Auth internal sessions/audit logs หรือ Storage blobs; จึงยืนยันไม่มีข้อมูลจริงเปลี่ยนในขอบเขต fingerprint ไม่อ้างเกินหลักฐาน

## git diff --stat

```text
web/eslint.config.mjs                              |   1 +
 web/src/app/api/admin/users/route.ts               |  72 +++--
 web/src/app/api/orders/[orderId]/cancel/route.ts   |  14 +-
 web/src/app/dashboard/addons/actions.ts            |   9 +-
 web/src/app/dashboard/catalog-delete-actions.ts    |   5 +-
 .../app/dashboard/ingredients/[id]/edit/page.tsx   |  28 +-
 .../app/dashboard/ingredients/categories/page.tsx  |  40 +--
 web/src/app/dashboard/ingredients/new/page.tsx     |  21 +-
 web/src/app/dashboard/kitchen/page.tsx             | 188 +----------
 .../menus/[id]/edit/OptionGroupsEditor.tsx         |  44 +--
 .../menus/[id]/edit/RecipeIngredientSelector.tsx   |  28 +-
 web/src/app/dashboard/menus/[id]/edit/page.tsx     |  60 ++--
 web/src/app/dashboard/menus/new/page.tsx           |  30 +-
 web/src/app/dashboard/orders/page.tsx              | 342 +--------------------
 web/src/app/dashboard/page.tsx                     |   2 +
 web/src/app/dashboard/ready/page.tsx               |  74 +----
 web/src/app/dashboard/reports/page.tsx             |   1 +
 web/src/app/dashboard/tables/TablesClient.tsx      |  21 +-
 web/src/app/dashboard/tables/actions.ts            |   7 +-
 web/src/app/dashboard/users/page.tsx               |   4 +-
 web/src/app/dashboard/users/user-management.tsx    |  38 +--
 web/src/app/login/page.tsx                         |  36 ++-
 .../[tableId]/orders/CustomerOrdersClient.tsx      |   4 +
 web/src/components/addon-controls.tsx              |  23 +-
 web/src/components/addon-editor.tsx                |  29 +-
 web/src/components/catalog-delete-button.tsx       |   2 +-
 web/src/components/logout-button.tsx               |  26 +-
 web/src/components/menu-availability-form.tsx      |   7 +-
 web/src/components/order-realtime-refresh.tsx      |  69 ++++-
 web/src/components/update-order-status-button.tsx  |  92 ++++--
 web/src/lib/dashboard-auth.ts                      |  39 ++-
 web/src/lib/supabase/admin.ts                      |   4 +-
 web/src/lib/supabase/server.ts                     |   7 +-
 web/tests/catalog-deletion.test.mjs                |   5 +-
 web/tsconfig.json                                  |   2 +-
 35 files changed, 472 insertions(+), 902 deletions(-)
```

## ไฟล์ที่แก้/เพิ่มทั้งหมด รวมงานค้างเดิม

```text
M eslint.config.mjs
 M src/app/api/admin/users/route.ts
 M src/app/api/orders/[orderId]/cancel/route.ts
 M src/app/dashboard/addons/actions.ts
 M src/app/dashboard/catalog-delete-actions.ts
 M src/app/dashboard/ingredients/[id]/edit/page.tsx
 M src/app/dashboard/ingredients/categories/page.tsx
 M src/app/dashboard/ingredients/new/page.tsx
 M src/app/dashboard/kitchen/page.tsx
 M src/app/dashboard/menus/[id]/edit/OptionGroupsEditor.tsx
 M src/app/dashboard/menus/[id]/edit/RecipeIngredientSelector.tsx
 M src/app/dashboard/menus/[id]/edit/page.tsx
 M src/app/dashboard/menus/new/page.tsx
 M src/app/dashboard/orders/page.tsx
 M src/app/dashboard/page.tsx
 M src/app/dashboard/ready/page.tsx
 M src/app/dashboard/reports/page.tsx
 M src/app/dashboard/tables/TablesClient.tsx
 M src/app/dashboard/tables/actions.ts
 M src/app/dashboard/users/page.tsx
 M src/app/dashboard/users/user-management.tsx
 M src/app/login/page.tsx
 M src/app/table/[tableId]/orders/CustomerOrdersClient.tsx
 M src/components/addon-controls.tsx
 M src/components/addon-editor.tsx
 M src/components/catalog-delete-button.tsx
 M src/components/logout-button.tsx
 M src/components/menu-availability-form.tsx
 M src/components/order-realtime-refresh.tsx
 M src/components/update-order-status-button.tsx
 M src/lib/dashboard-auth.ts
 M src/lib/supabase/admin.ts
 M src/lib/supabase/server.ts
 M tests/catalog-deletion.test.mjs
 M tsconfig.json
?? docs/dashboard-performance-audit.md
?? docs/dashboard-performance-current.md
?? docs/dashboard-performance-final.md
?? docs/served-order-workflow.md
?? scripts/report-dashboard-current.mjs
?? scripts/report-dashboard-final.mjs
?? scripts/report-dashboard-performance.mjs
?? scripts/served-order-baseline.mjs
?? scripts/verify-served-schema.mjs
?? src/app/access-denied/page.tsx
?? src/app/api/customer-orders/events/route.ts
?? src/app/dashboard/error.tsx
?? src/app/dashboard/kitchen/view.tsx
?? src/app/dashboard/orders/view.tsx
?? src/app/dashboard/ready/view.tsx
?? src/components/action-form.tsx
?? src/components/customer-order-events.ts
?? src/components/live-order-view.tsx
?? src/components/submit-button.tsx
?? src/lib/admin-users.ts
?? src/lib/order-views.ts
?? src/lib/supabase/timed-fetch.ts
?? src/lib/supabase/verified-profile.ts
?? src/proxy.ts
?? supabase/migrations/20260923100000_served_order_payment.sql
?? tests/browser-dashboard-performance.mjs
?? tests/browser-served-orders.mjs
?? tests/helpers/dashboard-live-checks.mjs
?? tests/helpers/dashboard-mock.mjs
?? tests/hosted-action-performance.mjs
?? tests/hosted-served-orders.mjs
?? tests/served-order-workflow.test.mjs
?? tests/verified-profile.test.mjs
```

## Final live assertions

- kitchen/orders/ready: initial query 503 has manual retry and recovers without navigation
- admin: all 10 dashboard routes enforce access
- staff: all 10 dashboard routes enforce access
- kitchen_staff: all 10 dashboard routes enforce access
- staff: no kitchen controls; realtime payment succeeds; admin API denied
- cancel API: transient RPC failure is Thai retryable error, button unlocks, retry succeeds
- kitchen_staff: start/ready succeeds, double click = one RPC, no cancel/payment controls
- Realtime joined: burst coalesced, UI updated without full-page/auth reload
- Realtime arriving during an in-flight snapshot is replayed, newer state wins
- subscribed socket missing an event: lightweight polling recovers the order
- live profile failure recovers; role change and inactive account enforced
- socket disconnect: polling recovers missed order event
- Server Action form: failure unlocks, retry works, double submit = one transaction
- menu availability: immediate pending, one write, refreshed through Server Action
- addon save: pending and successful Server Action result
- isolated fixture actions complete

- after-test-provision: original 23 tables/views and Auth fingerprints unchanged
- Kitchen Staff cannot access Orders/Ready pages
- staff/dine_in: preparing → ready → served → completed; labels, two-view live movement, private customer Realtime with polling disabled, audit, double clicks, roles, stock and usage
- after-staff-dine_in: original 23 tables/views and Auth fingerprints unchanged
- staff/takeaway: preparing → ready → served → completed; labels, two-view live movement, private customer Realtime with polling disabled, audit, double clicks, roles, stock and usage
- after-staff-takeaway: original 23 tables/views and Auth fingerprints unchanged
- admin/dine_in: preparing → ready → served → completed; labels, two-view live movement, private customer Realtime with polling disabled, audit, double clicks, roles, stock and usage
- after-admin-dine_in: original 23 tables/views and Auth fingerprints unchanged
- admin/takeaway: preparing → ready → served → completed; labels, two-view live movement, private customer Realtime with polling disabled, audit, double clicks, roles, stock and usage
- after-admin-takeaway: original 23 tables/views and Auth fingerprints unchanged
- Concurrent independent Admin/Staff transactions: first service audit preserved, one payment only
- Customer Realtime rejects unknown private session tokens
- Observed 76 actual hosted postgres_changes frames in dashboard browsers
- before-test-cleanup: original 23 tables/views and Auth fingerprints unchanged
- Only registered TEST rows/users removed; final fingerprints equal pre-migration baseline
