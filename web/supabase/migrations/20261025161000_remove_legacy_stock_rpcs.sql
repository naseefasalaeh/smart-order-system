-- Current order API uses create_order_with_stock. These legacy endpoints have
-- no application, function, policy, trigger, view, FK or cron caller in the audit.
-- Rollback: supabase/rollback/20261025161000_restore_legacy_stock_rpcs.sql.
begin;
do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname not in ('pg_catalog','information_schema') and p.prokind='f'
      and p.oid not in ('public.deduct_ingredient_stock(jsonb)'::regprocedure,
        'public.process_order_stock(uuid,jsonb)'::regprocedure)
      and pg_get_functiondef(p.oid) ~* '\m(deduct_ingredient_stock|process_order_stock)\M'
  ) then
    raise exception 'LEGACY_STOCK_FUNCTION_REFERENCE: re-audit before removal';
  end if;
  if to_regclass('cron.job') is not null then
    if exists (select 1 from cron.job
      where command ~* '\m(deduct_ingredient_stock|process_order_stock)\M') then
      raise exception 'LEGACY_STOCK_CRON_REFERENCE: re-audit before removal';
    end if;
  end if;
end;
$$;

-- Reject new tracked dependencies instead of cascading through them.
drop function public.deduct_ingredient_stock(jsonb),
  public.process_order_stock(uuid,jsonb) restrict;
commit;
