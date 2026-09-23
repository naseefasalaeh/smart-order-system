begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- orders_status_check already supports served. Reuse the existing order row.
-- Historical served/completed rows are left untouched: never invent an audit time.
alter table public.orders add column served_at timestamptz;
alter table public.orders add column served_by uuid references public.profiles(id);
alter table public.orders add constraint orders_served_audit_pair
  check ((served_at is null) = (served_by is null));

create function public.serve_order(p_order_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_order public.orders%rowtype;
begin
  if coalesce(public.current_shop_role(),'') not in ('admin','staff') then
    raise exception using errcode = '42501', message = 'STAFF_ROLE_REQUIRED';
  end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'ORDER_NOT_FOUND';
  end if;
  -- A retry must preserve the first confirmation and never move an order backward.
  if v_order.status in ('served','completed') and v_order.served_at is not null then
    return;
  end if;
  if v_order.status <> 'ready' or not v_order.stock_deducted then
    raise exception using errcode = 'P0001', message = 'ORDER_NOT_READY';
  end if;
  update public.orders set status='served', served_at=now(), served_by=auth.uid(), updated_at=now()
    where id=p_order_id;
end $$;
revoke all on function public.serve_order(uuid) from public,anon;
grant execute on function public.serve_order(uuid) to authenticated;

create or replace function public.complete_order_payment(p_order_id uuid, p_payment_method text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_order public.orders%rowtype; v_payment_id uuid;
begin
  if coalesce(public.current_shop_role(),'') not in ('admin','staff') then
    raise exception using errcode = '42501', message = 'STAFF_ROLE_REQUIRED';
  end if;
  if p_payment_method is null or p_payment_method not in ('cash','qr_code') then
    raise exception using errcode = '22023', message = 'INVALID_PAYMENT_METHOD';
  end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found or v_order.status <> 'served' or not v_order.stock_deducted then
    raise exception using errcode = 'P0001', message = 'ORDER_NOT_SERVED';
  end if;
  if exists(select 1 from public.payments where order_id=p_order_id and status <> 'failed') then
    raise exception using errcode = 'P0001', message = 'PAYMENT_EXISTS';
  end if;
  insert into public.payments(order_id,payment_method,amount,status,paid_at)
    values(p_order_id,p_payment_method,v_order.total_amount,'paid',now()) returning id into v_payment_id;
  update public.orders set status='completed',updated_at=now() where id=p_order_id;
  return jsonb_build_object('success',true,'order_id',p_order_id,'payment_id',v_payment_id,
    'payment_method',p_payment_method,'amount',v_order.total_amount);
end $$;
revoke all on function public.complete_order_payment(uuid,text) from public,anon;
grant execute on function public.complete_order_payment(uuid,text) to authenticated;
commit;
