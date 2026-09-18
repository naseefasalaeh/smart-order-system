begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create or replace function public.is_catalog_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role in ('admin','owner'))
$$;

-- Existing authenticated write policies were too broad for staff accounts.
drop policy if exists "Authenticated users can insert menus" on public.menus;
drop policy if exists "Authenticated users can update menus" on public.menus;
create policy admin_insert_menus on public.menus for insert to authenticated with check (public.is_catalog_admin());
create policy admin_update_menus on public.menus for update to authenticated using (public.is_catalog_admin()) with check (public.is_catalog_admin());
drop policy if exists "Authenticated users can insert ingredients" on public.ingredients;
drop policy if exists "Authenticated users can update ingredients" on public.ingredients;
drop policy if exists authenticated_delete_unused_ingredients on public.ingredients;
create policy admin_insert_ingredients on public.ingredients for insert to authenticated with check (public.is_catalog_admin());
create policy admin_update_ingredients on public.ingredients for update to authenticated using (public.is_catalog_admin()) with check (public.is_catalog_admin());
create policy admin_delete_ingredients on public.ingredients for delete to authenticated using (public.is_catalog_admin());
drop policy if exists "Authenticated users can insert menu ingredients" on public.menu_ingredients;
drop policy if exists "Authenticated users can update menu ingredients" on public.menu_ingredients;
drop policy if exists "Authenticated users can delete menu ingredients" on public.menu_ingredients;
create policy admin_write_menu_ingredients on public.menu_ingredients for all to authenticated using (public.is_catalog_admin()) with check (public.is_catalog_admin());
drop policy if exists authenticated_insert_menu_options on public.menu_options;
drop policy if exists authenticated_update_menu_options on public.menu_options;
drop policy if exists authenticated_delete_menu_options on public.menu_options;
create policy admin_write_menu_options on public.menu_options for all to authenticated using (public.is_catalog_admin()) with check (public.is_catalog_admin());
drop policy if exists authenticated_can_insert_menu_option_groups on public.menu_option_groups;
drop policy if exists authenticated_can_update_menu_option_groups on public.menu_option_groups;
create policy admin_write_menu_option_groups on public.menu_option_groups for all to authenticated using (public.is_catalog_admin()) with check (public.is_catalog_admin());
drop policy if exists authenticated_insert_option_recipes on public.menu_option_ingredients;
drop policy if exists authenticated_update_option_recipes on public.menu_option_ingredients;
drop policy if exists authenticated_delete_option_recipes on public.menu_option_ingredients;
create policy admin_write_option_recipes on public.menu_option_ingredients for all to authenticated using (public.is_catalog_admin()) with check (public.is_catalog_admin());
drop policy if exists authenticated_can_insert_ingredient_categories on public.ingredient_categories;
drop policy if exists authenticated_can_update_ingredient_categories on public.ingredient_categories;
create policy admin_write_ingredient_categories on public.ingredient_categories for all to authenticated using (public.is_catalog_admin()) with check (public.is_catalog_admin());
drop policy if exists staff_addons on public.addons;
drop policy if exists staff_addon_recipes on public.addon_ingredients;
create policy staff_read_addons on public.addons for select to authenticated using (auth.uid() is not null);
create policy admin_write_addons on public.addons for all to authenticated using (public.is_catalog_admin()) with check (public.is_catalog_admin());
create policy staff_read_addon_recipes on public.addon_ingredients for select to authenticated using (auth.uid() is not null);
create policy admin_write_addon_recipes on public.addon_ingredients for all to authenticated using (public.is_catalog_admin()) with check (public.is_catalog_admin());
grant delete on public.addons to authenticated;

drop index public.addons_name_unique;
create unique index addons_category_name_unique on public.addons(category,lower(btrim(name)));

