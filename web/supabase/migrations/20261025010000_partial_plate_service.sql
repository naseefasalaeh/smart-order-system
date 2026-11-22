begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.order_items add column served_plates integer[] not null default '{}';
-- Preserve historical workflow: old ready orders are already cooked; old
-- served/completed orders are already delivered. Do not invent audit actors.
update public.order_items i set completed_plates=array(select generate_series(1,i.quantity))
  from public.orders o where o.id=i.order_id and o.status in ('ready','served','completed');
update public.order_items i set served_plates=completed_plates
  from public.orders o where o.id=i.order_id and o.status in ('served','completed');
-- Old screens required a separate ready button after the final kitchen tick.
-- Finish those already-cooked orders so the new automatic flow cannot stall FCFS.
update public.orders o set status='ready',updated_at=now()
  where o.status='preparing' and exists(select 1 from public.order_items i where i.order_id=o.id)
    and not exists(select 1 from public.order_items i where i.order_id=o.id and cardinality(i.completed_plates)<>i.quantity);

create function public.valid_plate_numbers(p_numbers integer[], p_quantity integer)
returns boolean language sql immutable set search_path='' as $$
  select p_numbers is not null and not exists(
    select 1 from unnest(p_numbers) n where n is null or n<1 or n>p_quantity
  ) and cardinality(p_numbers)=(select count(distinct n) from unnest(p_numbers) n)
$$;
alter table public.order_items add constraint order_item_plate_progress_valid check (
  public.valid_plate_numbers(completed_plates,quantity) and
  public.valid_plate_numbers(served_plates,quantity) and served_plates <@ completed_plates
);

create function public.reject_client_plate_progress() returns trigger
language plpgsql set search_path='' as $$
begin
  if current_user in ('anon','authenticated') and
    (cardinality(new.completed_plates)>0 or cardinality(new.served_plates)>0) then
    raise exception using errcode='42501',message='PLATE_RPC_REQUIRED';
  end if;
  return new;
end $$;
create trigger reject_client_plate_progress before insert on public.order_items
  for each row execute function public.reject_client_plate_progress();

create table public.order_plate_services (
  order_item_id bigint not null references public.order_items(id) on delete cascade,
  plate integer not null check(plate>0),
  served_at timestamptz not null default now(),
  served_by uuid not null references public.profiles(id),
  primary key(order_item_id,plate)
);
alter table public.order_plate_services enable row level security;
revoke all on public.order_plate_services from anon,authenticated;
grant select on public.order_plate_services to authenticated;
create policy active_staff_read_plate_services on public.order_plate_services for select to authenticated
  using (coalesce(public.current_shop_role(),'') in ('admin','staff','kitchen_staff'));

create or replace function public.set_kitchen_plate(p_item_id bigint,p_plate integer,p_completed boolean)
returns void language plpgsql security definer set search_path='' as $$
declare v_order_id uuid; v_status text; v_item public.order_items%rowtype;
begin
  if coalesce(public.current_shop_role(),'') <> 'kitchen_staff' then
    raise exception using errcode='42501',message='KITCHEN_ROLE_REQUIRED';
  end if;
  -- Same lock order as FCFS transitions. Last cooked plate releases the queue.
  perform pg_advisory_xact_lock(20261025,1);
  select order_id into v_order_id from public.order_items where id=p_item_id;
  select status into v_status from public.orders where id=v_order_id for update;
  select * into v_item from public.order_items where id=p_item_id for update;
  if not found or p_plate is null or p_plate<1 or p_plate>v_item.quantity or p_completed is null then
    raise exception 'INVALID_PLATE';
  end if;
  if p_completed and p_plate=any(v_item.completed_plates) then return; end if;
  if p_plate=any(v_item.served_plates) then raise exception 'PLATE_ALREADY_SERVED'; end if;
  if v_status is distinct from 'preparing' then raise exception 'ORDER_NOT_PREPARING'; end if;
  update public.order_items set completed_plates=case when p_completed
    then array_append(completed_plates,p_plate) else array_remove(completed_plates,p_plate) end where id=p_item_id;
  update public.orders set updated_at=now(),status=case when not exists(
    select 1 from public.order_items where order_id=v_order_id and cardinality(completed_plates)<>quantity
  ) then 'ready' else 'preparing' end where id=v_order_id;
end $$;

create function public.serve_order_plate(p_item_id bigint,p_plate integer)
returns void language plpgsql security definer set search_path='' as $$
declare v_order_id uuid; v_order public.orders%rowtype; v_item public.order_items%rowtype;
begin
  if coalesce(public.current_shop_role(),'') <> 'staff' then
    raise exception using errcode='42501',message='STAFF_ROLE_REQUIRED';
  end if;
  select order_id into v_order_id from public.order_items where id=p_item_id;
  select * into v_order from public.orders where id=v_order_id for update;
  select * into v_item from public.order_items where id=p_item_id for update;
  if not found or p_plate is null or p_plate<1 or p_plate>v_item.quantity then raise exception 'INVALID_PLATE'; end if;
  -- A stale terminal retries this specific plate, never the next available one.
  if p_plate=any(v_item.served_plates) then return; end if;
  if v_order.status not in ('preparing','ready') or not v_order.stock_deducted
     or not (p_plate=any(v_item.completed_plates)) then raise exception 'PLATE_NOT_READY'; end if;
  insert into public.order_plate_services(order_item_id,plate,served_by) values(p_item_id,p_plate,auth.uid());
  update public.order_items set served_plates=array_append(served_plates,p_plate) where id=p_item_id;
  if not exists(select 1 from public.order_items where order_id=v_order_id and cardinality(served_plates)<>quantity) then
    update public.orders set status='served',served_at=now(),served_by=auth.uid(),updated_at=now() where id=v_order_id;
  else
    update public.orders set updated_at=now() where id=v_order_id;
  end if;
end $$;
revoke all on function public.serve_order_plate(bigint,integer) from public,anon;
grant execute on function public.serve_order_plate(bigint,integer) to authenticated;

-- Compatibility for old terminals: a whole-order confirmation is only allowed
-- after all dishes are cooked, and records exactly the same plate audit rows.
create or replace function public.serve_order(p_order_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_order public.orders%rowtype; v_plate record;
begin
  if coalesce(public.current_shop_role(),'') <> 'staff' then
    raise exception using errcode='42501',message='STAFF_ROLE_REQUIRED';
  end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.status in ('served','completed') and v_order.served_at is not null then return; end if;
  if v_order.status<>'ready' or not v_order.stock_deducted or not exists(
    select 1 from public.order_items where order_id=p_order_id
  ) or exists(select 1 from public.order_items where order_id=p_order_id and cardinality(completed_plates)<>quantity)
    then raise exception 'ORDER_NOT_READY'; end if;
  for v_plate in select i.id,n.plate from public.order_items i
    cross join lateral unnest(i.completed_plates) n(plate)
    where i.order_id=p_order_id and not(n.plate=any(i.served_plates)) order by i.id,n.plate
  loop perform public.serve_order_plate(v_plate.id,v_plate.plate); end loop;
end $$;
commit;
