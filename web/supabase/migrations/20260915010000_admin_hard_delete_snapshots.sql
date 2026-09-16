begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create schema if not exists catalog_backup;
revoke all on schema catalog_backup from public,anon,authenticated;
create table catalog_backup.before_hard_delete (
  table_name text primary key, rows jsonb not null, captured_at timestamptz not null default now()
);
create table catalog_backup.hard_delete_events (
  id uuid primary key default gen_random_uuid(), actor_id uuid not null,
  kind text not null, catalog_id bigint not null, name text not null,
  snapshot jsonb not null, deleted_at timestamptz not null default now()
);
revoke all on catalog_backup.before_hard_delete,catalog_backup.hard_delete_events from public,anon,authenticated;
lock table public.menus,public.menu_option_groups,public.menu_options,public.addons,
  public.menu_ingredients,public.menu_option_ingredients,public.addon_ingredients,
  public.orders,public.order_items,public.order_item_options,public.order_ingredient_usages,
  public.ingredients,public.payments in share row exclusive mode;
do $$ declare t text; begin
  foreach t in array array['menus','menu_option_groups','menu_options','addons','menu_ingredients',
    'menu_option_ingredients','addon_ingredients','orders','order_items','order_item_options',
    'order_ingredient_usages','ingredients','payments'] loop
    execute format('insert into catalog_backup.before_hard_delete(table_name,rows) select %L,coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),''[]'') from public.%I r',t,t);
  end loop;
end $$;

-- Trusted profile role, never user-editable JWT metadata. No automatic promotion.
revoke insert,update,delete on public.profiles from public,anon,authenticated;
create function public.is_catalog_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(auth.role(),'')='authenticated' and exists(
    select 1 from public.profiles where id=auth.uid() and role='admin'
  );
$$;
revoke all on function public.is_catalog_admin() from public,anon;
grant execute on function public.is_catalog_admin() to authenticated;

alter table public.order_items
  add column menu_id_snapshot bigint,
  add column menu_name_snapshot text,
  add column menu_price_snapshot numeric;
update public.order_items oi set menu_id_snapshot=oi.menu_id,menu_name_snapshot=m.name,
  menu_price_snapshot=oi.unit_price from public.menus m where m.id=oi.menu_id;
alter table public.order_items
  alter column menu_id_snapshot set not null,
  alter column menu_name_snapshot set not null,
  alter column menu_price_snapshot set not null,
  alter column menu_id drop not null,
  drop constraint order_items_menu_id_fkey,
  add constraint order_items_menu_id_fkey foreign key(menu_id) references public.menus(id) on delete set null;

alter table public.order_item_options add column menu_option_id_snapshot bigint;
update public.order_item_options set menu_option_id_snapshot=menu_option_id;
alter table public.order_item_options drop constraint order_item_options_menu_option_id_fkey,
  add constraint order_item_options_menu_option_id_fkey foreign key(menu_option_id) references public.menu_options(id) on delete set null;

alter table public.order_ingredient_usages add column ingredient_id_snapshot bigint,
  add column ingredient_name_snapshot text,add column ingredient_unit_snapshot text;
update public.order_ingredient_usages u set ingredient_id_snapshot=u.ingredient_id,
  ingredient_name_snapshot=i.name,ingredient_unit_snapshot=i.unit from public.ingredients i where i.id=u.ingredient_id;
alter table public.order_ingredient_usages
  alter column ingredient_id_snapshot set not null,
  alter column ingredient_name_snapshot set not null,
  alter column ingredient_unit_snapshot set not null,
  alter column ingredient_id drop not null,
  drop constraint order_ingredient_usages_ingredient_id_fkey,
  add constraint order_ingredient_usages_ingredient_id_fkey foreign key(ingredient_id) references public.ingredients(id) on delete set null;

-- CASCADE is confined to recipe relations. History only detaches its FK.
alter table public.menu_ingredients drop constraint menu_ingredients_ingredient_id_fkey,
  add constraint menu_ingredients_ingredient_id_fkey foreign key(ingredient_id) references public.ingredients(id) on delete cascade;
alter table public.menu_option_ingredients drop constraint menu_option_ingredients_ingredient_id_fkey,
  add constraint menu_option_ingredients_ingredient_id_fkey foreign key(ingredient_id) references public.ingredients(id) on delete cascade;
