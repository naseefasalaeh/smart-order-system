begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- The old CASCADE silently removed base recipes when deleting an ingredient.
-- Keep the same FK and existing rows, but refuse referenced ingredient deletes.
alter table public.menu_ingredients
  drop constraint menu_ingredients_ingredient_id_fkey,
  add constraint menu_ingredients_ingredient_id_fkey
    foreign key (ingredient_id) references public.ingredients(id) on delete restrict;

-- Preserve option references too, including inconsistent legacy cross-menu data.
alter table public.order_item_options
  drop constraint order_item_options_menu_option_id_fkey,
  add constraint order_item_options_menu_option_id_fkey
    foreign key (menu_option_id) references public.menu_options(id) on delete restrict;

-- Parent DELETE cascades to owned recipe/options/groups using the existing FKs.
-- Cascades need no extra DELETE grant on groups or options.
grant delete on public.menus, public.ingredients to authenticated;
revoke delete, truncate on public.menus, public.ingredients,
  public.menu_ingredients, public.menu_options, public.menu_option_groups,
  public.menu_option_ingredients, public.order_items, public.order_item_options,
  public.order_ingredient_usages from public, anon;
revoke truncate on public.menus, public.ingredients,
  public.menu_ingredients, public.menu_options, public.menu_option_groups,
  public.menu_option_ingredients, public.order_items, public.order_item_options,
  public.order_ingredient_usages from authenticated;

create policy authenticated_delete_unused_menus on public.menus
  for delete to authenticated using (auth.uid() is not null);
create policy authenticated_delete_unused_ingredients on public.ingredients
  for delete to authenticated using (auth.uid() is not null);

-- Replace the Admin service-role workaround with narrowly scoped normal CRUD.
grant select, insert, update on public.menu_options to authenticated;
grant select, insert, update, delete on public.menu_option_ingredients to authenticated;
grant select on public.order_ingredient_usages, public.order_item_options to authenticated;
grant usage, select on sequence public.menu_options_id_seq,
  public.menu_option_ingredients_id_seq to authenticated;

create policy authenticated_read_all_menu_options on public.menu_options
  for select to authenticated using (auth.uid() is not null);
create policy authenticated_insert_menu_options on public.menu_options
  for insert to authenticated with check (auth.uid() is not null);
create policy authenticated_update_menu_options on public.menu_options
  for update to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
create policy authenticated_read_option_recipes on public.menu_option_ingredients
  for select to authenticated using (auth.uid() is not null);
create policy authenticated_insert_option_recipes on public.menu_option_ingredients
  for insert to authenticated with check (auth.uid() is not null);
create policy authenticated_update_option_recipes on public.menu_option_ingredients
  for update to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
create policy authenticated_delete_option_recipes on public.menu_option_ingredients
  for delete to authenticated using (auth.uid() is not null);
create policy authenticated_read_ingredient_usages on public.order_ingredient_usages
  for select to authenticated using (auth.uid() is not null);
create policy authenticated_read_order_item_options on public.order_item_options
  for select to authenticated using (auth.uid() is not null);

create function public.delete_catalog_item_safely(
  p_kind text, p_id bigint, p_name text, p_archive boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
set lock_timeout = '5s'
as $$
declare
  v_name text;
  v_recipes jsonb;
begin
  if auth.uid() is null or coalesce(auth.role(), '') <> 'authenticated' then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;
  if p_kind is null or p_kind not in ('menu', 'ingredient')
     or p_id is null or p_id <= 0 or p_name is null or p_archive is null
     or (p_kind = 'ingredient' and p_archive) then
    raise exception using errcode = '22023', message = 'INVALID_INPUT';
  end if;

  if p_kind = 'menu' then
    select name into v_name from public.menus where id = p_id for update;
  else
    select name into v_name from public.ingredients where id = p_id for update;
  end if;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if v_name is distinct from p_name then
    return jsonb_build_object('status', 'name_changed');
  end if;

  if p_kind = 'menu' then
    if p_archive then
      update public.menus set is_available = false, updated_at = now() where id = p_id;
      return jsonb_build_object('status', 'archived');
    end if;

    -- FOR UPDATE conflicts with FK key-share locks: concurrent inserts/edits
    -- cannot create new references between this check and the DELETE.
    perform id from public.menu_options where menu_id = p_id order by id for update;
    if exists (select 1 from public.order_items where menu_id = p_id)
       or exists (
         select 1 from public.order_item_options oi
         join public.menu_options mo on mo.id = oi.menu_option_id
         where mo.menu_id = p_id
       ) then
      return jsonb_build_object('status', 'used');
    end if;
    -- One statement: all owned children cascade or the entire call rolls back.
    delete from public.menus where id = p_id;
  else
    select jsonb_agg(recipe order by recipe) into v_recipes from (
      select distinct 'เมนู “' || m.name || '” (#' || m.id || ') / สูตรพื้นฐาน' as recipe
      from public.menu_ingredients mi join public.menus m on m.id = mi.menu_id
      where mi.ingredient_id = p_id
      union
      select distinct 'เมนู “' || m.name || '” (#' || m.id || ') / ตัวเลือก “' || mo.name || '” (#' || mo.id || ')'
      from public.menu_option_ingredients moi
      join public.menu_options mo on mo.id = moi.menu_option_id
      join public.menus m on m.id = mo.menu_id
      where moi.ingredient_id = p_id
    ) refs;
    if v_recipes is not null then
      return jsonb_build_object('status', 'recipe', 'recipes', v_recipes);
    end if;
    if exists (select 1 from public.order_ingredient_usages where ingredient_id = p_id) then
      return jsonb_build_object('status', 'usage');
    end if;
    delete from public.ingredients where id = p_id;
  end if;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  return jsonb_build_object('status', 'deleted');
end;
$$;

revoke all on function public.delete_catalog_item_safely(text, bigint, text, boolean)
  from public, anon;
grant execute on function public.delete_catalog_item_safely(text, bigint, text, boolean)
  to authenticated;

commit;