create function public.delete_addon_safely(p_id bigint,p_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_name text;
begin
  if not public.is_catalog_admin() then raise exception using errcode='42501',message='ADMIN_REQUIRED'; end if;
  lock table public.menus,public.menu_option_groups,public.menu_options,public.addons,
    public.menu_ingredients,public.menu_option_ingredients,public.addon_ingredients in share row exclusive mode;
  select name into v_name from public.addons where id=p_id for update;
  if not found or v_name is distinct from p_name then raise exception 'ADDON_CHANGED'; end if;
  if exists(select 1 from public.order_item_options x
    join public.order_items i on i.id=x.order_item_id
    join public.orders o on o.id=i.order_id
    join public.menu_options mo on mo.id=x.menu_option_id
    where mo.addon_id=p_id and o.stock_deducted and o.status not in ('completed','cancelled'))
    then raise exception 'ADDON_IN_ACTIVE_ORDER'; end if;
  delete from public.menu_options where addon_id=p_id;
  delete from public.addon_ingredients where addon_id=p_id;
  delete from public.addons where id=p_id;
end $$;
revoke all on function public.delete_addon_safely(bigint,text) from public,anon;
grant execute on function public.delete_addon_safely(bigint,text) to authenticated;

create function public.delete_ingredient_category_safely(p_id bigint,p_destination_id bigint default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v_name text;
begin
  if not public.is_catalog_admin() then raise exception using errcode='42501',message='ADMIN_REQUIRED'; end if;
  select name into v_name from public.ingredient_categories where id=p_id for update;
  if not found or btrim(v_name)='อื่น ๆ' then raise exception 'CATEGORY_PROTECTED'; end if;
  if exists(select 1 from public.ingredients where category_id=p_id) then
    if p_destination_id is null or p_destination_id=p_id or
      not exists(select 1 from public.ingredient_categories where id=p_destination_id and is_active)
      then raise exception 'CATEGORY_DESTINATION_REQUIRED'; end if;
    update public.ingredients set category_id=p_destination_id where category_id=p_id;
  end if;
  delete from public.ingredient_categories where id=p_id;
end $$;
revoke all on function public.delete_ingredient_category_safely(bigint,bigint) from public,anon;
grant execute on function public.delete_ingredient_category_safely(bigint,bigint) to authenticated;

-- Existing printed QR URLs contain table_number. Reserve every old number as an alias.
create table public.restaurant_table_aliases(
  table_number text primary key,
  table_id bigint not null references public.restaurant_tables(id) on delete restrict
);
insert into public.restaurant_table_aliases(table_number,table_id)
select table_number,id from public.restaurant_tables;
alter table public.restaurant_table_aliases enable row level security;
create policy public_read_table_aliases on public.restaurant_table_aliases for select to anon,authenticated using (true);
grant select on public.restaurant_table_aliases to anon,authenticated;

create function public.manage_restaurant_table(p_id bigint,p_number text,p_active boolean) returns bigint
language plpgsql security definer set search_path = '' as $$
declare v_id bigint; v_number text; v_status text;
begin
  if not public.is_catalog_admin() then raise exception using errcode='42501',message='ADMIN_REQUIRED'; end if;
  v_number := btrim(p_number);
  if v_number is null or v_number='' or length(v_number)>40 or p_active is null then raise exception 'INVALID_TABLE'; end if;
  if exists(select 1 from public.restaurant_table_aliases where table_number=v_number and table_id is distinct from p_id)
    then raise exception 'TABLE_NUMBER_RESERVED'; end if;
  if p_id is null then
    insert into public.restaurant_tables(table_number,qr_code,status)
      values(v_number,gen_random_uuid()::text,case when p_active then 'available' else 'inactive' end)
      returning id into v_id;
  else
    select status into v_status from public.restaurant_tables where id=p_id for update;
    if not found then raise exception 'TABLE_NOT_FOUND'; end if;
    update public.restaurant_tables set table_number=v_number,
      status=case when p_active then case when v_status='occupied' then 'occupied' else 'available' end else 'inactive' end
      where id=p_id returning id into v_id;
  end if;
  insert into public.restaurant_table_aliases(table_number,table_id) values(v_number,v_id)
    on conflict(table_number) do update set table_id=excluded.table_id;
  return v_id;
end $$;
revoke all on function public.manage_restaurant_table(bigint,text,boolean) from public,anon;
grant execute on function public.manage_restaurant_table(bigint,text,boolean) to authenticated;

commit;