alter table public.addon_ingredients drop constraint addon_ingredients_ingredient_id_fkey,
  add constraint addon_ingredients_ingredient_id_fkey foreign key(ingredient_id) references public.ingredients(id) on delete cascade;

create function public.capture_catalog_history() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name='order_items' then
    if tg_op='INSERT' then
      new.menu_id_snapshot := new.menu_id;
      select name into strict new.menu_name_snapshot from public.menus where id=new.menu_id;
      -- Actual charged unit price (including options), not today's catalog price.
      new.menu_price_snapshot := new.unit_price;
    else
      new.menu_id_snapshot := old.menu_id_snapshot;
      new.menu_name_snapshot := old.menu_name_snapshot;
      new.menu_price_snapshot := old.menu_price_snapshot;
    end if;
  elsif tg_table_name='order_item_options' then
    if tg_op='INSERT' then new.menu_option_id_snapshot := new.menu_option_id;
    else new.menu_option_id_snapshot := old.menu_option_id_snapshot; end if;
  else
    if tg_op='INSERT' then
      new.ingredient_id_snapshot := new.ingredient_id;
      select name,unit into strict new.ingredient_name_snapshot,new.ingredient_unit_snapshot
        from public.ingredients where id=new.ingredient_id;
    else
      new.ingredient_id_snapshot := old.ingredient_id_snapshot;
      new.ingredient_name_snapshot := old.ingredient_name_snapshot;
      new.ingredient_unit_snapshot := old.ingredient_unit_snapshot;
    end if;
  end if;
  return new;
end $$;
create trigger capture_menu_history before insert or update on public.order_items
  for each row execute function public.capture_catalog_history();
create trigger capture_option_history before insert or update on public.order_item_options
  for each row execute function public.capture_catalog_history();
create trigger capture_ingredient_history before insert or update on public.order_ingredient_usages
  for each row execute function public.capture_catalog_history();
revoke all on function public.capture_catalog_history() from public,anon,authenticated;

