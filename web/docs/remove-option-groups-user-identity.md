# Custom option-group UI removal and dashboard identity

Checkpoint: `b78d806`, pushed to `origin/feature/admin-workflow-improvements` before edits. Work branch: `feature/remove-option-groups-user-identity`.

## Scope and dependency decision

Only the custom group editor and its four Server Actions were removed. `OptionGroupsEditor.tsx` was the sole consumer of `edit/actions.ts` (`saveOptionGroup`, `saveMenuOption`, `saveOptionIngredient`, `removeOptionIngredient`). The edit page no longer renders the options tab or loads custom option recipes. Old `?tab=options` URLs fall back to menu information; `/menus/[id]/options` redirects to `?tab=info`.

The new-menu page already uses the shared Add-on picker and has no custom group editor. Both create and edit retain shared Add-ons, base recipes and meat-required selection. The edit query now reads only meat-group requirements and Add-on links; group-query failure also blocks saving to avoid overwriting a requirement with a default value.

No database object is removed and no migration is needed. Repository schema/migration and code inspection establishes these shared dependencies:

| Object | Retained consumers / reason |
| --- | --- |
| `menu_option_groups` | `regroup_menu_addons`, `set_menu_addons`, `create_menu_complete`, `save_menu_with_addons`, customer catalog, order validation, stock RPC |
| `menu_options` and group/menu FK | Shared Add-on-to-menu links, `effective_menu_options`, order option IDs |
| `menu_option_ingredients` | Legacy recipe rows and `effective_menu_option_ingredients`; removal would discard recipe data |
| `addons`, `addon_ingredients` | Shared prices, categories and recipes used for orders and stock |
| `order_item_options` and snapshot/FK columns | Orders, Kitchen, Ready, customer order history and reports |
| RLS, RPCs, triggers and grants | Existing catalog access, active-account checks, atomic order/stock behavior and history preservation |

Relevant migration definitions: `20260914170000_shared_addons.sql`, `20260915010000_admin_hard_delete_snapshots.sql`, `20260915093000_addon_categories.sql`, `20260915123000_order_stock_guards.sql`, `20260916161000_admin_catalog_tables.sql`, `20260916162000_complete_menu_creation.sql`, `20260916163000_addon_order.sql`, and active-account migrations. All migration files remain unchanged. This is a repository dependency audit, not a fresh hosted schema/drift audit. The confirmed scope does not require hosted DDL or data deletion.

## Identity

`getVerifiedProfile` reads `profiles.full_name` in the existing profile query. The profile must still match the Auth-verified user ID and pass active-account/role checks. The request-scoped dashboard context passes the name to every Sidebar, including client-rendered Orders/Kitchen/Ready views. No additional profile request, Auth metadata display name or cross-user cache is introduced.

The identity block sits at the bottom of the Sidebar, above logout, with a circular user-avatar icon, the profile name and the original role value (`admin`, `staff`, `kitchen_staff`). It appears once, after navigation, on desktop and mobile. Blank/missing names display `ผู้ใช้งาน`. Names wrap on narrow screens, including long unbroken Thai names. Unauthorized/error pages do not display a previous user's Sidebar.

## Validation

Final result: TypeScript, build, diff check, 83/83 unit/SQL/API tests, Add-on browser checks and the identity/live-dashboard browser suite all PASS. Lint exits 0 with four pre-existing warnings: two `no-img-element` warnings (`MenuClient.tsx`, `TableQRCode.tsx`) and two unused test destructuring fields (`served-order-workflow.test.mjs`). All 20 migration files match the checkpoint.

The first identity browser run reached the cancellation test without a dialog handler and timed out; the test harness now accepts confirmation dialogs, and the complete rerun passes. The shared helper's workspace HMR mutation is skipped because this suite runs an isolated app copy; no HMR verification is claimed here.

- TypeScript: `npx tsc --noEmit`.
- SQL/API/unit regressions: `node --test tests/*.test.mjs` (PGlite databases only); profile source/mismatch checks in `tests/verified-profile.test.mjs`.
- Add-on/customer component browser checks: `node tests/browser-addon-categories.mjs`.
- Identity/menu/access and live dashboard checks: `node tests/browser-user-identity.mjs`; isolated Next app, local HTTP fixtures, simulated Phoenix events and headless Edge. Covers 16 routes × 3 roles × 2 viewport widths, long/missing names, profile failure, old option URLs, preserved selected Add-on/meat-required payload, order actions, retry and Realtime/poll recovery.
- `npm run lint`, `npm run build`, `git diff --check`.

Evidence lives under `.test-artifacts/checkpoint-remove-option-groups/` and `.test-artifacts/user-identity/` (ignored by Git). Browser fixtures exercise the application but do not verify hosted network delivery, hosted schema drift or real mobile hardware. No hosted migration, deployment, merge, or new commit/push is performed.
