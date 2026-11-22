begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create function public.check_menu_sale_recipe() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.is_available and (tg_op = 'UPDATE' or old.id is not null) and
    not exists(select 1 from public.menu_ingredients where menu_id=new.id) then
    raise exception 'RECIPE_REQUIRED';
  end if;
  return new;
end $$;
-- New menus are inserted closed, their recipe is written, then they may be opened.
create trigger check_menu_sale_recipe before update on public.menus
for each row execute function public.check_menu_sale_recipe();

create function public.create_menu_complete(p_values jsonb,p_recipe jsonb,p_addon_ids bigint[])
returns bigint language plpgsql security invoker set search_path = '' as $$
declare v_id bigint; v_available boolean;
begin
  if not public.is_catalog_admin() then raise exception using errcode='42501',message='ADMIN_REQUIRED'; end if;
  if p_values is null or nullif(btrim(p_values->>'name'),'') is null or
    (p_values->>'price')::numeric < 0 or (p_values->>'category_id')::bigint is null or
    p_recipe is null or jsonb_typeof(p_recipe)<>'array' or jsonb_array_length(p_recipe)=0 then
    raise exception 'INVALID_MENU';
  end if;
  if exists(select 1 from jsonb_to_recordset(p_recipe) r(ingredient_id bigint,quantity_required numeric)
    where r.ingredient_id is null or r.quantity_required is null or r.quantity_required<=0) or
    (select count(*)<>count(distinct ingredient_id) from jsonb_to_recordset(p_recipe) r(ingredient_id bigint,quantity_required numeric)) then
    raise exception 'INVALID_RECIPE';
  end if;
  if (select count(*) from public.ingredients where id in
    (select ingredient_id from jsonb_to_recordset(p_recipe) r(ingredient_id bigint,quantity_required numeric))) <> jsonb_array_length(p_recipe) then
    raise exception 'INGREDIENT_NOT_FOUND';
  end if;
  v_available := coalesce((p_values->>'is_available')::boolean,false);
  insert into public.menus(name,description,category_id,price,image_url,is_available)
    values(btrim(p_values->>'name'),nullif(p_values->>'description',''),(p_values->>'category_id')::bigint,
      (p_values->>'price')::numeric,nullif(p_values->>'image_url',''),false)
    returning id into v_id;
  insert into public.menu_ingredients(menu_id,ingredient_id,quantity_required)
    select v_id,r.ingredient_id,r.quantity_required from jsonb_to_recordset(p_recipe) r(ingredient_id bigint,quantity_required numeric);
  perform public.set_menu_addons(v_id,p_addon_ids);
  if coalesce((p_values->>'meat_required')::boolean,false) then
    if not exists(select 1 from public.menu_options o join public.addons a on a.id=o.addon_id
      where o.menu_id=v_id and o.is_available and a.is_available and a.category='meat') then
      raise exception 'MEAT_REQUIRED';
    end if;
    update public.menu_option_groups set is_required=true,min_select=1 where menu_id=v_id and kind='meat';
  end if;
  if v_available then
    if exists(select 1 from public.menu_ingredients r join public.ingredients i on i.id=r.ingredient_id
      where r.menu_id=v_id and i.stock_quantity<r.quantity_required) then raise exception 'STOCK_INSUFFICIENT'; end if;
    update public.menus set is_available=true where id=v_id;
  end if;
  return v_id;
end $$;
revoke all on function public.create_menu_complete(jsonb,jsonb,bigint[]) from public,anon;
grant execute on function public.create_menu_complete(jsonb,jsonb,bigint[]) to authenticated;

-- The old RPC remains available for editing, but cannot leave a newly created menu without a recipe.
create or replace function public.save_menu_with_addons(p_id bigint,p_values jsonb,p_addon_ids bigint[])
returns bigint language plpgsql security invoker set search_path = '' as $$
begin
  if not public.is_catalog_admin() then raise exception using errcode='42501',message='ADMIN_REQUIRED'; end if;
  if p_id is null then raise exception 'USE_CREATE_MENU_COMPLETE'; end if;
  if nullif(btrim(p_values->>'name'),'') is null or (p_values->>'price')::numeric < 0 then raise exception 'INVALID_MENU'; end if;
  update public.menus set name=btrim(p_values->>'name'),description=nullif(p_values->>'description',''),
    category_id=(p_values->>'category_id')::bigint,price=(p_values->>'price')::numeric,
    image_url=nullif(p_values->>'image_url',''),is_available=(p_values->>'is_available')::boolean,updated_at=now()
    where id=p_id;
  if not found then raise exception 'MENU_NOT_FOUND'; end if;
  perform public.set_menu_addons(p_id,p_addon_ids);
  if p_values ? 'meat_required' then
    if (p_values->>'meat_required')::boolean and not exists(select 1 from public.menu_options o
      join public.addons a on a.id=o.addon_id where o.menu_id=p_id and o.is_available and a.category='meat')
      then raise exception 'MEAT_REQUIRED'; end if;
    update public.menu_option_groups set is_required=(p_values->>'meat_required')::boolean,
      min_select=case when (p_values->>'meat_required')::boolean then 1 else 0 end
      where menu_id=p_id and kind='meat';
  end if;
  return p_id;
end $$;

commit;
