# Safe catalog deletion — 2026-09-09

Branch: `feature/menu-option-groups`. Existing Menu Option Groups/order transaction/stock restoration work is retained. No Git commit, push, merge or PR.

## Root cause and remote schema audit

Read installed Next.js mutation/error-handling guides and root AGENTS.md. Inspected working/staged diffs and menu/ingredient pages/actions, order creation/cancellation, customer order display, kitchen and reports.

List pages had no delete control/action. Remote menus and ingredients granted DELETE to authenticated but had no DELETE RLS policy. Menu options had only an available-only SELECT policy; option recipes and ingredient usages had no policies. This explains the service-role workaround in pending option editor code.

All nine relevant tables have RLS enabled. Before this change, anon/authenticated had broad grants (including DELETE/TRUNCATE), except groups: authenticated SELECT/INSERT/UPDATE, no anon grants. Policies permitted authenticated SELECT/INSERT/UPDATE on menus, ingredients, base recipes and groups; base recipes also permitted DELETE. Order items had authenticated/public SELECT; order item options had only public INSERT. Groups checked auth.uid() IS NOT NULL.

| Child → parent | Previous ON DELETE | Final ON DELETE |
|---|---|---|
| menus.category_id → categories | SET NULL | unchanged |
| menu_ingredients.menu_id → menus | CASCADE | unchanged |
| menu_ingredients.ingredient_id → ingredients | CASCADE | **RESTRICT** |
| menu_options.menu_id → menus | CASCADE | unchanged |
| menu_option_groups.menu_id → menus | CASCADE | unchanged |
| menu_options.(group_id, menu_id) → menu_option_groups | NO ACTION | unchanged |
| menu_option_ingredients.menu_option_id → menu_options | CASCADE | unchanged |
| menu_option_ingredients.ingredient_id → ingredients | RESTRICT | unchanged |
| order_items.menu_id → menus | NO ACTION | unchanged |
| order_items.order_id → orders | CASCADE | unchanged |
| order_item_options.menu_option_id → menu_options | SET NULL | **RESTRICT** |
| order_item_options.order_item_id → order_items | CASCADE | unchanged |
| ingredients.category_id → ingredient_categories | SET NULL | unchanged |
| order_ingredient_usages.ingredient_id → ingredients | NO ACTION | unchanged |
| order_ingredient_usages.order_id → orders | CASCADE | unchanged |

Order items store menu_id, quantity, unit_price, subtotal and note, **no menu-name snapshot**. Admin/customer orders, kitchen and reports join menus for names. Order item options snapshot option_name/additional_price/quantity. Stock restoration uses ingredient usages, not current recipes. Changing menu names later can still alter historical display, an existing limitation outside deletion scope.

## Behavior and security

- Unused menus: a single parent DELETE cascades owned recipes/options/groups atomically. Cascades require no extra group/option DELETE grants.
- Used menus/child options: inline refusal, then a separate explicit confirmation sets only is_available=false and updated_at. No new archival column; existing edit UI can reopen menus.
- Ingredients: refuse both recipe types and list database-derived menu/option names and IDs; refuse any usage history. Delete only unused records. Retained ingredients' stock does not change; deletion removes the entire unused ingredient record.
- Server Action calls auth.getUser(), validates a safe positive ID and the actual database name, using the authenticated cookie client. SECURITY INVOKER RPC rechecks names/references under FOR UPDATE locks. Expected errors return Thai state without SQL error details.
- Row locks serialize deletion and conflict with FK reference inserts; RESTRICT/NO ACTION also protects direct API deletion. Lock timeout/FK errors roll the whole call back.
- Native modal requires typing the name, disables controls with “กำลังตรวจสอบ...”, guards rapid clicks synchronously, and offers explicit archive confirmation. Success revalidates Admin/customer paths and refreshes the list; URL messages use encodeURIComponent.
- Existing option editor now uses authenticated client, retaining all option-group rules. Added necessary option CRUD/recipe DELETE/history SELECT policies and identity-sequence grants. No anon/public DELETE policy. Revoked relevant anon DELETE and client TRUNCATE grants.

## Migration and verification

`supabase/migrations/20260909120000_safe_catalog_deletion.sql` replaces two FK behaviors and adds permissions/RPC. No business-row writes run during migration. FK validation briefly locks tables. Applied migrations are not edited by this task; the pre-existing realtime migration diff remains intact.

Remote history already contained all five earlier local migrations. Dry-run listed only this new migration, no seeds or roles.

