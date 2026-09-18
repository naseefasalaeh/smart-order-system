begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.addons add column display_order integer not null default 0;
alter table public.addons add constraint addons_display_order_check check(display_order >= 0);
drop function public.save_addon(bigint,text,numeric,boolean,integer,jsonb,text);
create function public.save_addon(p_id bigint,p_name text,p_price numeric,
  p_available boolean,p_max_quantity integer,p_recipe jsonb,p_category text,p_display_order integer)
returns bigint language plpgsql security invoker set search_path = '' as $$
declare v_id bigint;
begin
  if not public.is_catalog_admin() then raise exception using errcode='42501',message='ADMIN_REQUIRED'; end if;
  if nullif(btrim(p_name),'') is null or p_price is null or p_price < 0 or
    p_max_quantity is null or p_max_quantity not between 1 and 3 or p_available is null or
    p_display_order is null or p_display_order < 0 or
    p_recipe is null or jsonb_typeof(p_recipe)<>'array' then raise exception 'INVALID_ADDON'; end if;
  if p_available and jsonb_array_length(p_recipe)=0 then raise exception 'RECIPE_REQUIRED'; end if;
  if exists(select 1 from jsonb_to_recordset(p_recipe) r(ingredient_id bigint,quantity_required numeric)
    where r.ingredient_id is null or r.quantity_required is null or r.quantity_required<=0) then raise exception 'INVALID_RECIPE'; end if;
  if p_category not in ('meat','topping','portion') then raise exception 'INVALID_CATEGORY'; end if;
  if p_id is null then
    insert into public.addons(name,additional_price,is_available,max_quantity,category,display_order)
      values(btrim(p_name),p_price,p_available,p_max_quantity,p_category,p_display_order) returning id into v_id;
  else
    update public.addons set category=p_category,name=btrim(p_name),additional_price=p_price,
      is_available=p_available,max_quantity=p_max_quantity,display_order=p_display_order,updated_at=now()
      where id=p_id returning id into v_id;
    if not found then raise exception 'ADDON_NOT_FOUND'; end if;
  end if;
  delete from public.addon_ingredients where addon_id=v_id;
  insert into public.addon_ingredients(addon_id,ingredient_id,quantity_required)
    select v_id,r.ingredient_id,r.quantity_required from jsonb_to_recordset(p_recipe) r(ingredient_id bigint,quantity_required numeric);
  perform public.regroup_menu_addons(menu_id) from public.menu_options where addon_id=v_id;
  return v_id;
end $$;
revoke all on function public.save_addon(bigint,text,numeric,boolean,integer,jsonb,text,integer) from public,anon;
grant execute on function public.save_addon(bigint,text,numeric,boolean,integer,jsonb,text,integer) to authenticated;

commit;
