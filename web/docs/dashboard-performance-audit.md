# Dashboard kitchen / action performance audit

> Historical single-run fixture audit. See [the final report](dashboard-performance-final.md) for the completed multi-run, hosted Supabase and DOM-versus-Playwright measurements. The scope statements below describe this earlier fixture-only run.

Audit date: 2026-09-22. Working tree only; no commit or deployment.

## Scope and evidence

The resumed workspace already contained the auth/404 fix, session Proxy, pending/duplicate-submit guards, request-scoped auth/client reuse, parallel catalog reads, incremental order views, user-list updates after successful API responses, and retry controls. The saved dev suite passed, but both saved production runs failed while observing Add-on pending state; the generated report was missing.

This continuation makes the Add-on pending assertion deterministic: it keeps the stable form-field locator, briefly delays the fixture response, and dispatches same-task duplicate clicks without waiting for Server Action navigation to finish. The saved failure page already showed successful saving, so the timeout alone was not evidence of a production UI defect. It also removes report logic that could substitute a partial rerun for a failed full run. Both full suites are rerun, and the final report uses their actual outcomes. Existing retry, mobile login, cancellation, realtime and role coverage is retained.

## 404 cause

`src/app/dashboard/kitchen/page.tsx` exists before and after. The original `requireDashboardContext` called `notFound()` for profile query errors, missing/inactive profiles and disallowed roles. Injecting profile HTTP 503 against the baseline reproduces “404 / This page could not be found.” The fixed code returns a retryable Thai error for unavailable Auth/profile, redirects absent sessions to login, and unauthorized/inactive accounts to `/access-denied`. Admin and kitchen_staff are allowed. The only remaining `notFound()` calls are missing menu/ingredient edit records, after checking query errors.

The preserved `original-development.log` does not identify the exact failing profile response or role for the user’s historical incident. The faulty code path is reproduced; the historical upstream trigger cannot be established from those logs. A missing route is not supported by the checked source/build evidence. Proxy persists refreshed cookies; server authorization still uses getUser and the current profile, never unverified session claims.

The historical log contains 72 getUser timings (84–623 ms, mean 166 ms), 71 profile timings (75–360 ms, mean 113 ms), and 64 combined auth timings (194–755 ms, mean 306 ms). It contains no 404 line. This demonstrates meaningful repeated authorization cost, but does not itself tie each historical timing to a specific click.

## Measurement method and limits

Headless Microsoft Edge; desktop 1440×1000 and mobile viewport 375×812. `next dev` and `next build` + `next start`. Supabase Auth/PostgREST/Realtime are isolated HTTP/WebSocket fixtures with 100 ms delay per HTTP operation; no hosted database writes, migrations, commits or pushes. Mobile is viewport emulation, not a physical device. These measurements diagnose application roundtrips, not hosted database query execution plans or production network latency. Each action is one observed sample, not a percentile benchmark. Baseline artifacts come from the earlier run and are not newly recreated here; cold compilation and machine load can affect dev comparisons.

Total time starts at the captured DOM click and ends when the action’s expected UI/navigation condition is observed. HTTP start/response times exclude Playwright click setup using setupMs. Backend durations are fixture request durations, including simulated latency; sums overlap for parallel requests and MUST NOT be read as elapsed wall time. Direct browser RPCs have no Next Server Action/API stage. Raw results retain individual request paths, starts, responses, and backend timestamps. New after-results also record clickEpochMs. `server.log` contains per-Supabase-call and auth timings; the users API also logs total handler duration. Response time is not a precise Server Action CPU/SQL breakdown.

Request collection includes a 400 ms drain period after the UI condition; background polling/prefetch can therefore appear in counts and spans after the measured click-to-result time. Login finishes measurement at destination URL navigation, while order/form actions wait for their expected UI state. Failed-backend timings are excluded from the successful-action comparison.

## Before → after click-to-result (ms)

