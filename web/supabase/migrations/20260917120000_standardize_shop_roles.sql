begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$
declare v_definition text;
begin
  select pg_get_constraintdef(c.oid) into v_definition
    from pg_constraint c
    where c.conrelid = 'public.profiles'::regclass and c.conname = 'profiles_role_check';
  if v_definition is distinct from
    'CHECK ((role = ANY (ARRAY[''admin''::text, ''staff''::text])))' then
    raise exception 'Unexpected profiles_role_check: %', v_definition;
  end if;
  if exists(select 1 from public.profiles where role not in ('admin','staff','kitchen_staff')) then
    raise exception 'Existing profile has an unsupported role';
  end if;
end $$;

alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('admin','staff','kitchen_staff'));

drop policy if exists authenticated_delete_unused_menus on public.menus;
create policy admin_delete_menus on public.menus for delete to authenticated
  using (public.is_catalog_admin());

create or replace function public.is_catalog_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin')
$$;

create or replace function public.advance_order_status(p_order_id uuid, p_expected text, p_next text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_status text;
begin
  if public.current_shop_role() not in ('admin', 'kitchen_staff') then
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

create or replace function public.complete_order_payment(p_order_id uuid, p_payment_method text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_order public.orders%rowtype; v_payment_id uuid;
begin
  if public.current_shop_role() not in ('admin', 'staff') then
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

commit;
