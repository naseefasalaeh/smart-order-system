begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- The profile row is controlled by the service role, never by user metadata.
create function public.current_shop_role() returns text
language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = auth.uid()
$$;
revoke all on function public.current_shop_role() from public, anon;
grant execute on function public.current_shop_role() to authenticated;

-- Browser clients may read orders, but status changes must take the row lock in this RPC.
drop policy if exists "Authenticated users can update orders" on public.orders;
revoke update on public.orders from authenticated;
revoke insert, update, delete on public.payments from authenticated;
drop policy if exists "Authenticated users can insert payments" on public.payments;
drop policy if exists "Authenticated users can delete payments" on public.payments;

create function public.advance_order_status(p_order_id uuid, p_expected text, p_next text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_status text;
begin
  if public.current_shop_role() not in ('admin', 'owner', 'kitchen', 'kitchen_staff') then
    raise exception using errcode = '42501', message = 'KITCHEN_ROLE_REQUIRED';
  end if;
  if not ((p_expected = 'confirmed' and p_next = 'preparing') or
          (p_expected = 'preparing' and p_next = 'ready')) then
    raise exception using errcode = '22023', message = 'INVALID_TRANSITION';
  end if;
  select status into v_status from public.orders where id = p_order_id for update;
  if not found or v_status is distinct from p_expected then
    raise exception using errcode = 'P0001', message = 'ORDER_STATUS_CHANGED';
  end if;
  update public.orders set status = p_next, updated_at = now() where id = p_order_id;
end $$;
revoke all on function public.advance_order_status(uuid,text,text) from public, anon;
grant execute on function public.advance_order_status(uuid,text,text) to authenticated;

-- Keep completed tied to a successful payment; service and kitchen workflows stay separate.
create or replace function public.complete_order_payment(p_order_id uuid, p_payment_method text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_order public.orders%rowtype; v_payment_id uuid;
begin
  if public.current_shop_role() not in ('admin', 'owner', 'staff') then
    raise exception using errcode = '42501', message = 'STAFF_ROLE_REQUIRED';
  end if;
  if p_payment_method not in ('cash', 'qr_code') then
    raise exception using errcode = '22023', message = 'INVALID_PAYMENT_METHOD';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.status <> 'ready' or not v_order.stock_deducted then
    raise exception using errcode = 'P0001', message = 'ORDER_NOT_READY';
  end if;
  if exists(select 1 from public.payments where order_id = p_order_id and status <> 'failed') then
    raise exception using errcode = 'P0001', message = 'PAYMENT_EXISTS';
  end if;
  insert into public.payments(order_id, payment_method, amount, status, paid_at)
    values(p_order_id, p_payment_method, v_order.total_amount, 'paid', now()) returning id into v_payment_id;
  update public.orders set status = 'completed', updated_at = now() where id = p_order_id;
  return jsonb_build_object('success',true,'order_id',p_order_id,'payment_id',v_payment_id,
    'payment_method',p_payment_method,'amount',v_order.total_amount);
end $$;
revoke all on function public.complete_order_payment(uuid,text) from public, anon;
grant execute on function public.complete_order_payment(uuid,text) to authenticated;

-- This row lock closes the race between disabling a table and inserting its next order.
create function public.reject_inactive_table_order() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_status text;
begin
  select status into v_status from public.restaurant_tables where id = new.table_id for share;
  if v_status is null or v_status = 'inactive' then
    raise exception using errcode = 'P0001', message = 'TABLE_INACTIVE';
  end if;
  return new;
end $$;
create trigger reject_inactive_table_order before insert on public.orders
for each row execute function public.reject_inactive_table_order();

commit;
