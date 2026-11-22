begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- Unschedule cron job if pg_cron is present
do $$
begin
  perform cron.unschedule('smart-order-daily-order-reset');
exception when others then
  null;
end $$;

drop function if exists public.reset_daily_order_sequence();

commit;
