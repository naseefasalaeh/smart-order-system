# Final Report: Kitchen 404 / Dashboard performance

> Historical report (2026-09-22). Current workspace verification and the later served-order workflow are reported in [dashboard-performance-current.md](dashboard-performance-current.md). The no-migration statement below applies to the original performance run, not later work recorded before the current verification.

สร้างจากหลักฐานวันที่ 2026-09-22T16:21:52.617Z — ยังไม่ commit/push/deploy

## ขอบเขตและสาเหตุ

Kitchen route มีอยู่จริง แต่ guard เดิมใช้ notFound() เมื่ออ่าน profile ล้มเหลว/ไม่มี profile/ไม่มีสิทธิ์ ทำให้แสดง 404 ผิดประเภท การฉีด profile 503 ลง baseline ทำซ้ำปัญหาได้ ส่วนเหตุการณ์ที่ผู้ใช้พบในอดีตไม่มี log response เพียงพอที่จะชี้ว่าเป็น upstream error หรือสิทธิ์ใดแน่นอน

สิ่งที่แก้สะสม: แยก login/access-denied/retryable error; Proxy บันทึก refresh cookie; รวม Auth ต่อ request และอ่าน Auth/profile พร้อมกันโดยตรวจ profile.id ตรงกับผู้ใช้ที่ Auth ยืนยัน; ไม่เชื่อสิทธิ์จาก cookie; ปุ่ม pending/ป้องกัน submit ซ้ำ/คืนปุ่มเมื่อผิดพลาด; order view โหลดเฉพาะข้อมูลที่เปลี่ยน; realtime รวม burst และ replay event ระหว่างอ่าน; ลด refresh ซ้ำ; อ่าน catalog แบบขนาน; API ผู้ใช้แยก unavailable ออกจาก not-found และอัปเดต UI หลังสำเร็จ

รอบต่อเนื่องนี้รักษา application changes เดิมไว้ แก้/เพิ่มเฉพาะเครื่องมือวัดและรายงาน ใช้ผลที่ผ่านเดิมร่วมกับการเก็บ production ที่ค้าง และเพิ่มหลายรอบในจุดที่หลักฐานเดิมเป็นรอบเดียว

## เวอร์ชันที่เปรียบเทียบ

- A ก่อนงานเดิม: `.test-artifacts/dashboard-performance/baseline` (Login/API users/dashboard-auth ตรง HEAD เมื่อ normalize CRLF)
- B งานค้างก่อนปรับ Auth แบบขนาน: `.test-artifacts/hosted-performance/before-production-1790084044036/app`
- C หลังแก้: workspace ปัจจุบัน; paired run variant 0=C, 1=B, 2=A
- A→C fixture ใช้ 5 รอบ/Action; B→C hosted catalog ใช้ 7 รอบ/Action; Login/users ใช้ paired 9 รอบต่อเวอร์ชัน สลับลำดับในช่วงเวลาเดียวกัน

## ผลทดสอบ

| ชุด | ผล | หลักฐาน |
|---|---|---|
| Final dev desktop/mobile | PASS | .test-artifacts/dashboard-performance/final-after-dev/results.json (48 actions) |
| Final production desktop/mobile | PASS | .test-artifacts/dashboard-performance/final-after-production/results.json (48 actions) |
| Baseline dev measurement | PASS | .test-artifacts/dashboard-performance/final-before-dev/results.json (47 actions) |
| Baseline production measurement | PASS | .test-artifacts/dashboard-performance/final-before-production/results.json (47 actions) |
| Hosted production / TEST only | PASS | .test-artifacts/hosted-performance/final-after-production-1790093061006/results.json |
| Paired A/B/C production | PASS | 54 samples; 9 × 2 actions × 3 versions |

Fixture suite ครอบคลุม Login, ออเดอร์, ครัว, พร้อมเสิร์ฟ, เมนู, วัตถุดิบ, โต๊ะ, Add-on, ผู้ใช้; Admin/kitchen_staff/staff/inactive; URL ตรงและ refresh; missing/expired session; temporary Auth/Profile failure; manual retry; API/RPC failure; double submit; realtime burst/race/disconnect/polling; mobile viewport และ dev HMR

