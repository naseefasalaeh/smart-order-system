begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

alter table public.ingredients
  add column reset_every_days integer,
  add column reset_start_date date,
  add column reset_time time(0),
  add column reset_next_at timestamptz,
  add column reset_last_at timestamptz,
  add constraint ingredient_reset_config_valid check (
    (reset_every_days is null and reset_start_date is null and reset_time is null and reset_next_at is null)
    or (reset_every_days is not null and reset_every_days between 1 and 3650 and reset_start_date is not null and isfinite(reset_start_date)
      and reset_time is not null and reset_time < time '24:00' and reset_next_at is not null)
  );
create index ingredients_reset_due_idx on public.ingredients(reset_next_at) where reset_next_at is not null;

create function public.next_ingredient_reset(p_start date,p_time time,p_days integer,p_after timestamptz)
returns timestamptz language plpgsql immutable set search_path='' as $$
declare anchor timestamp; slot numeric;
begin
  if p_start is null or not isfinite(p_start) or p_time is null or p_time>=time '24:00'
    or p_days is null or p_days<1 or p_days>3650 or p_after is null or not isfinite(p_after) then
    raise exception 'INVALID_RESET_SCHEDULE';
  end if;
  anchor:=p_start+p_time;
  slot:=greatest(0,floor(extract(epoch from ((p_after at time zone 'Asia/Bangkok')-anchor))/(86400*p_days))+1);
  return (anchor+slot::integer*p_days*interval '1 day') at time zone 'Asia/Bangkok';
end $$;

-- A single cursor, not stock history. Missed periods collapse into one reset;
-- retries cannot clear stock refilled after that period was consumed.
create function public.apply_ingredient_reset(p_id bigint,p_now timestamptz)
returns boolean language plpgsql security definer set search_path='' as $$
declare item public.ingredients%rowtype; next_at timestamptz;
begin
  select * into item from public.ingredients where id=p_id for update;
  if not found or item.reset_next_at is null or item.reset_next_at>p_now then return false; end if;
  next_at:=public.next_ingredient_reset(item.reset_start_date,item.reset_time,item.reset_every_days,p_now);
  update public.ingredients set stock_quantity=0,reset_next_at=next_at,
    reset_last_at=((next_at at time zone 'Asia/Bangkok')-item.reset_every_days*interval '1 day') at time zone 'Asia/Bangkok',
    updated_at=clock_timestamp() where id=p_id;
  return true;
end $$;
revoke all on function public.apply_ingredient_reset(bigint,timestamptz) from public,anon,authenticated,service_role;

create function public.run_ingredient_stock_resets()
returns integer language plpgsql security definer set search_path='' as $$
declare item record; applied integer:=0; v_now timestamptz:=clock_timestamp();
begin
  for item in select id from public.ingredients where reset_next_at<=v_now order by id for update skip locked loop
    if public.apply_ingredient_reset(item.id,v_now) then applied:=applied+1; end if;
  end loop;
  return applied;
end $$;
revoke all on function public.run_ingredient_stock_resets() from public,anon,authenticated;
grant execute on function public.run_ingredient_stock_resets() to service_role;

-- Guard the small interval between the configured minute and the cron worker.
-- No expired free stock may be sold. A cancellation returns ONLY its already
-- deducted usage, never resurrects the expired free balance.
create function public.guard_due_ingredient_stock() returns trigger
language plpgsql set search_path='' as $$
declare v_now timestamptz:=clock_timestamp(); next_at timestamptz;
begin
  if old.reset_next_at is not null and old.reset_next_at<=v_now
    and new.reset_next_at is not distinct from old.reset_next_at then
    if new.stock_quantity<old.stock_quantity then raise exception 'INSUFFICIENT_STOCK'; end if;
    new.stock_quantity:=new.stock_quantity-old.stock_quantity;
    next_at:=public.next_ingredient_reset(old.reset_start_date,old.reset_time,old.reset_every_days,v_now);
    new.reset_next_at:=next_at;
    new.reset_last_at:=((next_at at time zone 'Asia/Bangkok')-old.reset_every_days*interval '1 day') at time zone 'Asia/Bangkok';
    new.updated_at:=v_now;
  end if;
  return new;
