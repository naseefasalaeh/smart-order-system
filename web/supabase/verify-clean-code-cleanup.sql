begin read only;
select jsonb_build_object(
  'reviews', to_regclass('public.reviews'),
  'deduct_ingredient_stock', to_regprocedure('public.deduct_ingredient_stock(jsonb)'),
  'process_order_stock', to_regprocedure('public.process_order_stock(uuid,jsonb)'),
  'applied', (select jsonb_agg(version order by version) from supabase_migrations.schema_migrations
    where version in ('20261025160000','20261025161000')),
  'reset_job', (select jsonb_agg(jsonb_build_object('name',jobname,'schedule',schedule,'active',active))
    from cron.job where jobname='smart-order-ingredient-stock-reset')
) as verification;
commit;
