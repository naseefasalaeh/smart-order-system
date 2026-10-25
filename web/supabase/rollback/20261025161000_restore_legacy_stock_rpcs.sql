-- Exact live function definitions captured before cleanup. Manual rollback only.
-- Restore existing EXECUTE grants; this file deliberately preserves old behavior.
begin;
CREATE OR REPLACE FUNCTION public.deduct_ingredient_stock(required_items jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  item jsonb;
  ingredient_record record;
  required_quantity numeric;
begin
  -- ตรวจทุกวัตถุดิบและล็อกแถวไว้ก่อน
  for item in
    select value
    from jsonb_array_elements(required_items)
  loop
    required_quantity :=
      (item->>'quantity')::numeric;

    select id, name, stock_quantity
    into ingredient_record
    from public.ingredients
    where id = (item->>'ingredient_id')::bigint
    for update;

    if not found then
      raise exception
        'ไม่พบวัตถุดิบรหัส %',
        item->>'ingredient_id';
    end if;

    if ingredient_record.stock_quantity < required_quantity then
      raise exception
        'วัตถุดิบ % ไม่เพียงพอ',
        ingredient_record.name;
    end if;
  end loop;

  -- เมื่อทุกอย่างพอแล้ว จึงหักสต็อก
  for item in
    select value
    from jsonb_array_elements(required_items)
  loop
    update public.ingredients
    set stock_quantity =
      stock_quantity - (item->>'quantity')::numeric
    where id = (item->>'ingredient_id')::bigint;
  end loop;
end;
$function$;
alter function public.deduct_ingredient_stock(jsonb) owner to postgres;
revoke all on function public.deduct_ingredient_stock(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.deduct_ingredient_stock(jsonb) to postgres, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.process_order_stock(p_order_id uuid, required_items jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  current_order record;
  item jsonb;
  current_ingredient_id bigint;
  current_quantity numeric;
  updated_ingredient_id bigint;
begin
  select id, stock_deducted
  into current_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'ไม่พบออเดอร์นี้';
  end if;

  if current_order.stock_deducted then
    raise exception 'ออเดอร์นี้ถูกหักสต็อกแล้ว';
  end if;

  if required_items is null
     or jsonb_typeof(required_items) <> 'array'
     or jsonb_array_length(required_items) = 0 then
    raise exception 'ไม่พบรายการวัตถุดิบที่ต้องหัก';
  end if;

  for item in
    select value
    from jsonb_array_elements(required_items)
  loop
    current_ingredient_id := (item ->> 'ingredient_id')::bigint;
    current_quantity := (item ->> 'quantity')::numeric;

    if current_ingredient_id is null
       or current_quantity is null
       or current_quantity <= 0 then
      raise exception 'ข้อมูลวัตถุดิบไม่ถูกต้อง';
    end if;

    update public.ingredients
    set stock_quantity = stock_quantity - current_quantity
    where id = current_ingredient_id
      and stock_quantity >= current_quantity
    returning id into updated_ingredient_id;

    if updated_ingredient_id is null then
      if not exists (
        select 1
        from public.ingredients
        where id = current_ingredient_id
      ) then
        raise exception 'ไม่พบวัตถุดิบรหัส %', current_ingredient_id;
      end if;

      raise exception 'วัตถุดิบรหัส % มีจำนวนไม่เพียงพอ', current_ingredient_id;
    end if;

    insert into public.order_ingredient_usages (
      order_id,
      ingredient_id,
      quantity_used
    )
    values (
      p_order_id,
      current_ingredient_id,
      current_quantity
    );

    updated_ingredient_id := null;
  end loop;

  update public.orders
  set stock_deducted = true,
      updated_at = now()
  where id = p_order_id;
end;
$function$;
alter function public.process_order_stock(uuid,jsonb) owner to postgres;
revoke all on function public.process_order_stock(uuid,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.process_order_stock(uuid,jsonb) to postgres, service_role;

commit;