รายละเอียด checks ที่ผ่าน (production):

- profile 503 shows retry, session retained, retry recovers
- admin: direct URL + refresh
- kitchen_staff: direct URL + refresh
- staff and inactive accounts redirect to access-denied, no 404
- temporary Auth 503 retains session and recovers
- all remaining notFound calls: absent record only, query 503 is retryable
- ready page idle: no full-page/auth reload while unchanged (11 seconds)
- failed order RPC shows Thai error and restores button
- missing session goes to login; expired session refreshes and writes cookie
- mobile order/menu/ingredient/table/user actions
- mobile login: Auth failure restores button, retry succeeds
- kitchen/orders/ready: initial query 503 has manual retry and recovers without navigation
- admin: all 10 dashboard routes enforce access
- staff: all 10 dashboard routes enforce access
- kitchen_staff: all 10 dashboard routes enforce access
- staff: no kitchen controls; realtime payment succeeds; admin API denied
- cancel API: transient RPC failure is Thai retryable error, button unlocks, retry succeeds
- kitchen_staff: start/ready succeeds, double click = one RPC, no cancel/payment controls
- Realtime joined: burst coalesced, UI updated without full-page/auth reload
- Realtime arriving during an in-flight snapshot is replayed, newer state wins
- live profile failure recovers; role change and inactive account enforced
- socket disconnect: polling recovers missed order event
- Server Action form: failure unlocks, retry works, double submit = one transaction
- menu availability: immediate pending, one write, refreshed through Server Action
- addon save: pending and successful Server Action result
- isolated fixture actions complete

Hosted Supabase checks:

- Seven samples per action, final write sample double-clicked
- admin: four admin routes and unauthorized user write guarded
- staff: four admin routes and unauthorized user write guarded
- kitchen_staff: four admin routes and unauthorized user write guarded
- User API failure unlocks; retry succeeds against hosted Supabase
- Ingredient/menu/table network failure unlocks; retry commits successfully
- Missing session redirects to login
- Forced SDK expiry with genuine hosted refresh token refreshes and persists cookie
- Revoked hosted refresh token at expiry redirects to login
- Hosted Realtime postgres_changes updates TEST order in kitchen UI

## Login / ผู้ใช้: A → B → C (hosted production, สลับเวอร์ชัน)

หน่วย ms; median [min–max], n. เกณฑ์ใกล้เคียงเดิม ±10% เป็นเกณฑ์บรรยาย ไม่ใช่การพิสูจน์นัยสำคัญทางสถิติ

| Action / ตัวชี้วัด | A ก่อนงานเดิม | B งานค้าง | C หลังแก้ | A→C | B→C |
|---|---:|---:|---:|---|---|
| login / DOM | 1365 [1237–2122], n=9 | 1343 [1127–2395], n=9 | 1073 [893–2471], n=9 | เร็วขึ้น (-21.4%) | เร็วขึ้น (-20.1%) |
| login / Playwright observed | 1388 [1257–2146], n=9 | 1362 [1145–2413], n=9 | 1099 [922–2484], n=9 | เร็วขึ้น (-20.8%) | เร็วขึ้น (-19.3%) |
| user.save / DOM | 663 [589–837], n=9 | 728 [599–1274], n=9 | 504 [468–740], n=9 | เร็วขึ้น (-24.0%) | เร็วขึ้น (-30.8%) |
| user.save / Playwright observed | 846 [836–943], n=9 | 851 [825–1454], n=9 | 858 [826–880], n=9 | ใกล้เคียงเดิม (+1.4%) | ใกล้เคียงเดิม (+0.8%) |

users API handler (paired B→C): 710 [581–1226], n=9 → 488 [455–720], n=9 ms. A ไม่มี timer นี้ จึงไม่ประมาณย้อนหลัง

## ทุก Action ที่วัดซ้ำ: A → C (fixture)

Supabase fixture หน่วง HTTP 100 ms ต่อคำขอ ตัวเลขนี้แสดงผลจากจำนวน roundtrip/การ render ไม่ใช่ความเร็ว hosted database

