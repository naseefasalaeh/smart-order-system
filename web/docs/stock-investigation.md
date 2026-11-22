# Stock investigation — 15 September 2026

## Root cause and evidence

The reproduced failure is a stale Ingredients page. The database transaction deducts stock and writes usage, but the open page originally had no live refresh. This affected the displayed stock of both base ingredients and addons.

Read-only inspection of the latest real orders:

- #80 `c4b7e561-3205-478f-ae1d-4f6d22bead61`: completed, stock_deducted=true. Usage: chicken 100g, basil 20g, egg 1, cooked rice 150g, beef 100g.
- #81 `5233df96-7f5a-437d-96be-c52791a64471`: completed, stock_deducted=true. Usage: egg 1, beef 100g, galangal 10g.
- Both usage sets exactly match their current base recipes plus effective Shared Add-on recipes and order quantities. There is no captured stock-before snapshot for those real orders, so their flags/usages alone do not independently prove their historical stock delta. No real order or stock value was edited.

Controlled Browser reproduction before changes: a TEST base recipe of 100g changed DB stock from 10,000 to 9,900, returned stock_deducted=true and recorded usage=100. The open Ingredients page still showed 10,000 after 3 seconds; reload showed 9,900.

Evidence files (Git-ignored):
- `.test-artifacts/stock-investigation/latest-orders.json`: latest real orders, items/options, both recipe sources, addon links and stock.
- `.test-artifacts/stock-investigation/remote-rpcs.json` and extracted SQL: deployed RPCs/triggers.
- `.test-artifacts/stock-live/before-fix.json`: Browser/DB mismatch before changes.
- `.test-artifacts/stock-guards-final/after-fix.json` and screenshot: after-change checks.
- `.test-artifacts/stock-investigation/verification.json`: formula comparison for #80/#81 and unchanged original data.

## Flow inspected

Current Orders API calls `create_order_with_stock`, not a function named `create_order_transaction` or legacy `process_order_stock`. Its `p_items` contains menu_id, quantity, unit_price, subtotal, note, and options with menu_option_id, option_name, additional_price and quantity. `p_required_items` uses ingredient_id and quantity.

The API reads base recipes from menu_ingredients and all option categories from effective_menu_option_ingredients. The view resolves addon_id to addon_ingredients; retained local recipe rows are not charged again. It multiplies base × dish quantity and option recipe × option quantity × dish quantity, summing by ingredient ID.

The deployed SQL independently recalculates the same requirements under catalog locks, then calls create_order_with_stock_internal. That function atomically updates ingredients with `stock_quantity >= required`, writes order_ingredient_usages, and sets stock_deducted=true. Insufficient stock raises an exception that rolls back the order/session/partial deduction. Cancellation restores stored usages, not current recipes, once.

## Changes

- Ingredients page reuses OrderRealtimeRefresh, with a 5-second polling backstop, focus/visibility/online refresh, and order events. A first attempt relying only on realtime reproduced a missed refresh, so subscribed stock views keep polling as well. Display updates are eventual (up to about 5 seconds plus request time), not a synchronous UI promise.
- API explicitly rejects missing base/option recipes before creating orders.
- Browser uses an immediate ref lock against same-tick double clicks and retains a request UUID for retries of the unchanged payload while the page remains mounted.
- API returns the existing order for a matching request ID/fingerprint, rejects changed payload reuse, and does not re-deduct.
- Applied transaction migration `20260915123000_order_stock_guards.sql`: nullable order request ID/fingerprint, unique request index, advisory locks for same-request and first-session creation, validation of nonempty positive ingredient requirements, and a postcondition that stock_deducted=true and recorded usages exactly equal recalculated requirements. Any failed postcondition rolls back the entire transaction. No direct stock adjustment was performed.
- Legacy callers without requestId remain compatible; retry deduplication requires the new request ID. Browser reload starts a new in-memory request identity.

## Verification

Actual Supabase / production Browser:

1. Base only: 100g rice; DB and open page reduce and restore without reload.
2. Base + meat: rice 100g + beef 150g.
3. Base + meat + egg + extra rice: rice 150g + beef 150g + egg 1.
4. Two dishes, two eggs and three rice portions per dish: rice 500g + beef 300g + eggs 4. Base/addon rice sums into one usage.
5. Every success has stock_deducted=true and exact usage and stock deltas; every cancellation restores original values once; repeat cancellation rejected.
6. Concurrent identical requests return one order and one deduction; same key with changed payload rejected.
7. Concurrent first-use requests with the same session token both complete without a session creation conflict.
8. Two requests for the last 100g: one succeeds, one returns 409; only one order exists; winner cancellation restores 100g.
9. Missing base and addon recipes rejected without orders.
10. Actual customer double click sends one POST; captured payload includes requestId; retry returns the same order.

Cleanup removed all registered TEST menus, ingredients, addons, orders, sessions, payments, table and temporary Admin account. All 19 table fingerprints match each pre-test baseline, independently verified with no TEST rows/accounts left. Before/after migration backups:
- `.test-artifacts/catalog-backup-2026-09-15T05-08-21-463Z/`
- `.test-artifacts/catalog-backup-2026-09-15T05-15-16-058Z/`

All original columns and row counts across these 19 tables are identical; only nullable request columns were added to existing orders. Migration history matches all 11 local versions. No repair/reset/Undo/merge/commit/push.

## Current production baseline — 16 September 2026

Orders #94 and #95 are real, completed orders. Both have `stock_deducted=true`; #94 has two items and four ingredient usage rows, and #95 has one item and two usage rows. Their orders, related history, ingredient stock, and usage rows were retained as recorded in the database. No order, stock, or usage row was edited during this check.

The read-only backup at `.test-artifacts/catalog-backup-2026-09-16T13-09-16-767Z/` is the new baseline. Its 19 table counts and SHA-256 fingerprints are recorded in `docs/current-db-baseline-2026-09-16.json`. A second read-only backup at `.test-artifacts/catalog-backup-2026-09-16T13-10-08-698Z/` matched all 19 counts and fingerprints, including `orders`, `ingredients`, and `order_ingredient_usages`. The backups contain customer data and remain Git-ignored; only the hash manifest is tracked.

Local verification: 67 tests passed; TypeScript, ESLint (two pre-existing img warnings), diff check and production build passed. `npm run test:order-stock` runs the dedicated SQL/API regression suite. Live test is explicitly gated by `--remote-test` and a unique STOCK_BROWSER_RUN; tests create isolated stock via inserts and never repair real stock with UPDATE.
