begin read only;
select jsonb_build_object(
 'columns',(select jsonb_agg(c) from (select table_name,column_name,data_type,column_default,is_nullable from information_schema.columns where table_schema='public' order by table_name,ordinal_position)c),
 'constraints',(select jsonb_agg(c) from (select conrelid::regclass::text as relation, conname,pg_get_constraintdef(oid) as definition from pg_constraint where connamespace='public'::regnamespace)c),
 'triggers',(select jsonb_agg(pg_get_triggerdef(oid)) from pg_trigger where not tgisinternal and tgrelid in (select oid from pg_class where relnamespace='public'::regnamespace)),
 'functions',(select jsonb_agg(pg_get_functiondef(p.oid)) from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in ('restore_order_stock','complete_order_payment','process_order_stock','deduct_ingredient_stock')),
 'views',(select jsonb_agg(v) from (select viewname,definition from pg_views where schemaname='public')v),
 'policies',(select jsonb_agg(p) from pg_policies p where schemaname='public')
) as audit;
commit;