| Mode / Action | A DOM | C DOM | A Playwright | C Playwright | DOM เปลี่ยนแปลง |
|---|---:|---:|---:|---:|---|
| dev / login | 828 [800–1351], n=5 | 608 [564–744], n=5 | 831 [803–1353], n=5 | 614 [566–746], n=5 | เร็วขึ้น (-26.6%) |
| dev / kitchen.start | 534 [518–541], n=5 | 244 [223–270], n=5 | 839 [836–844], n=5 | 317 [316–321], n=5 | เร็วขึ้น (-54.4%) |
| dev / kitchen.ready | 515 [500–533], n=5 | 237 [218–250], n=5 | 827 [822–840], n=5 | 319 [318–333], n=5 | เร็วขึ้น (-54.0%) |
| dev / orders.payment | 515 [513–538], n=5 | 226 [225–249], n=5 | 829 [823–865], n=5 | 324 [319–335], n=5 | เร็วขึ้น (-56.0%) |
| dev / ingredient.save | 1086 [1080–1391], n=5 | 766 [707–777], n=5 | 1090 [1083–1391], n=5 | 768 [707–777], n=5 | เร็วขึ้น (-29.4%) |
| dev / menu.save | 1223 [1197–1250], n=5 | 616 [610–622], n=5 | 1340 [1316–1353], n=5 | 825 [821–835], n=5 | เร็วขึ้น (-49.6%) |
| dev / table.toggle | 834 [808–842], n=5 | 565 [558–581], n=5 | 864 [826–1332], n=5 | 827 [820–838], n=5 | เร็วขึ้น (-32.3%) |
| dev / user.save | 521 [506–555], n=5 | 408 [400–475], n=5 | 840 [829–855], n=5 | 835 [824–842], n=5 | เร็วขึ้น (-21.7%) |
| production / login | 737 [713–784], n=5 | 503 [482–592], n=5 | 741 [716–786], n=5 | 508 [486–593], n=5 | เร็วขึ้น (-31.7%) |
| production / kitchen.start | 485 [483–502], n=5 | 241 [220–245], n=5 | 829 [823–847], n=5 | 318 [313–332], n=5 | เร็วขึ้น (-50.3%) |
| production / kitchen.ready | 472 [468–496], n=5 | 232 [215–244], n=5 | 835 [823–844], n=5 | 318 [312–324], n=5 | เร็วขึ้น (-50.9%) |
| production / orders.payment | 483 [471–489], n=5 | 233 [226–235], n=5 | 838 [819–845], n=5 | 325 [310–333], n=5 | เร็วขึ้น (-51.8%) |
| production / ingredient.save | 989 [973–995], n=5 | 634 [620–637], n=5 | 996 [988–1000], n=5 | 638 [625–655], n=5 | เร็วขึ้น (-35.9%) |
| production / menu.save | 1108 [1065–1130], n=5 | 520 [504–532], n=5 | 1344 [1336–1355], n=5 | 832 [822–836], n=5 | เร็วขึ้น (-53.1%) |
| production / table.toggle | 744 [719–768], n=5 | 482 [462–510], n=5 | 830 [821–834], n=5 | 837 [828–850], n=5 | เร็วขึ้น (-35.2%) |
| production / user.save | 490 [464–503], n=5 | 390 [366–407], n=5 | 832 [822–836], n=5 | 830 [820–833], n=5 | เร็วขึ้น (-20.3%) |

Add-on วัดแยกเฉพาะส่วนที่เดิมไม่มีค่าหลายรอบ โดยใช้ fixture เดียวกัน:

| Mode / Action | A DOM | C DOM | เปลี่ยนแปลง |
|---|---:|---:|---|
| dev / addon.save | 548 [528–567], n=5 | 305 [286–323], n=5 | เร็วขึ้น (-44.3%) |
| dev / mobile.addon.save | 541 [537–545], n=5 | 300 [290–309], n=5 | เร็วขึ้น (-44.7%) |
| production / addon.save | 491 [484–520], n=5 | 258 [255–262], n=5 | เร็วขึ้น (-47.4%) |
| production / mobile.addon.save | 489 [468–493], n=5 | 259 [256–262], n=5 | เร็วขึ้น (-47.0%) |

## Catalog hosted: B → C