| Action | Dev before | Dev after | Production before | Production after |
| --- | ---: | ---: | ---: | ---: |
| login | 2600 | 1018 | 1031 | 1078 |
| kitchen.start | 856 | 323 | 894 | 346 |
| kitchen.ready | 861 | 329 | 864 | 337 |
| orders.payment | 867 | 368 | 881 | 351 |
| ingredient.save | 2041 | 1170 | 1182 | 1146 |
| menu.save | 1898 | 1339 | 1404 | 1378 |
| table.toggle | 1429 | 836 | 946 | 871 |
| user.save | 856 | 849 | 892 | 906 |
| mobile.kitchen.start | 837 | 318 | not measured | 316 |
| mobile.kitchen.ready | 878 | 346 | not measured | 337 |
| mobile.orders.payment | 875 | 376 | not measured | 331 |
| mobile.ingredient.save | 1360 | 2227 | not measured | 897 |
| mobile.menu.save | 1902 | 1351 | not measured | 830 |
| mobile.table.toggle | 1355 | 849 | not measured | 828 |
| mobile.user.password | 835 | 860 | not measured | 844 |
| mobile.login | not measured | 806 | not measured | 638 |

## After action stages and query counts

HTTP spans below are relative to click; backend total is summed request time, not elapsed time. “View read” includes affected data only for order actions, and server rerender/navigation for form actions. Remaining catalog revalidation is intentional to keep recipes, availability and list views consistent.

### dev

| Action | Pending ms | HTTP spans start→response ms | Auth / profile calls | Backend sum ms |
| --- | ---: | --- | ---: | ---: |
| login | 3 | POST /auth/v1/token: 6→133<br>GET /rest/v1/profiles: 139→256<br>GET /dashboard: 264→419 | 1 / 2 | 1135 |
| kitchen.start | 2 | POST /rest/v1/rpc/advance_order_status: 6→121<br>GET /rest/v1/orders: 127→247<br>GET /rest/v1/profiles: 128→248 | 0 / 1 | 425 |
| kitchen.ready | 2 | POST /rest/v1/rpc/advance_order_status: 5→114<br>GET /rest/v1/orders: 118→233<br>GET /rest/v1/profiles: 119→233 | 0 / 1 | 312 |
| orders.payment | 2 | POST /rest/v1/rpc/complete_order_payment: 4→125<br>GET /rest/v1/orders: 131→252<br>GET /rest/v1/profiles: 132→254 | 0 / 1 | 440 |
| ingredient.save | 2 | POST /dashboard/ingredients/1/edit: 7→668<br>POST /__nextjs_original-stack-frames: 1299→1317 | 2 / 2 | 990 |
| menu.save | 2 | POST /dashboard/menus/1/edit: 5→456 | 2 / 2 | 1248 |
| table.toggle | 3 | POST /dashboard/tables: 4→423 | 2 / 2 | 645 |
| user.save | 5 | PATCH /api/admin/users: 6→640 | 1 / 2 | 432 |
| mobile.kitchen.start | 1 | POST /rest/v1/rpc/advance_order_status: 4→115<br>GET /rest/v1/orders: 117→223<br>GET /rest/v1/profiles: 117→224 | 0 / 1 | 421 |
| mobile.kitchen.ready | 2 | POST /rest/v1/rpc/advance_order_status: 12→129<br>GET /rest/v1/orders: 131→242<br>GET /rest/v1/profiles: 132→243 | 0 / 1 | 315 |
| mobile.orders.payment | 3 | POST /rest/v1/rpc/complete_order_payment: 8→130<br>GET /rest/v1/orders: 135→252<br>GET /rest/v1/profiles: 136→252 | 0 / 1 | 429 |
| mobile.ingredient.save | 3 | POST /dashboard/ingredients/1/edit: 7→617<br>POST /__nextjs_original-stack-frames: 2345→2351 | 2 / 2 | 999 |
| mobile.menu.save | 2 | POST /dashboard/menus/1/edit: 8→476 | 2 / 2 | 1261 |
| mobile.table.toggle | 3 | POST /dashboard/tables: 5→438 | 2 / 2 | 651 |
| mobile.user.password | 11 | PATCH /api/admin/users: 14→432 | 1 / 1 | 329 |
| mobile.login | 4 | POST /auth/v1/token: 6→123<br>GET /rest/v1/profiles: 128→248<br>GET /dashboard: 253→304 | 1 / 2 | 1040 |

