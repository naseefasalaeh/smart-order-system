begin read only;
select jsonb_build_object(
  'new_menus',(select count(*) from public.menus where catalog_key is not null),
  'new_categories',(select jsonb_agg(name order by name) from public.categories where name in ('อาหารจานเดียว','กับข้าว')),
  'addons',(select count(*) from public.addons),
  'missing_base_recipes',(select count(*) from public.menus m where catalog_key is not null and not exists(select 1 from public.menu_ingredients r where r.menu_id=m.id)),
  'history_unchanged',not exists(
    select 1 from catalog_backup.before_redesign b
    join (select 'orders' t,coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]') rows from public.orders r
      union all select 'order_items',coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]') from public.order_items r
      union all select 'order_item_options',coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]') from public.order_item_options r
      union all select 'order_ingredient_usages',coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]') from public.order_ingredient_usages r
      union all select 'payments',coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]') from public.payments r
      union all select 'dining_sessions',coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]') from public.dining_sessions r
      union all select 'restaurant_tables',coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]') from public.restaurant_tables r
    ) actual on actual.t=b.table_name where actual.rows is distinct from b.rows
  ),
  'retained_stock_unchanged',not exists(select 1 from public.ingredients i join catalog_backup.before_redesign b on b.table_name='ingredients'
    cross join lateral jsonb_array_elements(b.rows) old where (old->>'id')::bigint=i.id and to_jsonb(i) is distinct from old),
  'retained_old_menu_names_unchanged',not exists(select 1 from public.menus m join catalog_backup.before_redesign b on b.table_name='menus'
    cross join lateral jsonb_array_elements(b.rows) old where (old->>'id')::bigint=m.id and m.name is distinct from old->>'name')
) as verification;
commit;