รอบ hosted catalog เดิมไม่มี MutationObserver จึงเปรียบเทียบได้เฉพาะ Playwright observed time ห้ามนำมาอ้างเป็น DOM speedup ส่วน A→C DOM มีการวัดซ้ำใน fixture ตารางก่อนหน้า

| Mode / Action | B Playwright | C Playwright | C DOM | เปลี่ยนแปลงของ Playwright |
|---|---:|---:|---:|---|
| dev / ingredient.save | 1100 [961–1810], n=7 | 768 [723–1397], n=7 | ไม่ได้วัด | เร็วขึ้น (-30.2%) |
| dev / menu.save | 1366 [1340–1994], n=7 | 906 [825–1347], n=7 | ไม่ได้วัด | เร็วขึ้น (-33.7%) |
| dev / table.toggle | 1358 [1332–1381], n=7 | 836 [825–1356], n=7 | ไม่ได้วัด | เร็วขึ้น (-38.4%) |
| production / ingredient.save | 1003 [938–1151], n=7 | 793 [674–1232], n=7 | 784 [663–1223], n=7 | เร็วขึ้น (-20.9%) |
| production / menu.save | 1362 [1342–1832], n=7 | 833 [813–1335], n=7 | 714 [680–938], n=7 | เร็วขึ้น (-38.8%) |
| production / table.toggle | 1360 [1319–1395], n=7 | 829 [814–847], n=7 | 639 [581–693], n=7 | เร็วขึ้น (-39.0%) |

ชุด B เดิมมี assertion failure ภายหลังการวัดครบ จึงใช้เฉพาะ action สำเร็จที่บันทึกครบ ไม่อ้างว่าชุด B ทั้งชุดผ่าน เวลา dev ต่างช่วง/compile และ hosted ต่างช่วงมี confounding จาก Auth/network

## แยก Supabase/network, Server Action/API, DOM และ Playwright

Supabase server fetch วัดเริ่ม fetch ถึง response headers: รวมเครือข่ายและเวลาบริการ ไม่แยก SQL/CPU; network union คือช่วงเวลาคำขอที่ทับกันนับครั้งเดียว ตัดที่ DOM สำเร็จ ไม่ใช่ผลบวกคำขอขนาน; Browser→Next วัด request→response headers ซึ่งรวมการรอ Supabase ภายในจนถึงจังหวะ headers แล้ว จึงห้ามนำมาบวกซ้ำ; API handler วัด server handler จริงเฉพาะ users; DOM วัด MutationObserver เมื่อเงื่อนไขสำเร็จใน DOM ไม่ใช่เวลาวาด pixel

Next ส่ง response แบบ stream: headers อาจมาก่อน Server Action/render เสร็จ; requestfinished ไม่ถูกบันทึกครบทุกครั้งก่อน measurement drain จบ จึงไม่ใช้ข้อมูลที่เหลือเพียง 1–5 รอบแทนเวลาจบ Action ตารางใช้ headers ครบ 7 รอบ และไม่อ้างว่าเป็นเวลาทำงาน Server Action ทั้งหมด

| Hosted production Action | Supabase server fetch union | Browser→Next headers | API handler | Click→DOM | DOM→Playwright detection |
|---|---:|---:|---:|---:|---:|
| login | 778 [659–1371], n=7 | 12 [10–52], n=7 | ไม่ได้วัด | 1246 [1173–2508], n=7 | 8 [4–11], n=7 |
| user.save | 535 [509–783], n=7 | 541 [518–793], n=7 | 540 [514–792], n=7 | 546 [522–802], n=7 | 279 [34–314], n=7 |
| ingredient.save | 741 [628–1188], n=7 | 382 [334–517], n=7 | ไม่ได้วัด | 784 [663–1223], n=7 | 11 [8–13], n=7 |
| menu.save | 672 [647–895], n=7 | 387 [328–504], n=7 | ไม่ได้วัด | 714 [680–938], n=7 | 141 [49–459], n=7 |
| table.toggle | 619 [556–663], n=7 | 311 [268–403], n=7 | ไม่ได้วัด | 639 [581–693], n=7 | 194 [149–249], n=7 |

Order actions หลังแก้เรียก Supabase RPC จาก browser โดยตรง ไม่มี Next Server Action/API ใน critical path ตารางนี้เป็น production fixture 100 ms ไม่ใช่ hosted network:

