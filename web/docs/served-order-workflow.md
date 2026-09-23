# Serve before payment

Flow: `confirmed → preparing → ready → served → completed`.

The audited baseline already permits `served` in `orders_status_check`. A read-only check of the hosted PostgREST schema on 2026-09-23 confirmed that orders has neither `served_at` nor `served_by`, and exposes only the existing advance/payment RPCs.

Forward migration: `supabase/migrations/20260923100000_served_order_payment.sql`.
It adds audit fields to the existing order, introduces `serve_order(uuid)`, and changes the existing payment RPC to accept only `served`. Existing orders/payments and historical timestamps are not backfilled or duplicated. Legacy served rows remain payable; their missing service time is shown explicitly.

`serve_order` locks the order and records the first active Staff/Admin confirmation. Repeated confirmation preserves that audit, including after payment. Payment uses the same row lock and refuses duplicate payments. Kitchen Staff can advance only confirmed/preparing; serving/payment remain restricted at the database boundary. Inactive, missing-profile and anonymous callers cannot serve.

Ready cards disappear immediately after a successful confirmation, before the refresh finishes. Dashboard subscriptions observe all order updates, so ready cards disappear and served cards arrive across open views. The customer's private-session endpoint already includes nonterminal statuses; its existing polling displays the new served message.

Validation completed locally:

- `npx tsc --noEmit` and ESLint on changed application files.
- `node --test tests/admin-workflow.test.mjs tests/order-stock-guards.test.mjs tests/served-order-workflow.test.mjs`: 25 tests passed. The new test applies the new migration after the existing active-account migrations and checks both dining types, roles, invalid/early payment, audit preservation, duplicate requests, and historical data preservation.
- `node tests/browser-served-orders.mjs`: isolated application copy, HTTP fixtures and Phoenix WebSocket fixtures. Staff/Admin × dine-in/takeaway, double-click serve/payment, Kitchen page restrictions, cross-view Realtime and customer message passed.

Limits: browser Realtime uses simulated events, not the hosted Supabase publication. PGlite queues SQL requests; row-lock contention across independent hosted connections still needs post-migration verification. Existing admin/stock tests cover their original migration versions; the new served test covers the changed payment rule.

Do not deploy the updated UI before the migration: the order query now selects `served_at`. Hosted migration execution requires the user's explicit approval. Before applying, check linked migration history and confirm only the intended pending migration will run. After approval/application, verify real Realtime, role JWTs and simultaneous requests on disposable test orders. No hosted writes or migration execution have been performed as part of this change.