`npm run test:catalog-deletion`: 15 tests passed using disposable PostgreSQL (PGlite) and mocked actions. Tests never read .env or contact remote. Coverage includes authenticated option-editor recipe writes, unused menu cascade, historical menu refusal/archive, both recipes, usages, unused ingredients, auth, invalid/missing/stale IDs/names, duplicate calls, direct FK bypass, error sanitization, revalidation and unchanged retained order/usage/stock data.

PGlite serializes calls: duplicate tests are **not multi-session contention tests**. Row/FK locking was reviewed, but live concurrent database sessions and authenticated browser interactions were not exercised. No real remote rows were deleted for testing.

`git diff --check`, ESLint, `npx tsc --noEmit`, `npm run build` passed. ESLint has two existing img-element warnings in customer MenuClient and TableQRCode.

Read-only audit scripts: `supabase/audit-safe-deletion.sql` and `supabase/audit-catalog-data-fingerprint.sql`. Customer writes can independently change fingerprints during deployment.

Deployment completed: only migration `20260909120000` was applied. Before/after fingerprints matched exactly for all 10 tables: menus, ingredients, menu_ingredients, menu_options, menu_option_groups, menu_option_ingredients, orders, order_items, order_item_options and order_ingredient_usages. No business data changed.

## Continuation verified 2026-09-10

- Inspected working/staged diffs and retained all existing changes and tests on `feature/menu-option-groups`. The previous session ended with `usage_limit_exceeded` immediately after the successful browser suite on 2026-09-09 at 15:21 UTC; cleanup had not run. The old development log also contained earlier Turbopack HMR errors, distinct from the successful browser run.
- Cleaned the previous run using its recorded TEST IDs. All 17 table row counts and SHA-256 fingerprints matched its pre-test baseline. Kept the original registry and screenshot in ignored `.test-artifacts/`.
- Ran Chrome headless again with a separate registry at `.test-artifacts/resume-20260910/catalog-run.json`. Verified name confirmation, base/option recipe deletion blocks, unused menu cascading deletion, unused ingredient deletion, rapid double click (one submission), historical menu refusal/archive, usage-history ingredient refusal, and expired authentication without an error overlay.
- Placed plain, required-single and multiple-option orders through the customer browser. All returned 201; option snapshots, usage quantities and stock deductions matched. Cancellation restored stock; repeating cancellation returned 409 and did not restore stock again.
- Added API regression cases using the browser request context: missing required option, foreign/duplicate options, excessive group quantity and insufficient stock. Found that a JSON `null` body returned 500. Added request shape checks in `src/app/api/orders/route.ts`; null bodies/items/options, non-array selections and malformed JSON now return 400. All rejected requests left the full database fingerprint unchanged.
- The new run initially stopped at the reproduced null-body bug. After the fix, resumed with `--resume-after-orders`; the remaining checks passed. The registry intentionally retains the initial failure as historical evidence. `CATALOG_TEST_RUN` selects an isolated artifact folder without overwriting earlier runs.
- Cleaned the new run's registered TEST rows and temporary authentication user. All 17 fingerprints again matched the baseline. No schema migration was applied during this continuation. Fingerprints cover table rows, not sequence counters consumed by test inserts.
- Validation: 15/15 local tests passed; `git diff --check`, `npm run lint`, `npx tsc --noEmit`, and `npm run build` passed. ESLint reports the same two existing `no-img-element` warnings in MenuClient and TableQRCode. Browser logs also show the existing smooth-scroll advisory. No browser page errors occurred. Multi-session database contention was not tested.
- No undo, reset, checkout overwrite, commit, push, merge or PR. This continuation only changed the orders route, extended the existing browser test and added this report.

## Files changed by this task

- `src/app/dashboard/catalog-delete-actions.ts`: authenticated deletion/archive action.
- `src/components/catalog-delete-button.tsx`: confirmation modal, pending/error state and archive follow-up.
- `src/lib/catalog-deletion.ts`: strict input parsing and Thai result mapping.
- `src/app/dashboard/menus/page.tsx`: menu delete controls and success state.
- `src/app/dashboard/ingredients/page.tsx`, `IngredientsClient.tsx`: ingredient delete controls and success state.
- `src/app/dashboard/menus/[id]/edit/page.tsx`, `actions.ts`: replace service-role with authenticated option editor access, retaining pending work.
- `supabase/migrations/20260909120000_safe_catalog_deletion.sql`: new migration; applied to linked remote.
- `supabase/audit-safe-deletion.sql`, `supabase/audit-catalog-data-fingerprint.sql`: read-only verification.
- `tests/catalog-deletion.test.mjs`, `package.json`, `package-lock.json`: reproducible local PostgreSQL/action tests.
- `docs/safe-catalog-deletion.md`: audit, behavior, validation and limitations.