| Action | RPC browser→headers | Reads browser→headers union | Click→DOM | Last read headers→DOM | DOM→Playwright |
|---|---:|---:|---:|---:|---:|
| kitchen.start | 111 [107–116], n=5 | 120 [106–121], n=5 | 241 [220–245], n=5 | 3 [2–4], n=5 | 74 [73–112], n=5 |
| kitchen.ready | 110 [102–115], n=5 | 114 [107–124], n=5 | 232 [215–244], n=5 | 2 [-2–2], n=5 | 86 [75–106], n=5 |
| orders.payment | 109 [107–117], n=5 | 113 [105–117], n=5 | 233 [226–235], n=5 | 2 [1–3], n=5 | 93 [75–100], n=5 |

Login มี browser→Supabase token/profile เพิ่มเติม ไม่รวมใน server-fetch union ข้างบน:

| Request | ระยะเวลาจาก browser |
|---|---:|
| /auth/v1/token | 266 [228–1042], n=7 |
| /rest/v1/profiles | 208 [167–462], n=7 |

Auth variance จาก paired ช่วงเดียวกัน:

| Version / action | Auth getUser server fetch |
|---|---:|
| B / login | 289 [233–440], n=9 |
| B / user.save | 130 [120–211], n=9 |
| C / login | 220 [116–382], n=9 |
| C / user.save | 153 [111–236], n=9 |

A ไม่มี per-fetch server instrumentation จึงไม่สร้างตัวเลข Supabase ย้อนหลังจาก total; การเร็วขึ้นของ Login ใน paired ยังมี Auth variance ปะปน ส่วน users มี handler และ DOM สอดคล้องกัน

## Failure classification / ข้อจำกัด

- Production เดิมถูกพาไป /login ระหว่าง forged-cookie assertion: bug ตัวทดสอบ signOut แบบ global ไป revoke session ของ TEST account เดียวกัน เปลี่ยนเป็น scope local แล้ว final hosted production ผ่าน โดยยังยืนยัน /access-denied ตามเดิม
- Add-on pending เดิม: locator อิงข้อความปุ่มที่เปลี่ยนและ Playwright click รอจน pending จบ แก้ fixture response hold + locator field คงที่; ไม่ใช่หลักฐาน save ระบบเสีย
- Hosted dev retry เดิมคาดข้อความ TEST จาก backend แต่ UI sanitize เป็นภาษาไทย; realtime เดิมหา text ไม่รวม prefix ที่ UI แสดง: bug ตัวทดสอบ
- ครั้งแรกของ final hosted ถูก sandbox ปิด network ก่อน provisioning; รันใหม่ด้วยสิทธิ์ network แล้วผ่าน ไม่จัดเป็น bug ระบบ
- Mobile คือ viewport emulation 375×812 ไม่ใช่อุปกรณ์จริง; production คือ build/start ในเครื่อง ไม่ได้ deploy ไป hosting
- Mobile action อื่นนอกจาก Add-on, menu availability, cancel และหน้าพร้อมเสิร์ฟมี behavioral coverage แต่ไม่ครบ repeated before/after timing แยกทุกปุ่ม จึงไม่ตัดสินเร็วขึ้น/ช้าลงในส่วนที่ไม่มี samples
- ค่า DOM เป็น semantic state ไม่ใช่ paint; Playwright includes polling/wait scheduling; data drain อาจมี prefetch/polling จึงห้ามถือ request count ทั้งหมดเป็น critical path
- ค่า last read headers→DOM บางรอบอยู่ที่ -2 ms จากคนละ clock/event delivery และการปัด setupMs จึงใช้ได้เพียงช่วงโดยประมาณ ไม่ใช่เวลาที่ UI เกิดก่อนข้อมูลจริง
- ห้ามตีความ residual HTTP-minus-Supabase เป็น CPU ล้วน; ไม่มี DB query plan/SQL execution trace และไม่มี network-controlled hosted A/B สำหรับ catalog

## TEST cleanup / ข้อมูลจริง

