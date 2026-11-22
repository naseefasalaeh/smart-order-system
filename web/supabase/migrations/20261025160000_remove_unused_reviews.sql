-- Audited against live pg_proc, pg_depend, RLS, triggers, views and application
-- callers. Rollback: supabase/rollback/20261025160000_restore_reviews.sql.
begin;

-- Serialize writes while checking that no reviews appeared after the backup.
lock table public.reviews in access exclusive mode;
do $$
begin
  if exists (select 1 from public.reviews) then
    raise exception 'REVIEWS_NOT_EMPTY: back up and re-audit before removal';
  end if;
  -- PL/pgSQL and dynamic SQL references are not always tracked in pg_depend.
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname not in ('pg_catalog', 'information_schema') and p.prokind = 'f'
      and pg_get_functiondef(p.oid) ~* '\mreviews\M'
  ) then
    raise exception 'REVIEWS_FUNCTION_REFERENCE: re-audit before removal';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'reviews')
    or exists (select 1 from pg_trigger where tgrelid = 'public.reviews'::regclass and not tgisinternal)
    or exists (select 1 from pg_publication_tables where schemaname = 'public' and tablename = 'reviews') then
    raise exception 'REVIEWS_CONFIGURATION_CHANGED: re-audit before removal';
  end if;
end;
$$;

-- RESTRICT deliberately rejects new views, incoming FKs and other dependencies.
drop table public.reviews restrict;
commit;
