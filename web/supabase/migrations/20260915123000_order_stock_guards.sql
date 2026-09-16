begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
alter table public.orders add column request_id uuid, add column request_fingerprint text;
create unique index orders_request_id_unique on public.orders(request_id) where request_id is not null;
drop function public.create_order_with_stock(bigint,uuid,text,numeric,jsonb,jsonb,text);
create function public.create_order_with_stock(p_table_id bigint,p_session_token uuid,p_order_note text,
  p_total_amount numeric,p_items jsonb,p_required_items jsonb,p_dining_type text default 'dine_in', p_request_id uuid default null, p_request_fingerprint text default null)
returns table(id uuid,order_number bigint,table_id bigint,session_id uuid,status text,total_amount numeric,stock_deducted boolean)
language plpgsql security definer set search_path = '' as $$
declare v_item jsonb; v_option jsonb; v_menu public.menus%rowtype;
  v_effective record; v_group record; v_count integer; v_quantity integer;
  v_price numeric; v_required jsonb; v_created record; v_previous public.orders%rowtype; v_actual jsonb;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if p_request_id is not null then
    if p_request_fingerprint is null or p_request_fingerprint !~ '^[0-9a-f]{64}$' then raise exception 'INVALID_REQUEST_FINGERPRINT'; end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,0));
    select * into v_previous from public.orders where orders.request_id=p_request_id;
    if found then
      if v_previous.request_fingerprint is distinct from p_request_fingerprint or v_previous.table_id<>p_table_id
        or not exists(select 1 from public.dining_sessions where dining_sessions.id=v_previous.session_id and access_token=p_session_token)
        then raise exception 'REQUEST_CONFLICT'; end if;
      return query select v_previous.id,v_previous.order_number,v_previous.table_id,v_previous.session_id,v_previous.status,v_previous.total_amount,v_previous.stock_deducted;
      return;
    end if;
  end if;
  -- Serialize first-use session creation too; ingredient row updates remain atomic and ordered.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_session_token::text,1));
  if p_dining_type is null or p_dining_type not in ('dine_in','takeaway') then raise exception 'INVALID_DINING_TYPE'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items)=0 then raise exception 'INVALID_ITEMS'; end if;
  -- Prevent concurrent catalog changes between verification and stock deduction.
  lock table public.menus,public.menu_option_groups,public.menu_options,public.addons,
    public.menu_ingredients,public.menu_option_ingredients,public.addon_ingredients in share mode;
  for v_item in select value from jsonb_array_elements(p_items) loop
    select * into v_menu from public.menus where public.menus.id=(v_item->>'menu_id')::bigint and is_available;
    if not found then raise exception 'MENU_UNAVAILABLE'; end if;
    v_price := v_menu.price;
    if not exists(select 1 from public.menu_ingredients where menu_id=v_menu.id) then raise exception 'RECIPE_REQUIRED'; end if;
    if jsonb_typeof(v_item->'options') is distinct from 'array' then raise exception 'INVALID_OPTIONS'; end if;
    if (select count(*) <> count(distinct value->>'menu_option_id') from jsonb_array_elements(v_item->'options')) then raise exception 'DUPLICATE_OPTIONS'; end if;
    for v_option in select value from jsonb_array_elements(v_item->'options') loop
      select * into v_effective from public.effective_menu_options o
        where o.id=(v_option->>'menu_option_id')::bigint and o.menu_id=v_menu.id and o.is_available;
      if not found then raise exception 'OPTION_UNAVAILABLE'; end if;
      v_quantity := (v_option->>'quantity')::integer;
      if v_quantity is null or v_quantity not between 1 and v_effective.max_quantity
        or (v_option->>'option_name') is distinct from v_effective.name
        or (v_option->>'additional_price')::numeric is distinct from v_effective.additional_price
        then raise exception 'OPTION_CHANGED'; end if;
      if v_effective.group_id is not null and not exists(select 1 from public.menu_option_groups g where g.id=v_effective.group_id and g.is_active)
        then raise exception 'GROUP_UNAVAILABLE'; end if;
      if not exists(select 1 from public.effective_menu_option_ingredients r where r.menu_option_id=v_effective.id)
        then raise exception 'RECIPE_REQUIRED'; end if;
      v_price := v_price + v_effective.additional_price*v_quantity;
    end loop;
    for v_group in select * from public.menu_option_groups where menu_id=v_menu.id and is_active loop
      select count(*),coalesce(sum((s.value->>'quantity')::integer),0) into v_count,v_quantity
        from jsonb_array_elements(v_item->'options') s join public.menu_options o on o.id=(s.value->>'menu_option_id')::bigint
        where o.group_id=v_group.id;
      if v_count < v_group.min_select or v_count > v_group.max_select or v_quantity > v_group.max_total_quantity
        then raise exception 'GROUP_SELECTION_INVALID'; end if;
    end loop;
    if (v_item->>'unit_price')::numeric is distinct from v_price then raise exception 'PRICE_CHANGED'; end if;
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('ingredient_id',r.ingredient_id,'quantity',r.quantity) order by r.ingredient_id),'[]')
    into v_required from (
      select ingredient_id,sum(quantity) quantity from (
        select r.ingredient_id,r.quantity_required*(i.value->>'quantity')::integer quantity
          from jsonb_array_elements(p_items) i join public.menu_ingredients r on r.menu_id=(i.value->>'menu_id')::bigint
        union all
        select r.ingredient_id,r.quantity_required*(i.value->>'quantity')::integer*(o.value->>'quantity')::integer
          from jsonb_array_elements(p_items) i cross join lateral jsonb_array_elements(i.value->'options') o
          join public.effective_menu_option_ingredients r on r.menu_option_id=(o.value->>'menu_option_id')::bigint
      ) usage group by ingredient_id
    ) r;
  if jsonb_array_length(v_required)=0 or exists(select 1 from jsonb_to_recordset(v_required) r(ingredient_id bigint,quantity numeric) left join public.ingredients i on i.id=r.ingredient_id where i.id is null or r.quantity is null or r.quantity<=0) then raise exception 'RECIPE_REQUIRED'; end if;
  -- Recompute recipes in the database, never trust client/server cached quantities.
  select * into v_created from public.create_order_with_stock_internal(p_table_id,p_session_token,p_order_note,p_total_amount,p_items,v_required);
  select coalesce(jsonb_agg(jsonb_build_object('ingredient_id',ingredient_id,'quantity',quantity_used) order by ingredient_id),'[]') into v_actual from public.order_ingredient_usages where order_id=v_created.id;
  if v_created.stock_deducted is distinct from true or v_actual is distinct from v_required then raise exception 'STOCK_POSTCONDITION_FAILED'; end if;
  update public.orders set request_id=p_request_id,request_fingerprint=p_request_fingerprint,dining_type=p_dining_type where public.orders.id=v_created.id;
  return query select v_created.id,v_created.order_number,v_created.table_id,v_created.session_id,
    v_created.status,v_created.total_amount,v_created.stock_deducted;
end $$;
revoke all on function public.create_order_with_stock(bigint,uuid,text,numeric,jsonb,jsonb,text,uuid,text) from public,anon,authenticated;
grant execute on function public.create_order_with_stock(bigint,uuid,text,numeric,jsonb,jsonb,text,uuid,text) to service_role;
commit;