Run status: PASS

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
- dev source edit triggers Fast Refresh; kitchen survives HMR and reload
- isolated fixture actions complete

### production

| Action | Pending ms | HTTP spans start→response ms | Auth / profile calls | Backend sum ms |
| --- | ---: | --- | ---: | ---: |
| login | 4 | POST /auth/v1/token: 18→147<br>GET /rest/v1/profiles: 159→271<br>GET /dashboard: 273→446<br>GET /dashboard: 1108→1153<br>GET /dashboard/orders: 1108→1162<br>GET /dashboard/kitchen: 1109→1171<br>GET /dashboard/ready: 1109→1178<br>GET /dashboard/menus: 1181→1243<br>GET /dashboard/ingredients: 1183→1251<br>GET /dashboard/tables: 1184→1259<br>GET /dashboard/addons: 1187→1268<br>GET /dashboard/reports: 1279→1337<br>GET /dashboard/users: 1280→1345<br>GET /dashboard/orders: 1284→1348<br>GET /dashboard/kitchen: 1286→1352<br>GET /dashboard/ready: 1355→1388<br>GET /dashboard/menus: 1356→1393<br>GET /dashboard/ingredients: 1360→1398<br>GET /dashboard/tables: 1360→1402<br>GET /dashboard/addons: 1408→1432<br>GET /dashboard/reports: 1410→1434<br>GET /dashboard/users: 1411→1445 | 1 / 2 | 1084 |
| kitchen.start | 2 | POST /rest/v1/rpc/advance_order_status: 12→124<br>GET /rest/v1/orders: 132→251<br>GET /rest/v1/profiles: 133→252 | 0 / 1 | 434 |
| kitchen.ready | 1 | POST /rest/v1/rpc/advance_order_status: 4→115<br>GET /rest/v1/orders: 119→237<br>GET /rest/v1/profiles: 121→238 | 0 / 1 | 322 |
| orders.payment | 2 | POST /rest/v1/rpc/complete_order_payment: 6→118<br>GET /rest/v1/orders: 128→242<br>GET /rest/v1/profiles: 129→242 | 0 / 1 | 415 |
| ingredient.save | 3 | POST /dashboard/ingredients/1/edit: 11→692<br>GET /dashboard: 1000→1040<br>GET /dashboard/orders: 1001→1040<br>GET /dashboard/kitchen: 1002→1042<br>GET /dashboard/ready: 1003→1046<br>GET /dashboard/menus: 1059→1081<br>GET /dashboard/tables: 1060→1097<br>GET /dashboard/addons: 1061→1108<br>GET /dashboard/reports: 1062→1108<br>GET /dashboard/users: 1114→1172<br>GET /dashboard: 1115→1172<br>GET /dashboard/orders: 1116→1175<br>GET /dashboard/kitchen: 1117→1176<br>GET /dashboard/ingredients/categories: 1175→1194<br>GET /dashboard/ingredients/new: 1179→1211<br>GET /dashboard/ingredients/1/edit: 1183→1214<br>GET /dashboard/ready: 1184→1222<br>GET /dashboard/menus: 1224→1261<br>GET /dashboard/tables: 1226→1268<br>GET /dashboard/addons: 1227→1276<br>GET /dashboard/reports: 1232→1292<br>GET /dashboard/users: 1328→1367<br>GET /dashboard/ingredients/categories: 1333→1371<br>GET /dashboard/ingredients/new: 1334→1377<br>GET /dashboard/ingredients/1/edit: 1335→1384 | 2 / 2 | 1017 |
| menu.save | 5 | POST /dashboard/menus/1/edit: 11→437<br>GET /dashboard/ready: 758→790<br>GET /dashboard/menus: 760→792<br>GET /dashboard/ingredients: 760→799<br>GET /dashboard/tables: 763→803<br>GET /dashboard/addons: 811→856<br>GET /dashboard/reports: 815→858<br>GET /dashboard/users: 815→858<br>GET /dashboard/ready: 820→871<br>GET /dashboard/menus: 871→946<br>GET /dashboard/ingredients: 893→946<br>GET /dashboard/tables: 893→947<br>GET /dashboard/addons: 924→971<br>GET /dashboard: 1003→1037<br>GET /dashboard/orders: 1004→1037<br>GET /dashboard/kitchen: 1007→1041<br>GET /dashboard/menus/1/edit: 1008→1047<br>GET /dashboard/menus/1/edit: 1055→1081<br>GET /dashboard/menus/1/edit: 1056→1088<br>GET /dashboard: 1058→1089<br>GET /dashboard/orders: 1059→1095<br>GET /dashboard/kitchen: 1108→1133<br>GET /dashboard/reports: 1109→1139<br>GET /dashboard/users: 1109→1145 | 2 / 2 | 1248 |
| table.toggle | 3 | POST /dashboard/tables: 6→398<br>GET /dashboard: 706→737<br>GET /dashboard/orders: 706→737<br>GET /dashboard/kitchen: 706→737<br>GET /dashboard/ready: 707→737<br>GET /dashboard/menus: 737→759<br>GET /dashboard/ingredients: 747→772<br>GET /dashboard/addons: 749→809<br>GET /dashboard/reports: 750→821<br>GET /dashboard/users: 830→894<br>GET /dashboard/addons: 884→914<br>GET /dashboard/users: 890→925<br>GET /table/id-1: 894→930<br>GET /dashboard: 897→948<br>GET /dashboard/orders: 943→978<br>GET /dashboard/kitchen: 945→982<br>GET /dashboard/ready: 949→991<br>GET /dashboard/menus: 954→997<br>GET /dashboard/ingredients: 1002→1025<br>GET /dashboard/addons: 1005→1039<br>GET /dashboard/reports: 1008→1043<br>GET /dashboard/users: 1010→1049<br>GET /table/id-1: 1052→1065 | 2 / 2 | 647 |
| user.save | 6 | PATCH /api/admin/users: 12→719 | 1 / 2 | 439 |
| mobile.kitchen.start | 1 | POST /rest/v1/rpc/advance_order_status: 5→116<br>GET /rest/v1/orders: 120→245<br>GET /rest/v1/profiles: 121→246 | 0 / 1 | 325 |
| mobile.kitchen.ready | 1 | POST /rest/v1/rpc/advance_order_status: 4→125<br>GET /rest/v1/orders: 134→242<br>GET /rest/v1/profiles: 135→242 | 0 / 1 | 311 |
| mobile.orders.payment | 1 | POST /rest/v1/rpc/complete_order_payment: 3→111<br>GET /rest/v1/orders: 114→224<br>GET /rest/v1/profiles: 115→224 | 0 / 1 | 305 |
| mobile.ingredient.save | 1 | POST /dashboard/ingredients/1/edit: 3→511<br>GET /dashboard/ingredients/categories: 900→914<br>GET /dashboard/ingredients/new: 901→913<br>GET /dashboard: 912→920<br>GET /dashboard/orders: 913→923<br>GET /dashboard/kitchen: 915→930<br>GET /dashboard/ready: 915→930<br>GET /dashboard: 930→944<br>GET /dashboard/orders: 931→945<br>GET /dashboard/kitchen: 931→945<br>GET /dashboard/ready: 932→947<br>GET /dashboard/ingredients/categories: 948→956<br>GET /dashboard/ingredients/new: 949→959 | 2 / 2 | 854 |
| mobile.menu.save | 2 | POST /dashboard/menus/1/edit: 6→391<br>GET /dashboard/menus/1/edit: 909→929<br>GET /dashboard/menus/1/edit: 910→932<br>GET /dashboard/menus/1/edit: 911→933<br>GET /dashboard/menus: 925→940<br>GET /dashboard/menus: 941→946<br>GET /dashboard: 955→966<br>GET /dashboard/orders: 956→967<br>GET /dashboard/kitchen: 956→968<br>GET /dashboard/ready: 957→973<br>GET /dashboard: 974→983<br>GET /dashboard/orders: 975→984<br>GET /dashboard/kitchen: 975→989<br>GET /dashboard/ready: 976→994 | 2 / 2 | 1333 |
| mobile.table.toggle | 1 | POST /dashboard/tables: 3→369<br>GET /table/id-1: 13→19<br>GET /table/id-1: 20→26<br>GET /table/id-1: 684→694<br>GET /table/id-1: 696→714 | 2 / 2 | 645 |
| mobile.user.password | 2 | PATCH /api/admin/users: 9→399 | 1 / 1 | 322 |
| mobile.login | 3 | POST /auth/v1/token: 8→122<br>GET /rest/v1/profiles: 125→245<br>GET /dashboard: 247→259<br>GET /dashboard: 638→650<br>GET /dashboard/orders: 640→652<br>GET /dashboard/kitchen: 640→655<br>GET /dashboard/ready: 641→659<br>GET /dashboard/orders: 658→669<br>GET /dashboard/kitchen: 659→671<br>GET /dashboard/ready: 659→672 | 1 / 2 | 1056 |

