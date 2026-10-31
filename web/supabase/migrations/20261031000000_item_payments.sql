begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- Keep every historical payment row and its original order_id as the receipt
-- anchor. Allocations, rather than the anchor, define the orders paid for.
alter table public.payments drop constraint payments_order_id_key;
alter table public.payments add column request_id uuid unique;
alter table public.payments add column request_payload jsonb;
alter table public.payments add column received_by uuid references public.profiles(id);
alter table public.payments add column amount_satang bigint;
update public.payments set amount_satang=round(amount*100)::bigint;
alter table public.payments alter column amount_satang set not null;
alter table public.payments add constraint payments_satang_valid check(amount_satang>=0 and amount=amount_satang::numeric/100);

create table public.payment_allocations (
  payment_id uuid not null references public.payments(id),
  order_item_id bigint not null references public.order_items(id),
  quantity integer not null check(quantity>0),
  amount_satang bigint not null check(amount_satang>=0),
  primary key(payment_id,order_item_id)
);
create index payment_allocations_item_idx on public.payment_allocations(order_item_id);
alter table public.payment_allocations enable row level security;
revoke all on public.payment_allocations from public,anon,authenticated;
grant select on public.payment_allocations to authenticated;
grant select on public.payment_allocations to service_role;
create policy shop_read_allocations on public.payment_allocations for select to authenticated
  using(coalesce(public.current_shop_role(),'') in ('admin','staff'));

-- Abort on ambiguous legacy data rather than silently inventing allocations.
do $$ begin
  if exists(select 1 from public.payments p where p.status='paid' and
    p.amount_satang<>(select coalesce(sum(round(i.unit_price*100)::bigint*i.quantity),0) from public.order_items i where i.order_id=p.order_id)) then
    raise exception 'LEGACY_PAYMENT_TOTAL_REQUIRES_REVIEW';
  end if;
end $$;
insert into public.payment_allocations(payment_id,order_item_id,quantity,amount_satang)
select p.id,i.id,i.quantity,round(i.unit_price*100)::bigint*i.quantity
from public.payments p join public.order_items i on i.order_id=p.order_id where p.status='paid';

