begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
lock table public.addons, public.menu_options, public.menu_option_groups in share row exclusive mode;
alter table public.addons add column category text not null default 'topping' check(category in ('meat','topping','portion'));
update public.addons set category=case when btrim(name) in ('ไก่','เนื้อไก่','เนื้อ','ทะเล') then 'meat' when btrim(name) in ('เพิ่มข้าว','เพิ่มเนื้อ') then 'portion' else 'topping' end;
alter table public.addons alter column category drop default;
alter table public.menu_option_groups drop constraint menu_option_groups_kind_check;
alter table public.menu_option_groups add constraint menu_option_groups_kind_check check(kind in ('standard','meat','addon','topping','portion'));

-- Centralize only equivalent recipes/prices. Abort on conflicts instead of silently changing recipes.
do $$ declare o record; a public.addons%rowtype; r jsonb; ar jsonb; begin
 for o in select * from public.menu_options where addon_id is null and btrim(name) in ('ไก่','เนื้อ','ทะเล','ไข่ดาว','ไข่เจียว','เพิ่มข้าว','เพิ่มเนื้อ') order by id loop
  select coalesce(jsonb_agg(jsonb_build_array(ingredient_id,quantity_required) order by ingredient_id),'[]') into r from public.menu_option_ingredients where menu_option_id=o.id;
  select * into a from public.addons where lower(btrim(name))=lower(btrim(o.name));
  if not found then
   insert into public.addons(name,category,additional_price,is_available,max_quantity)
    values(btrim(o.name),case when btrim(o.name) in ('ไก่','เนื้อ','ทะเล') then 'meat' when btrim(o.name) in ('เพิ่มข้าว','เพิ่มเนื้อ') then 'portion' else 'topping' end,o.additional_price,exists(select 1 from public.menu_options x where x.addon_id is null and btrim(x.name)=btrim(o.name) and x.is_available),o.max_quantity) returning * into a;
   insert into public.addon_ingredients select a.id,ingredient_id,quantity_required from public.menu_option_ingredients where menu_option_id=o.id;
  else
   select coalesce(jsonb_agg(jsonb_build_array(ingredient_id,quantity_required) order by ingredient_id),'[]') into ar from public.addon_ingredients where addon_id=a.id;
   -- Explicit user decision: existing shared seafood (+15, 30g each) is authoritative.
   -- Other conflicting recipes/prices still abort. Historical snapshots stay intact.
   if btrim(o.name) = 'ทะเล' and (ar is distinct from r or a.additional_price <> o.additional_price) then
    if a.additional_price <> 15 or (select count(*) from public.addon_ingredients where addon_id=a.id) <> 2
       or exists(select 1 from public.addon_ingredients ar join public.ingredients i on i.id=ar.ingredient_id where ar.addon_id=a.id and (ar.quantity_required <> 30 or i.name not in ('กุ้ง','ปลาหมึก')))
       then raise exception 'SEAFOOD_APPROVED_RECIPE_MISMATCH'; end if;
   elsif ar is distinct from r or a.additional_price <> o.additional_price or (a.category <> 'meat' and a.max_quantity <> o.max_quantity) then raise exception 'ADDON_RECIPE_OR_PRICE_CONFLICT: option % (%)',o.id,o.name; end if;
  end if;
  update public.menu_options set addon_id=a.id where id=o.id;
 end loop;
end $$;

-- Reuse existing meat/addon group IDs; keep legacy option and recipe rows intact.
create function public.regroup_menu_addons(p_menu_id bigint) returns void
language plpgsql security invoker set search_path='' as $$
declare c text; g bigint; n integer; begin
 foreach c in array array['meat','topping','portion'] loop
  select count(*) into n from public.menu_options o join public.addons a on a.id=o.addon_id where o.menu_id=p_menu_id and a.category=c;
  select id into g from public.menu_option_groups where menu_id=p_menu_id and kind=c order by id limit 1;
  if g is null and c='topping' then select id into g from public.menu_option_groups where menu_id=p_menu_id and kind='addon' order by id limit 1; end if;
  if n=0 and g is null then continue; end if;
  if g is null then
   insert into public.menu_option_groups(menu_id,name,kind,selection_type,is_required,min_select,max_select,max_total_quantity,display_order,is_active)
   values(p_menu_id,c,c,case when c='meat' then 'single' else 'multiple' end,false,0,case when c='meat' then 1 else greatest(n,1) end,case when c='meat' then 1 else greatest(n*3,3) end,0,true) returning id into g;
  end if;
  update public.menu_options o set group_id=g from public.addons a where o.addon_id=a.id and o.menu_id=p_menu_id and a.category=c;
  update public.menu_option_groups set kind=c,name=case c when 'meat' then 'ตัวเลือกเนื้อสัตว์' when 'topping' then 'ไข่และท็อปปิ้ง' else 'เพิ่มปริมาณ' end,
   selection_type=case when c='meat' then 'single' else 'multiple' end,
   max_select=case when c='meat' then 1 else greatest(n,1) end,max_total_quantity=case when c='meat' then 1 else greatest(n*3,3) end,
   display_order=case c when 'meat' then 0 when 'topping' then 100 else 200 end where id=g;
 end loop;
end $$;
do $$ declare m record; begin for m in select id from public.menus loop perform public.regroup_menu_addons(m.id); end loop; end $$;
drop function public.save_addon(bigint,text,numeric,boolean,integer,jsonb);
create function public.save_addon(p_id bigint, p_name text, p_price numeric,
  p_available boolean, p_max_quantity integer, p_recipe jsonb, p_category text)