Run status: PASS

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

## Why actions were slow and what remains intentional

- Orders previously wrote via RPC then refreshed the full server route (Auth + profile + view data); they now reload only the affected view with current-profile/data reads in parallel. Realtime bursts are coalesced and events during reads replayed. Unchanged fallback polls do not reload Auth/the full page. Focus/reconnect still refreshes current data and permissions.
- Login previously combined navigation and refresh. The redundant refresh is removed; the server still verifies identity and permissions at the destination. Catalog forms keep necessary validation and revalidation; independent initial reads run in parallel.
- User management previously refetched the full Auth user/profile list after writes. Successful writes update the local row after acknowledgement; failures reread to reconcile partially completed operations. Initial Auth list/profile reads run in parallel. These are acknowledged updates, not optimistic payment/stock/account mutations.
- Request-local React cache avoids repeated client/identity work within a render. It is not a cross-request permission cache and does not remove authorization from actions or APIs. Server Actions can rerender after revalidatePath, so a second guard during that render is expected.
- Database transactions, validation, RLS and role checks were not removed. No speculative success is displayed for stock, payment, cancellation or user administration. Live fixture tests do not prove hosted RLS/transaction execution; migration-backed SQL suites were not run in this continuation to honor the no-migration constraint.

Validation: production build/TypeScript passed; standalone `tsc --noEmit` passed; ESLint passed with two existing next/no-img-element warnings (customer MenuClient and TableQRCode); Bangkok date unit test passed. Runtime coverage listed above is representative of the named workflows, not exhaustive coverage of every catalog option/category/delete variant. Missing baseline action timings are labeled “not measured”; no numbers are invented.

## Reproduce

Run sequentially (both use ports 4400/4401):

```text
node tests/browser-dashboard-performance.mjs after dev
node tests/browser-dashboard-performance.mjs after production
node scripts/report-dashboard-performance.mjs
npm run lint
npx tsc --noEmit
node --test tests/bangkok-date.test.mjs
```

Artifacts: `.test-artifacts/dashboard-performance/{before,after}-{dev,production}/results.json`, `server.log`, `kitchen-mobile.png`. The runner overrides Supabase URL/keys with local fixtures and blocks external browser HTTP traffic. It does not load real test credentials. Production build output in `.next` is for the local fixture URL; rebuild normally before any real deployment.