Final hosted fingerprint inventory 24 รายการ (public tables/views และ Auth users): changes = []; cleanup ตรวจ ownership และลบเฉพาะ ID ที่ลง registry ใน invocation นี้
Paired fingerprint changes = []. ทุกรอบ hosted ที่ provisioning สำเร็จมี fingerprint หลัง cleanup ตรงก่อนเริ่ม ดู results.json ของแต่ละรอบ
Fingerprint ครอบคลุมข้อมูลที่ REST inventory อ่านได้และ Auth users ไม่ได้พิสูจน์ sequence counters, internal Auth session/audit logs หรือ Storage blobs; บัญชี TEST ถูกสร้าง/ล็อกอิน/revoke/ลบตามการทดสอบ

ไม่มีการรัน migration กับฐานข้อมูลจริง ไม่มี reset/Undo/checkout ทับ ไม่มี commit/push; unit SQL tests ใช้ PGlite ชั่วคราวเท่านั้น ไม่มีการแก้ application เพิ่มในรอบสุดท้าย

## Final verification

- lint: PASS (exit 0); log: .test-artifacts/dashboard-performance/final-lint.log
- typescript: PASS (exit 0); log: .test-artifacts/dashboard-performance/final-typescript.log
- unit: PASS (exit 0); log: .test-artifacts/dashboard-performance/final-unit.log
- production-build: PASS (exit 0); log: .test-artifacts/dashboard-performance/final-production-build.log
Lint มี warning เดิม 2 จุดเรื่อง img (MenuClient.tsx และ TableQRCode.tsx), ไม่มี error; unit tests 20/20 ผ่าน

## git diff --stat (tracked files)

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
 web/src/app/dashboard/ready/page.tsx               |  74 +----
 web/src/app/dashboard/tables/TablesClient.tsx      |  21 +-
 web/src/app/dashboard/tables/actions.ts            |   7 +-
 web/src/app/dashboard/users/page.tsx               |   4 +-
 web/src/app/dashboard/users/user-management.tsx    |  38 +--
 web/src/app/login/page.tsx                         |  36 ++-
 web/src/components/addon-controls.tsx              |  23 +-
 web/src/components/addon-editor.tsx                |  29 +-
 web/src/components/catalog-delete-button.tsx       |   2 +-
 web/src/components/logout-button.tsx               |  26 +-
 web/src/components/menu-availability-form.tsx      |   7 +-
 web/src/components/order-realtime-refresh.tsx      |  64 +++-
 web/src/components/update-order-status-button.tsx  |  74 +++--
 web/src/lib/dashboard-auth.ts                      |  39 ++-
 web/src/lib/supabase/admin.ts                      |   4 +-
 web/src/lib/supabase/server.ts                     |   7 +-
 web/tests/catalog-deletion.test.mjs                |   5 +-
 web/tsconfig.json                                  |   2 +-
 32 files changed, 446 insertions(+), 898 deletions(-)
```

## รายชื่อไฟล์ที่แก้และไฟล์ใหม่

รวมงานค้างเดิมทั้งหมด; git diff --stat ไม่รวม untracked

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
 M src/app/dashboard/ready/page.tsx
 M src/app/dashboard/tables/TablesClient.tsx
 M src/app/dashboard/tables/actions.ts
 M src/app/dashboard/users/page.tsx
 M src/app/dashboard/users/user-management.tsx
 M src/app/login/page.tsx
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
?? docs/dashboard-performance-final.md
?? scripts/report-dashboard-final.mjs
?? scripts/report-dashboard-performance.mjs
?? src/app/access-denied/page.tsx
?? src/app/dashboard/error.tsx
?? src/app/dashboard/kitchen/view.tsx
?? src/app/dashboard/orders/view.tsx
?? src/app/dashboard/ready/view.tsx
?? src/components/action-form.tsx
?? src/components/live-order-view.tsx
?? src/components/submit-button.tsx
?? src/lib/admin-users.ts
?? src/lib/order-views.ts
?? src/lib/supabase/timed-fetch.ts
?? src/lib/supabase/verified-profile.ts
?? src/proxy.ts
?? tests/browser-dashboard-performance.mjs
?? tests/helpers/dashboard-live-checks.mjs
?? tests/helpers/dashboard-mock.mjs
?? tests/hosted-action-performance.mjs
?? tests/verified-profile.test.mjs
```
