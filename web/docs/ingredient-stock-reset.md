# Ingredient stock reset

Each ingredient defaults to carry-forward (`reset_every_days = null`). Admins can configure a daily or 1–3650 day cadence, anchored to a start date and wall time in `Asia/Bangkok`. Saving a past start date selects the next future occurrence; it does not immediately discard stock.

The named Supabase pg_cron job `smart-order-ingredient-stock-reset` runs every minute without a browser or web server. Due rows are locked with `FOR UPDATE SKIP LOCKED`. Each reset sets available stock to zero and moves a single cursor to the next future occurrence. Missed periods collapse into one reset. There is no stock balance history table or stock movement entry for a reset; `reset_last_at` and `reset_next_at` are scheduling state only.

Orders already deduct their ingredient usage at creation. Resetting available stock leaves order usage, reservations, dishes, statuses and payments intact. Cancelling an outstanding order still returns its deducted usage once. A stock trigger rejects deductions from an expired balance before cron catches up, and preserves only returned usage if cancellation happens first.

Admin saves use `save_ingredient`, the same ingredient row lock and an expected `updated_at`. It applies any due reset before an explicit replacement balance. An unchanged stock field is omitted, so metadata-only edits cannot restore expired stock. Stale forms must reload. Schedule and stock updates cannot bypass this through authenticated table updates; existing admin metadata/category maintenance remains available under RLS.

Validation:

- `node --test tests/ingredient-reset-input.test.mjs tests/ingredient-stock-reset.test.mjs`
- PowerShell: `$env:ORDER_BROWSER_SUITE='stock-reset'; node tests/browser-served-orders.mjs`
- PGlite tests the actual stock migration. Because PGlite has no background worker extension, its scheduler test uses a cron catalog stub; verify the installed job and successful runs separately on hosted Supabase.

Scheduling follows the [Supabase Cron SQL interface](https://supabase.com/docs/guides/cron/quickstart).
