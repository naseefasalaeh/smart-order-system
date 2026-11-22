begin;
set local lock_timeout = '5s';

alter table public.order_items add column completed_plates integer[] not null default '{}';
revoke update on public.order_items from anon, authenticated;
create index orders_kitchen_queue_idx on public.orders(created_at, order_number, id)
  where status in ('confirmed','preparing');

create or replace function public.advance_order_status(p_order_id uuid, p_expected text, p_next text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_status text; v_first uuid;
begin
  if coalesce(public.current_shop_role(),'') <> 'kitchen_staff' then
    raise exception using errcode='42501', message='KITCHEN_ROLE_REQUIRED';
  end if;
  if not coalesce((p_expected='confirmed' and p_next='preparing') or
                 (p_expected='preparing' and p_next='ready'),false) then
    raise exception 'INVALID_TRANSITION';
  end if;
  -- Serialize kitchen transitions across all terminals, including ready -> next start.
  perform pg_advisory_xact_lock(20261025, 1);
  select status into v_status from public.orders where id=p_order_id for update;
  if not found or v_status is distinct from p_expected then raise exception 'ORDER_STATUS_CHANGED'; end if;
  if p_next='preparing' then
    select id into v_first from public.orders where status in ('confirmed','preparing')
      order by created_at, order_number, id limit 1;
    if v_first is distinct from p_order_id or exists(
      select 1 from public.orders where status='preparing' and id<>p_order_id
    ) then raise exception 'WAIT_PREVIOUS_ORDER'; end if;
  else
    if not exists(select 1 from public.order_items where order_id=p_order_id) or exists(
      select 1 from public.order_items where order_id=p_order_id and cardinality(completed_plates)<>quantity
    ) then raise exception 'PLATES_INCOMPLETE'; end if;
  end if;
  update public.orders set status=p_next, updated_at=now() where id=p_order_id;
end $$;

create function public.set_kitchen_plate(p_item_id bigint,p_plate integer,p_completed boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_order_id uuid; v_status text; v_item public.order_items%rowtype;
begin
  if coalesce(public.current_shop_role(),'') <> 'kitchen_staff' then
    raise exception using errcode='42501', message='KITCHEN_ROLE_REQUIRED';
  end if;
  select order_id into v_order_id from public.order_items where id=p_item_id;
  select status into v_status from public.orders where id=v_order_id for update;
  if v_status is distinct from 'preparing' then raise exception 'ORDER_NOT_PREPARING'; end if;
  select * into v_item from public.order_items where id=p_item_id for update;
  if p_plate is null or p_plate<1 or p_plate>v_item.quantity or p_completed is null then
    raise exception 'INVALID_PLATE';
  end if;
  update public.order_items set completed_plates=case
    when p_completed and not (p_plate=any(completed_plates)) then array_append(completed_plates,p_plate)
    when not p_completed then array_remove(completed_plates,p_plate)
    else completed_plates end where id=p_item_id;
  -- Reuse orders realtime events so all kitchen screens refresh their plate counts.
  update public.orders set updated_at=now() where id=v_order_id;
end $$;
revoke all on function public.set_kitchen_plate(bigint,integer,boolean) from public,anon;
grant execute on function public.set_kitchen_plate(bigint,integer,boolean) to authenticated;
commit;
