-- Read-only inventory. Save output outside Git: function bodies can contain secrets.
begin read only;
select jsonb_build_object(
  'functions', (select jsonb_agg(jsonb_build_object('name', p.oid::regprocedure::text,
    'definition', pg_get_functiondef(p.oid), 'acl', p.proacl))
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prokind='f'),
  'policies', (select jsonb_agg(to_jsonb(p)) from pg_policies p where schemaname='public'),
  'triggers', (select jsonb_agg(jsonb_build_object('table', t.tgrelid::regclass::text,
    'definition', pg_get_triggerdef(t.oid))) from pg_trigger t
    join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and not t.tgisinternal),
  'constraints', (select jsonb_agg(jsonb_build_object('table', c.conrelid::regclass::text,
    'name', c.conname, 'definition', pg_get_constraintdef(c.oid)))
    from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname='public'),
  'views', (select jsonb_agg(to_jsonb(v)) from pg_views v where schemaname='public'),
  'columns', (select jsonb_agg(to_jsonb(c)) from information_schema.columns c where table_schema='public'),
  'grants', (select jsonb_agg(to_jsonb(g)) from information_schema.role_table_grants g where table_schema='public'),
  'rls', (select jsonb_agg(jsonb_build_object('table', c.relname, 'enabled', c.relrowsecurity,
    'forced', c.relforcerowsecurity)) from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r'),
  'publication', (select jsonb_agg(to_jsonb(p)) from pg_publication_tables p where schemaname='public'),
  'review_dependencies', (select jsonb_agg(jsonb_build_object('dependent',
    pg_describe_object(d.classid,d.objid,d.objsubid), 'type', d.deptype))
    from pg_depend d where d.refclassid='pg_class'::regclass and d.refobjid=to_regclass('public.reviews')),
  'review_function_references', (select jsonb_agg(p.oid::regprocedure::text)
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname not in ('pg_catalog','information_schema') and p.prokind='f'
      and pg_get_functiondef(p.oid) ~* '\mreviews\M'),
  'legacy_stock_function_references', (select jsonb_agg(p.oid::regprocedure::text)
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname not in ('pg_catalog','information_schema') and p.prokind='f'
      and not (n.nspname='public' and p.proname in ('deduct_ingredient_stock','process_order_stock'))
      and pg_get_functiondef(p.oid) ~* '\m(deduct_ingredient_stock|process_order_stock)\M'),
  'legacy_stock_dependencies', (select jsonb_agg(jsonb_build_object('dependent',
    pg_describe_object(d.classid,d.objid,d.objsubid), 'type', d.deptype))
    from pg_depend d where d.refclassid='pg_proc'::regclass
      and d.refobjid in (to_regprocedure('public.deduct_ingredient_stock(jsonb)'),
      to_regprocedure('public.process_order_stock(uuid,jsonb)'))),
  'cron_jobs', (select jsonb_agg(jsonb_build_object('name', jobname, 'command', command,
    'schedule', schedule, 'active', active)) from cron.job),
  'owners', jsonb_build_object(
    'reviews', (select pg_get_userbyid(relowner) from pg_class where oid=to_regclass('public.reviews')),
    'legacy_stock_functions', (select jsonb_agg(jsonb_build_object('name', p.oid::regprocedure::text,
      'owner', pg_get_userbyid(p.proowner))) from pg_proc p
      where p.oid in (to_regprocedure('public.deduct_ingredient_stock(jsonb)'),
        to_regprocedure('public.process_order_stock(uuid,jsonb)')))),
  'history', (select jsonb_agg(to_jsonb(m)) from supabase_migrations.schema_migrations m)
) as audit;
commit;
