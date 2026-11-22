-- Read-only fingerprints, not row contents. Compare before/after deployment.
-- Run off-peak for large databases; live customer writes can change fingerprints.
select jsonb_build_object(
  'menus', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(row_to_json(t)::text) h from public.menus t) s),
  'ingredients', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(row_to_json(t)::text) h from public.ingredients t) s),
  'menu_ingredients', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(row_to_json(t)::text) h from public.menu_ingredients t) s),
  'menu_options', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(row_to_json(t)::text) h from public.menu_options t) s),
  'menu_option_groups', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(row_to_json(t)::text) h from public.menu_option_groups t) s),
  'menu_option_ingredients', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(row_to_json(t)::text) h from public.menu_option_ingredients t) s),
  'orders', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(row_to_json(t)::text) h from public.orders t) s),
  'order_items', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(row_to_json(t)::text) h from public.order_items t) s),
  'order_item_options', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(row_to_json(t)::text) h from public.order_item_options t) s),
  'order_ingredient_usages', (select md5(coalesce(string_agg(h, '' order by h), '')) from (select md5(row_to_json(t)::text) h from public.order_ingredient_usages t) s)
) as fingerprint;
