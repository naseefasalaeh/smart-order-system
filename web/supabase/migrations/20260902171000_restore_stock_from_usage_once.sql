begin;

create or replace function public.restore_order_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'cancelled'
     and old.status <> 'cancelled'
     and old.stock_deducted = true then
    if old.status = 'completed' then
      raise exception using errcode = 'P0001', message = 'COMPLETED_ORDER';
    end if;

    if not exists (
      select 1
      from public.order_ingredient_usages as usage
      where usage.order_id = old.id
    ) then
      raise exception using errcode = 'P0001', message = 'ORDER_USAGE_NOT_FOUND';
    end if;

    update public.ingredients as ingredient
    set stock_quantity = ingredient.stock_quantity + usage.quantity_used,
        updated_at = now()
    from public.order_ingredient_usages as usage
    where usage.order_id = old.id
      and ingredient.id = usage.ingredient_id;

    new.stock_deducted := false;
  end if;

  return new;
end;
$$;

create or replace function public.cancel_order_and_restore_stock(
  p_order_id uuid,
  p_current_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;

  select created_order.*
  into v_order
  from public.orders as created_order
  where created_order.id = p_order_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'ORDER_NOT_FOUND';
  end if;

  if v_order.status <> p_current_status then
    raise exception using errcode = 'P0001', message = 'ORDER_STATUS_CHANGED';
  end if;

  if v_order.status not in ('pending', 'confirmed', 'preparing') then
    raise exception using errcode = 'P0001', message = 'ORDER_NOT_CANCELLABLE';
  end if;

  if v_order.stock_deducted and not exists (
    select 1
    from public.order_ingredient_usages as usage
    where usage.order_id = p_order_id
  ) then
    raise exception using errcode = 'P0001', message = 'ORDER_USAGE_NOT_FOUND';
  end if;

  update public.orders as created_order
  set status = 'cancelled',
      updated_at = now()
  where created_order.id = p_order_id;
end;
$$;

revoke execute on function public.cancel_order_and_restore_stock(uuid, text)
from public, anon, authenticated;

grant execute on function public.cancel_order_and_restore_stock(uuid, text)
to service_role;

commit;
