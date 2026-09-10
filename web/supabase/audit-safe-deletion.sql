-- Read-only metadata. One result set also works with the Management API.
with targets(name) as (values
  ('menus'), ('menu_ingredients'), ('menu_options'), ('menu_option_groups'),
  ('menu_option_ingredients'), ('order_items'), ('ingredients'),
  ('order_ingredient_usages'), ('order_item_options')
)
select jsonb_build_object(
  'foreign_keys', (
    select jsonb_agg(jsonb_build_object(
      'child', c.conrelid::regclass::text, 'name', c.conname,
      'parent', c.confrelid::regclass::text, 'definition', pg_get_constraintdef(c.oid)))
    from pg_constraint c
    where c.contype = 'f' and (c.conrelid in (select ('public.' || name)::regclass from targets)
      or c.confrelid in (select ('public.' || name)::regclass from targets))
  ),
  'policies', (
    select jsonb_agg(jsonb_build_object('table', tablename, 'name', policyname,
      'roles', roles, 'command', cmd, 'using', qual, 'check', with_check, 'permissive', permissive))
    from pg_policies where schemaname = 'public' and tablename in (select name from targets)
  ),
  'grants', (
    select jsonb_agg(g) from (
      select table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type) privileges
      from information_schema.role_table_grants
      where table_schema = 'public' and table_name in (select name from targets)
        and grantee in ('anon', 'authenticated', 'PUBLIC')
      group by table_name, grantee
    ) g
  ),
  'rls', (
    select jsonb_agg(jsonb_build_object('table', relname, 'enabled', relrowsecurity, 'forced', relforcerowsecurity))
    from pg_class where relnamespace = 'public'::regnamespace and relname in (select name from targets)
  ),
  'order_columns', (
    select jsonb_agg(jsonb_build_object('table', table_name, 'column', column_name, 'type', data_type))
    from information_schema.columns where table_schema = 'public'
      and table_name in ('order_items', 'order_item_options')
  )
) as audit;
