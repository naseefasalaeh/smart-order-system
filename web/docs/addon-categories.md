# Shared Add-on categories

Apply `20260915093000_addon_categories.sql` after all preceding migrations. Applied to connected Supabase on 2026-09-15 after verifying nine applied migration versions and a dry-run showing only this pending file.

The existing addons table stores meat, topping and portion categories. Existing menu_options IDs remain intact and reference shared addons. Existing menu_option_groups drive customer radio/checkbox controls and server validation. Orders, prices, stock deduction and cancellation keep the existing transaction implementation.

Backfill maps the seven requested names. Unknown existing shared add-ons default to topping and can be reclassified in Admin. Equivalent local options are connected to central recipes. Conflicting prices, recipes or non-meat quantity limits abort the entire transaction, except the explicitly approved seafood consolidation: the existing shared +15 baht recipe with shrimp/squid at 30g each replaces the local +20 baht / 80g each recipe for new orders. Existing order snapshots remain unchanged. No historical order or recipe row is deleted.

Menu forms preserve selected disabled links, prohibit selecting disabled new links, and save the required-meat setting atomically. Changing a central category moves existing links into the corresponding groups.

Verification:
- `npm run test:addon-categories`: migration, API, prices, recipes, stock, order snapshots and Kitchen/payment transitions in disposable PostgreSQL.
- `npm run test:browser-addon-categories`: real React components in headless Edge, isolated from live data; Admin sections, mandatory category, disabled links, customer radios and checkboxes. Server Actions are stubbed in this component test.
- Existing catalog and hard-delete regression suites, TypeScript and scoped ESLint.

## Live verification — 15 September 2026

- Pre-migration backup with SHA-256 for all 19 tables: `.test-artifacts/catalog-backup-2026-09-15T04-00-49-220Z/`.
- Post-migration baseline: `.test-artifacts/catalog-backup-2026-09-15T04-04-31-683Z/`.
- All 15 non-catalog-link tables match exactly, including original recipes, stock and all order/payment/session/profile/review data. All 73 original option IDs and original fields remain intact except group/addon links. Existing shared addon values and recipes remain intact.
- Backfill verified for all seven requested names, plus existing เนื้อไก่ classified as meat. Eight central addons total. Groups: 22 → 33; central addons: 6 → 8; central recipe links: 7 → 9. These are intended migration changes, so cleanup is compared to the post-migration baseline.
- Browser script: `tests/browser-addon-categories-live.mjs`, using production Next server and actual Supabase. Registry and screenshots: `.test-artifacts/addon-categories-live/` (ignored by Git).
- Passed Admin search/filter for each category, price/availability edits, disabled-link preservation, blocked new disabled links, per-menu checkboxes, new-menu creation and inline categorized addon creation.
- Passed customer required radio selection, multiple meat rejection, separate topping/portion checkboxes, optional meat, and live checkout. Seafood + egg + extra rice: 85 baht, rice 150g + egg 1 + shrimp 30g + squid 30g in isolated TEST recipes.
- Kitchen confirmed → preparing → ready, Orders payment completed without double stock deduction. Updating central egg price left paid snapshots unchanged. A subsequent 84 baht order with two eggs used the new price, and cancellation restored exact stock once; repeat cancellation rejected.
- Browser retries fixed test selectors for plain-text category labels and menu names containing quantities. Initial sandbox server could not validate Supabase sessions; final run used a network-enabled local production server. No application code workaround was needed.
- Cleanup removed registered TEST catalog, orders, payments, sessions, ingredients, table and auth/profile records. All 19 pre-test fingerprints match after cleanup; independent verification found no TEST rows/accounts remaining.
- Local SQL/API suites: 51 passing tests. TypeScript, diff check and production build passed. ESLint has only the two existing image warnings.
- No migration history repair, reset, Undo, merge, commit or push performed.