-- Direct table DELETE is not an alternate path around checks, even for Admin.
revoke delete,truncate on public.menus,public.ingredients from public,anon,authenticated;
drop function public.delete_catalog_item_safely(text,bigint,text,boolean);
create function public.delete_catalog_item_safely(p_kind text,p_id bigint,p_name text)
returns jsonb language plpgsql security definer set search_path = '' set lock_timeout = '5s' as $$
declare v_name text; v_orders jsonb; v_snapshot jsonb;
begin
  if not public.is_catalog_admin() then raise exception using errcode='42501',message='ADMIN_REQUIRED'; end if;
  if p_kind is null or p_kind not in ('menu','ingredient') or p_id is null or p_id<=0 or p_name is null
    then raise exception 'INVALID_INPUT'; end if;
  -- Same catalog -> order -> ingredient lock order as creation/cancellation.
  -- New order transactions cannot slip between the active-usage check and delete.
  lock table public.menus,public.menu_option_groups,public.menu_options,public.addons,
    public.menu_ingredients,public.menu_option_ingredients,public.addon_ingredients in share row exclusive mode;
  lock table public.orders,public.order_items,public.order_item_options,public.order_ingredient_usages in share row exclusive mode;
  lock table public.ingredients in share row exclusive mode;
  if p_kind='menu' then select name into v_name from public.menus where id=p_id;
  else select name into v_name from public.ingredients where id=p_id; end if;
  if v_name is null then return jsonb_build_object('status','not_found'); end if;
  if v_name is distinct from p_name then return jsonb_build_object('status','name_changed'); end if;
  if p_kind='ingredient' then
    select jsonb_agg(jsonb_build_object('id',id,'order_number',order_number,'status',status) order by order_number)
      into v_orders from public.orders o where o.stock_deducted and o.status not in ('completed','cancelled')
      and (exists(select 1 from public.order_ingredient_usages u where u.order_id=o.id and u.ingredient_id=p_id)
        -- Legacy deducted orders without a usage record must be reconciled first.
        or not exists(select 1 from public.order_ingredient_usages u where u.order_id=o.id));
    if v_orders is not null then return jsonb_build_object('status','active_orders','orders',v_orders); end if;
  end if;
  if p_kind='menu' then
    select jsonb_build_object('menu',(select to_jsonb(m) from public.menus m where id=p_id),
      'base_recipes',(select coalesce(jsonb_agg(r),'[]') from public.menu_ingredients r where menu_id=p_id),
      'groups',(select coalesce(jsonb_agg(g),'[]') from public.menu_option_groups g where menu_id=p_id),
      'options',(select coalesce(jsonb_agg(o),'[]') from public.menu_options o where menu_id=p_id),
      'option_recipes',(select coalesce(jsonb_agg(r),'[]') from public.menu_option_ingredients r join public.menu_options o on o.id=r.menu_option_id where o.menu_id=p_id)) into v_snapshot;
    -- Backfill is verified before a parent can be removed. No history DELETE.
    if exists(select 1 from public.order_items where menu_id=p_id and (menu_name_snapshot is null or menu_price_snapshot is null)) then raise exception 'SNAPSHOT_REQUIRED'; end if;
  else
    select jsonb_build_object('ingredient',(select to_jsonb(i) from public.ingredients i where id=p_id),
      'base_recipes',(select coalesce(jsonb_agg(r),'[]') from public.menu_ingredients r where ingredient_id=p_id),
      'option_recipes',(select coalesce(jsonb_agg(r),'[]') from public.menu_option_ingredients r where ingredient_id=p_id),
      'addon_recipes',(select coalesce(jsonb_agg(r),'[]') from public.addon_ingredients r where ingredient_id=p_id)) into v_snapshot;
    if exists(select 1 from public.order_ingredient_usages where ingredient_id=p_id and (ingredient_name_snapshot is null or ingredient_unit_snapshot is null)) then raise exception 'SNAPSHOT_REQUIRED'; end if;
    -- Incomplete recipes must not silently sell with fewer ingredients.
    update public.menus set is_available=false where id in(select menu_id from public.menu_ingredients where ingredient_id=p_id);
    update public.menu_options set is_available=false where id in(select menu_option_id from public.menu_option_ingredients where ingredient_id=p_id);
    update public.addons set is_available=false where id in(select addon_id from public.addon_ingredients where ingredient_id=p_id);
  end if;
  insert into catalog_backup.hard_delete_events(actor_id,kind,catalog_id,name,snapshot)
    values(auth.uid(),p_kind,p_id,v_name,v_snapshot);
  if p_kind='menu' then delete from public.menus where id=p_id;
  else delete from public.ingredients where id=p_id; end if;
  return jsonb_build_object('status','deleted');
end $$;
revoke all on function public.delete_catalog_item_safely(text,bigint,text) from public,anon;
grant execute on function public.delete_catalog_item_safely(text,bigint,text) to authenticated;

-- Never silently skip detached history if a completed order is later reopened.
create or replace function public.restore_order_stock() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status='cancelled' and old.status<>'cancelled' and old.stock_deducted then
    if old.status='completed' then raise exception 'COMPLETED_ORDER'; end if;
    if not exists(select 1 from public.order_ingredient_usages where order_id=old.id) then raise exception 'ORDER_USAGE_NOT_FOUND'; end if;
    if exists(select 1 from public.order_ingredient_usages where order_id=old.id and ingredient_id is null) then raise exception 'STOCK_HISTORY_DETACHED'; end if;
    update public.ingredients i set stock_quantity=i.stock_quantity+u.quantity_used,updated_at=now()
      from public.order_ingredient_usages u where u.order_id=old.id and i.id=u.ingredient_id;
    new.stock_deducted := false;
  end if;
  return new;
end $$;

-- Backfill may add snapshots only; all pre-existing history values must match.
do $$ declare t text; actual jsonb; expected jsonb; begin
  foreach t in array array['orders','order_items','order_item_options','order_ingredient_usages','payments'] loop
    execute format('select coalesce(jsonb_agg(v order by v::text),''[]'') from (select to_jsonb(r)-ARRAY[''menu_id_snapshot'',''menu_name_snapshot'',''menu_price_snapshot'',''menu_option_id_snapshot'',''ingredient_id_snapshot'',''ingredient_name_snapshot'',''ingredient_unit_snapshot''] v from public.%I r) x',t) into actual;
    select rows into expected from catalog_backup.before_hard_delete where table_name=t;
    if actual is distinct from expected then raise exception 'HISTORY_CHANGED: %',t; end if;
  end loop;
end $$;
commit;
