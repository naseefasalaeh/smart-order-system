begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- Allow order numbers to restart daily by dropping global uniqueness constraint
alter table public.orders drop constraint if exists orders_order_number_key;
create index if not exists idx_orders_order_number on public.orders(order_number);

-- Reset function: sets the orders.order_number sequence back to 1
create or replace function public.reset_daily_order_sequence()
returns void language plpgsql security definer set search_path='' as $$
declare
  seq text;
begin
  seq := pg_get_serial_sequence('public.orders', 'order_number');
  if seq is not null then
    perform setval(seq, 1, false);
  end if;
end $$;

revoke all on function public.reset_daily_order_sequence() from public, anon, authenticated;
grant execute on function public.reset_daily_order_sequence() to service_role;

-- Schedule automatic reset at midnight Asia/Bangkok (17:00 UTC) via pg_cron
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('smart-order-daily-order-reset', '0 17 * * *',
  $$select public.reset_daily_order_sequence();$$);

commit;