returns bigint language plpgsql security invoker set search_path = '' as $$
declare v_id bigint;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if nullif(btrim(p_name),'') is null or p_price is null or p_price < 0
    or p_max_quantity is null or p_max_quantity not between 1 and 3 or p_available is null
    or p_recipe is null or jsonb_typeof(p_recipe) <> 'array' then raise exception 'INVALID_ADDON'; end if;
  if p_available and jsonb_array_length(p_recipe) = 0 then raise exception 'RECIPE_REQUIRED'; end if;
  if exists(select 1 from jsonb_to_recordset(p_recipe) r(ingredient_id bigint, quantity_required numeric)
    where r.ingredient_id is null or r.quantity_required is null or r.quantity_required <= 0)
    then raise exception 'INVALID_RECIPE'; end if;
  if p_category is null or p_category not in ('meat','topping','portion') then raise exception 'INVALID_CATEGORY'; end if;
  if p_id is null then
    insert into public.addons(name,additional_price,is_available,max_quantity,category)
      values(btrim(p_name),p_price,p_available,p_max_quantity,p_category) returning id into v_id;
  else
    update public.addons set category=p_category,name=btrim(p_name),additional_price=p_price,is_available=p_available,
      max_quantity=p_max_quantity,updated_at=now() where id=p_id returning id into v_id;
    if not found then raise exception 'ADDON_NOT_FOUND'; end if;
  end if;
  delete from public.addon_ingredients where addon_id=v_id;
  insert into public.addon_ingredients(addon_id,ingredient_id,quantity_required)
    select v_id,r.ingredient_id,r.quantity_required
    from jsonb_to_recordset(p_recipe) r(ingredient_id bigint, quantity_required numeric);
  perform public.regroup_menu_addons(menu_id) from public.menu_options where addon_id=v_id;
  return v_id;
end $$;

create or replace function public.set_menu_addons(p_menu_id bigint,p_addon_ids bigint[]) returns void language plpgsql security invoker set search_path='' as $$
declare a record; begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
 perform id from public.menus where id=p_menu_id for update;
 if not found then raise exception 'MENU_NOT_FOUND'; end if;
 if p_addon_ids is null or array_position(p_addon_ids,null) is not null or (select count(*) from public.addons where id=any(p_addon_ids)) <> cardinality(p_addon_ids) then raise exception 'INVALID_ADDONS'; end if;
 for a in select * from public.addons where id=any(p_addon_ids) for share loop
  if not a.is_available and not exists(select 1 from public.menu_options where menu_id=p_menu_id and addon_id=a.id and is_available) then raise exception 'ADDON_DISABLED'; end if;
 end loop;
 update public.menu_options set is_available=false where menu_id=p_menu_id and addon_id is not null and not(addon_id=any(p_addon_ids));
 insert into public.menu_options(menu_id,addon_id,name,additional_price,max_quantity,is_available,sort_order)
 select p_menu_id,id,'addon:'||id,0,3,true,0 from public.addons where id=any(p_addon_ids)
 on conflict(menu_id,addon_id) where addon_id is not null do update set is_available=true;
 perform public.regroup_menu_addons(p_menu_id);
end $$;
create or replace function public.save_menu_with_addons(p_id bigint,p_values jsonb,p_addon_ids bigint[])
returns bigint language plpgsql security invoker set search_path = '' as $$
declare v_id bigint;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if nullif(btrim(p_values->>'name'),'') is null or (p_values->>'price')::numeric < 0
    then raise exception 'INVALID_MENU'; end if;
  if p_id is null then
    insert into public.menus(name,description,category_id,price,image_url,is_available)
      values(btrim(p_values->>'name'),nullif(p_values->>'description',''),(p_values->>'category_id')::bigint,
        (p_values->>'price')::numeric,nullif(p_values->>'image_url',''),(p_values->>'is_available')::boolean)
      returning id into v_id;
  else
    update public.menus set name=btrim(p_values->>'name'),description=nullif(p_values->>'description',''),
      category_id=(p_values->>'category_id')::bigint,price=(p_values->>'price')::numeric,
      image_url=nullif(p_values->>'image_url',''),is_available=(p_values->>'is_available')::boolean,updated_at=now()
      where id=p_id returning id into v_id;
    if not found then raise exception 'MENU_NOT_FOUND'; end if;
  end if;
  perform public.set_menu_addons(v_id,p_addon_ids);
  if p_values ? 'meat_required' then
    if (p_values->>'meat_required')::boolean and not exists(select 1 from public.menu_options o join public.addons a on a.id=o.addon_id where o.menu_id=v_id and o.is_available and a.category='meat') then raise exception 'MEAT_REQUIRED'; end if;
    update public.menu_option_groups set is_required=(p_values->>'meat_required')::boolean,min_select=case when (p_values->>'meat_required')::boolean then 1 else 0 end where menu_id=v_id and kind='meat';
  end if;
  return v_id;
end $$;
revoke all on function public.save_menu_with_addons(bigint,jsonb,bigint[]) from public,anon;
grant execute on function public.save_menu_with_addons(bigint,jsonb,bigint[]) to authenticated;

revoke all on function public.regroup_menu_addons(bigint),public.save_addon(bigint,text,numeric,boolean,integer,jsonb,text) from public,anon;
grant execute on function public.regroup_menu_addons(bigint),public.save_addon(bigint,text,numeric,boolean,integer,jsonb,text) to authenticated;
commit;
