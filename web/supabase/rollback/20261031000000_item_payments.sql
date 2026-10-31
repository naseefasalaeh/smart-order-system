begin;
set local lock_timeout='5s';
lock table public.payments,public.payment_allocations in access exclusive mode;
do $$ begin
  if exists(select 1 from public.payments where request_id is not null) then
    raise exception 'NEW_PAYMENTS_EXIST_USE_FORWARD_FIX_OR_RECONCILED_RESTORE';
  end if;
end $$;
drop function public.collect_item_payment(uuid,text,jsonb);
create or replace function public.complete_order_payment(p_order_id uuid, p_payment_method text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_order public.orders%rowtype; v_payment_id uuid;
begin
  if coalesce(public.current_shop_role(),'') <> 'staff' then
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

drop table public.payment_allocations;
alter table public.payments drop constraint payments_satang_valid;
alter table public.payments drop column request_id,drop column request_payload,drop column received_by,drop column amount_satang;
alter table public.payments add constraint payments_order_id_key unique(order_id);
commit;
