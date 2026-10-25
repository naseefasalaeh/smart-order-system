begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
create extension if not exists pg_cron with schema pg_catalog;
-- Due times are stored as timestamptz computed explicitly in Asia/Bangkok.
-- A named job is updated in place, never duplicated on deployment.
select cron.schedule('smart-order-ingredient-stock-reset','* * * * *',
  $$select public.run_ingredient_stock_resets();$$);
commit;
