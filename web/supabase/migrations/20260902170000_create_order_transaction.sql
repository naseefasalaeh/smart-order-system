begin;

create or replace function public.create_order_with_stock(
  p_table_id bigint,
  p_session_token uuid,
  p_order_note text,
  p_total_amount numeric,
  p_items jsonb,
  p_required_items jsonb
)
returns table (
  id uuid,
  order_number bigint,
  table_id bigint,
  session_id uuid,
  status text,
  total_amount numeric,
  stock_deducted boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.dining_sessions%rowtype;
  v_order public.orders%rowtype;
  v_item jsonb;
  v_option jsonb;
  v_required jsonb;
  v_order_item_id bigint;
  v_ingredient record;
  v_item_total numeric := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;

  if p_table_id is null or p_table_id <= 0 or p_session_token is null then
    raise exception using errcode = '22023', message = 'INVALID_ORDER_CONTEXT';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception using errcode = '22023', message = 'INVALID_ORDER_ITEMS';
  end if;

  if p_required_items is null or jsonb_typeof(p_required_items) <> 'array' then
    raise exception using errcode = '22023', message = 'INVALID_REQUIRED_ITEMS';
  end if;

  perform 1
  from public.restaurant_tables as restaurant_table
  where restaurant_table.id = p_table_id;

  if not found then
    raise exception using errcode = '22023', message = 'TABLE_NOT_FOUND';
  end if;

  select dining_session.*
  into v_session
  from public.dining_sessions as dining_session
  where dining_session.access_token = p_session_token
  for update;

  if found then
    if v_session.table_id <> p_table_id or v_session.status <> 'active' then
      raise exception using errcode = '22023', message = 'INVALID_DINING_SESSION';
    end if;
  else
    insert into public.dining_sessions (table_id, access_token, status)
    values (p_table_id, p_session_token, 'active')
    returning * into v_session;
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if (v_item ->> 'menu_id') is null
       or coalesce((v_item ->> 'quantity')::integer, 0) <= 0
       or coalesce((v_item ->> 'unit_price')::numeric, -1) < 0
       or coalesce((v_item ->> 'subtotal')::numeric, -1) < 0
       or (v_item ->> 'subtotal')::numeric <>
          (v_item ->> 'unit_price')::numeric * (v_item ->> 'quantity')::integer
       or jsonb_typeof(coalesce(v_item -> 'options', '[]'::jsonb)) <> 'array' then
      raise exception using errcode = '22023', message = 'INVALID_ORDER_ITEM';
    end if;

    v_item_total := v_item_total + (v_item ->> 'subtotal')::numeric;
  end loop;

  if p_total_amount is null or p_total_amount < 0 or v_item_total <> p_total_amount then
    raise exception using errcode = '22023', message = 'INVALID_ORDER_TOTAL';
  end if;

  for v_required in select value from jsonb_array_elements(p_required_items)
  loop
    if (v_required ->> 'ingredient_id') is null
       or coalesce((v_required ->> 'quantity')::numeric, 0) <= 0 then
      raise exception using errcode = '22023', message = 'INVALID_REQUIRED_ITEM';
    end if;
  end loop;

  insert into public.orders (
    table_id,
    session_id,
    status,
    total_amount,
    note,
    stock_deducted
  )
  values (
    p_table_id,
    v_session.id,
    'confirmed',
    p_total_amount,
    nullif(btrim(left(coalesce(p_order_note, ''), 500)), ''),
    false
  )
  returning * into v_order;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    insert into public.order_items (
      order_id,
      menu_id,
      quantity,
      unit_price,
      subtotal,
      note
    )
    values (
      v_order.id,
      (v_item ->> 'menu_id')::bigint,
      (v_item ->> 'quantity')::integer,
      (v_item ->> 'unit_price')::numeric,
      (v_item ->> 'subtotal')::numeric,
      nullif(btrim(left(coalesce(v_item ->> 'note', ''), 500)), '')
    )
    returning public.order_items.id into v_order_item_id;

    for v_option in
      select value
      from jsonb_array_elements(coalesce(v_item -> 'options', '[]'::jsonb))
    loop
      if (v_option ->> 'menu_option_id') is null
         or coalesce((v_option ->> 'quantity')::integer, 0) <= 0
         or coalesce((v_option ->> 'additional_price')::numeric, -1) < 0
         or nullif(btrim(v_option ->> 'option_name'), '') is null then
        raise exception using errcode = '22023', message = 'INVALID_ORDER_OPTION';
      end if;

      insert into public.order_item_options (
        order_item_id,
        menu_option_id,
        option_name,
        additional_price,
        quantity
      )
      values (
        v_order_item_id,
        (v_option ->> 'menu_option_id')::bigint,
        v_option ->> 'option_name',
        (v_option ->> 'additional_price')::numeric,
        (v_option ->> 'quantity')::integer
      );
    end loop;
  end loop;

  for v_ingredient in
    select
      required.ingredient_id,
      sum(required.quantity) as quantity
    from jsonb_to_recordset(p_required_items)
      as required(ingredient_id bigint, quantity numeric)
    group by required.ingredient_id
    order by required.ingredient_id
  loop
    update public.ingredients as ingredient
    set stock_quantity = ingredient.stock_quantity - v_ingredient.quantity
    where ingredient.id = v_ingredient.ingredient_id
      and ingredient.stock_quantity >= v_ingredient.quantity;

    if not found then
      raise exception using
        errcode = 'P0001',
        message = 'INSUFFICIENT_STOCK';
    end if;

    insert into public.order_ingredient_usages (
      order_id,
      ingredient_id,
      quantity_used
    )
    values (
      v_order.id,
      v_ingredient.ingredient_id,
      v_ingredient.quantity
    );
  end loop;

  update public.orders as created_order
  set stock_deducted = true,
      updated_at = now()
  where created_order.id = v_order.id
  returning created_order.* into v_order;

  return query
  select
    v_order.id,
    v_order.order_number,
    v_order.table_id,
    v_order.session_id,
    v_order.status,
    v_order.total_amount,
    v_order.stock_deducted;
end;
$$;

revoke all on function public.create_order_with_stock(
  bigint,
  uuid,
  text,
  numeric,
  jsonb,
  jsonb
) from public, anon, authenticated;

grant execute on function public.create_order_with_stock(
  bigint,
  uuid,
  text,
  numeric,
  jsonb,
  jsonb
) to service_role;

revoke execute on function public.process_order_stock(uuid, jsonb)
from public, anon, authenticated;

revoke execute on function public.cancel_order_and_restore_stock(uuid, text)
from public, anon, authenticated;

commit;