create function public.collect_item_payment(p_request_id uuid,p_method text,p_items jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_payload jsonb; v_existing public.payments%rowtype; v_id uuid;
  v_orders uuid[]; v_anchor uuid; v_session uuid; v_order public.orders%rowtype;
  v_item public.order_items%rowtype; v_line record; v_paid integer; v_total bigint:=0;
begin
  if coalesce(public.current_shop_role(),'')<>'staff' then raise exception using errcode='42501',message='STAFF_ROLE_REQUIRED'; end if;
  if p_request_id is null or p_method is null or p_method not in ('cash','qr_code')
    or jsonb_typeof(p_items) is distinct from 'array' then raise exception 'INVALID_PAYMENT'; end if;
  if jsonb_array_length(p_items)=0 or jsonb_array_length(p_items)>500 then raise exception 'INVALID_PAYMENT'; end if;
  if exists(select 1 from jsonb_to_recordset(p_items) as x(item_id bigint,quantity integer)
    where item_id is null or quantity is null or quantity<=0) or
    (select count(*)<>count(distinct item_id) from jsonb_to_recordset(p_items) as x(item_id bigint,quantity integer)) then raise exception 'INVALID_ITEMS'; end if;
  select jsonb_build_object('method',p_method,'items',jsonb_agg(jsonb_build_object('item_id',item_id,'quantity',quantity) order by item_id))
    into v_payload from jsonb_to_recordset(p_items) as x(item_id bigint,quantity integer);
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
  select * into v_existing from public.payments where request_id=p_request_id;
  if found then
    if v_existing.request_payload is distinct from v_payload then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return jsonb_build_object('payment_id',v_existing.id,'amount_satang',v_existing.amount_satang);
  end if;
  select array_agg(distinct i.order_id order by i.order_id) into v_orders from public.order_items i
    join jsonb_to_recordset(p_items) as x(item_id bigint,quantity integer) on x.item_id=i.id;
  if v_orders is null or (select count(*) from public.order_items i join jsonb_to_recordset(p_items) as x(item_id bigint,quantity integer) on x.item_id=i.id)<>jsonb_array_length(p_items) then raise exception 'ITEM_NOT_FOUND'; end if;
  v_anchor:=v_orders[1];
  -- All collectors lock orders in the same order, including legacy callers.
  for v_order in select * from public.orders where id=any(v_orders) order by id for update loop
    if v_order.status<>'served' or not v_order.stock_deducted then raise exception 'ORDER_NOT_SERVED'; end if;
    if round(v_order.total_amount*100)::bigint<>(select coalesce(sum(round(i.unit_price*100)::bigint*i.quantity),0) from public.order_items i where i.order_id=v_order.id) then raise exception 'ORDER_TOTAL_REQUIRES_REVIEW'; end if;
    if v_order.id=v_anchor then v_session:=v_order.session_id;
    elsif v_session is null or v_order.session_id is distinct from v_session then raise exception 'DIFFERENT_DINING_SESSION'; end if;
    if exists(select 1 from public.payments p where p.order_id=v_order.id and p.status='pending') then raise exception 'PENDING_PAYMENT_REQUIRES_REVIEW'; end if;
  end loop;
  for v_line in select * from jsonb_to_recordset(p_items) as x(item_id bigint,quantity integer) order by item_id loop
    select * into v_item from public.order_items where id=v_line.item_id for update;
    select coalesce(sum(a.quantity),0) into v_paid from public.payment_allocations a join public.payments p on p.id=a.payment_id where a.order_item_id=v_item.id and p.status='paid';
    if v_paid+v_line.quantity>v_item.quantity then raise exception 'ITEM_ALREADY_PAID'; end if;
    v_total:=v_total+round(v_item.unit_price*100)::bigint*v_line.quantity;
  end loop;
  insert into public.payments(order_id,payment_method,amount,amount_satang,status,paid_at,request_id,request_payload,received_by)
    values(v_anchor,p_method,v_total::numeric/100,v_total,'paid',now(),p_request_id,v_payload,auth.uid()) returning id into v_id;
  insert into public.payment_allocations(payment_id,order_item_id,quantity,amount_satang)
    select v_id,i.id,x.quantity,round(i.unit_price*100)::bigint*x.quantity from public.order_items i
    join jsonb_to_recordset(p_items) as x(item_id bigint,quantity integer) on x.item_id=i.id;
  update public.orders o set status='completed',updated_at=now() where o.id=any(v_orders) and o.status='served'
    and not exists(select 1 from public.order_items i where i.order_id=o.id and i.quantity<>(
      select coalesce(sum(a.quantity),0) from public.payment_allocations a join public.payments p on p.id=a.payment_id where a.order_item_id=i.id and p.status='paid'));
  -- Wake existing order subscriptions and fallback fingerprints for partial pays.
  update public.orders set updated_at=now() where id=any(v_orders);
  return jsonb_build_object('payment_id',v_id,'amount_satang',v_total);
end $$;
revoke all on function public.collect_item_payment(uuid,text,jsonb) from public,anon;
grant execute on function public.collect_item_payment(uuid,text,jsonb) to authenticated;

create or replace function public.complete_order_payment(p_order_id uuid,p_payment_method text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_items jsonb; v_receipt jsonb;
begin
  if coalesce(public.current_shop_role(),'')<>'staff' then raise exception using errcode='42501',message='STAFF_ROLE_REQUIRED'; end if;
  perform 1 from public.orders where id=p_order_id and status='served' for update;
  if not found then raise exception 'ORDER_NOT_SERVED'; end if;
  select jsonb_agg(jsonb_build_object('item_id',id,'quantity',remaining)) into v_items from (
    select i.id,i.quantity-coalesce((select sum(a.quantity) from public.payment_allocations a join public.payments p on p.id=a.payment_id where a.order_item_id=i.id and p.status='paid'),0) remaining
    from public.order_items i where i.order_id=p_order_id) x where remaining>0;
  v_receipt:=public.collect_item_payment(gen_random_uuid(),p_payment_method,coalesce(v_items,'[]'));
  return v_receipt || jsonb_build_object('success',true,'order_id',p_order_id,'payment_method',p_payment_method,'amount',(v_receipt->>'amount_satang')::numeric/100);
end $$;
commit;