end $$;
create trigger guard_due_ingredient_stock before update on public.ingredients
  for each row execute function public.guard_due_ingredient_stock();

-- Stock and scheduling writes use the same row lock as the scheduler. Keep
-- metadata/category maintenance available under the existing admin RLS policy.
revoke update on public.ingredients from authenticated;
grant update(name,unit,minimum_stock,category_id,updated_at) on public.ingredients to authenticated;

create function public.save_ingredient(p_id bigint,p_values jsonb,p_expected_updated_at timestamptz default null)
returns bigint language plpgsql security definer set search_path='' as $$
declare item public.ingredients%rowtype; saved_id bigint; category bigint;
  days integer; starts date; at_time time; next_at timestamptz;
  stock numeric; minimum numeric; item_name text; item_unit text; v_now timestamptz:=clock_timestamp();
begin
  if not public.is_catalog_admin() then raise exception using errcode='42501',message='ADMIN_REQUIRED'; end if;
  item_name:=nullif(btrim(p_values->>'name'),''); item_unit:=nullif(btrim(p_values->>'unit'),'');
  category:=(p_values->>'category_id')::bigint; minimum:=(p_values->>'minimum_stock')::numeric;
  days:=(p_values->>'reset_every_days')::integer;
  if days is not null then
    starts:=(p_values->>'reset_start_date')::date; at_time:=(p_values->>'reset_time')::time;

  end if;
  if item_name is null or item_unit is null or minimum is null or minimum<0 or minimum::text in ('NaN','Infinity','-Infinity') then
    raise exception 'INVALID_INGREDIENT';
  end if;
  if p_id is not null then
    select * into item from public.ingredients where id=p_id for update;
    if not found then raise exception 'INGREDIENT_NOT_FOUND'; end if;
    if item.updated_at is distinct from p_expected_updated_at then raise exception 'INGREDIENT_CHANGED'; end if;
    v_now:=clock_timestamp();
    perform public.apply_ingredient_reset(p_id,v_now);
    select * into item from public.ingredients where id=p_id;
  end if;
  if category is not null and not exists(select 1 from public.ingredient_categories where id=category
      and (is_active or (p_id is not null and id=item.category_id))) then raise exception 'INVALID_CATEGORY'; end if;
  stock:=case when p_values ? 'stock_quantity' then (p_values->>'stock_quantity')::numeric
    when p_id is not null then item.stock_quantity else 0 end;
  if stock is null or stock<0 or stock::text in ('NaN','Infinity','-Infinity') then raise exception 'INVALID_STOCK'; end if;
  if days is not null then next_at:=public.next_ingredient_reset(starts,at_time,days,clock_timestamp()); end if;
  if p_id is null then
    insert into public.ingredients(name,unit,category_id,minimum_stock,stock_quantity,reset_every_days,reset_start_date,reset_time,reset_next_at)
      values(item_name,item_unit,category,minimum,stock,days,starts,at_time,next_at) returning id into saved_id;
  else
    if (days,starts,at_time) is not distinct from (item.reset_every_days,item.reset_start_date,item.reset_time) then
      next_at:=item.reset_next_at;
    end if;
    update public.ingredients set name=item_name,unit=item_unit,category_id=category,minimum_stock=minimum,
      stock_quantity=stock,reset_every_days=days,reset_start_date=starts,reset_time=at_time,reset_next_at=next_at,
      reset_last_at=case when (days,starts,at_time) is distinct from (item.reset_every_days,item.reset_start_date,item.reset_time)
        then null else item.reset_last_at end,updated_at=clock_timestamp() where id=p_id returning id into saved_id;
  end if;
  return saved_id;
end $$;
revoke all on function public.save_ingredient(bigint,jsonb,timestamptz) from public,anon;
grant execute on function public.save_ingredient(bigint,jsonb,timestamptz) to authenticated;
commit;
