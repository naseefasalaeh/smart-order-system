begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='is_active') then
    raise exception 'profiles.is_active already exists';
  end if;
  if (select count(*) from pg_policies where schemaname='public') <> 40 then
    raise exception 'Unexpected public RLS policy count';
  end if;
  if exists (select 1 from public.profiles where role not in ('admin','staff','kitchen_staff')) then
    raise exception 'Unexpected profile role';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid='auth.users'::regclass and tgname='on_auth_user_created' and not tgisinternal) then
    raise exception 'Expected auth profile trigger is missing';
  end if;
end $$;

alter table public.profiles add column is_active boolean not null default true;
update public.profiles set is_active=true where is_active is distinct from true;

create or replace function public.current_shop_role() returns text
language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p where p.id=auth.uid() and p.is_active=true
$$;
revoke all on function public.current_shop_role() from public,anon;
grant execute on function public.current_shop_role() to authenticated,service_role;

create function public.is_active_shop_user() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.current_shop_role() is not null
$$;
revoke all on function public.is_active_shop_user() from public,anon;
grant execute on function public.is_active_shop_user() to authenticated,service_role;

create or replace function public.is_catalog_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.current_shop_role() = 'admin'
$$;
revoke all on function public.is_catalog_admin() from public,anon;
grant execute on function public.is_catalog_admin() to authenticated,service_role;

-- Public QR reads stay available to the anon role. A signed-in inactive staff
-- token cannot fall through a permissive policy intended for public visitors.
alter policy "Public can view ingredients for availability" on public.ingredients to anon;
alter policy "Public can view menu ingredients" on public.menu_ingredients to anon;
alter policy "Public can view available menu options" on public.menu_options to anon;
alter policy "Public can view available menus" on public.menus to anon;
alter policy "Public can create order item options" on public.order_item_options to anon;
alter policy customer_can_create_order_items on public.order_items to anon;
alter policy customer_can_read_order_items on public.order_items to anon;
alter policy customer_can_create_orders on public.orders to anon;
alter policy public_read_table_aliases on public.restaurant_table_aliases to anon;
alter policy "Public can view restaurant tables" on public.restaurant_tables to anon;

alter policy staff_read_addon_recipes on public.addon_ingredients using (public.is_active_shop_user());
alter policy staff_read_addons on public.addons using (public.is_active_shop_user());
alter policy "Authenticated users can read categories" on public.categories using (public.is_active_shop_user());
alter policy authenticated_can_read_ingredient_categories on public.ingredient_categories using (public.is_active_shop_user());
alter policy "Authenticated users can view ingredients" on public.ingredients using (public.is_active_shop_user());
alter policy "Authenticated users can read menu ingredients" on public.menu_ingredients using (public.is_active_shop_user());
alter policy authenticated_can_read_menu_option_groups on public.menu_option_groups using (public.is_active_shop_user());
alter policy authenticated_read_option_recipes on public.menu_option_ingredients using (public.is_active_shop_user());
alter policy authenticated_read_all_menu_options on public.menu_options using (public.is_active_shop_user());
alter policy "Authenticated users can view menus" on public.menus using (public.is_active_shop_user());
alter policy authenticated_read_ingredient_usages on public.order_ingredient_usages using (public.is_active_shop_user());
alter policy authenticated_read_order_item_options on public.order_item_options using (public.is_active_shop_user());
alter policy "Authenticated users can view order items" on public.order_items using (public.is_active_shop_user());
alter policy "Authenticated users can view orders" on public.orders using (public.is_active_shop_user());
alter policy "Authenticated users can view payments" on public.payments using (public.is_active_shop_user());
alter policy authenticated_read_own_profile on public.profiles using (auth.uid()=id and public.is_active_shop_user());
alter policy "Authenticated users can view restaurant tables" on public.restaurant_tables using (public.is_active_shop_user());
create policy authenticated_read_table_aliases on public.restaurant_table_aliases
  for select to authenticated using (public.is_active_shop_user());

-- Sign-ups before the Auth setting is disabled cannot acquire staff access.
-- Admin-created users are activated only by the guarded management RPC.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id,full_name,role,is_active)
  values(new.id,coalesce(new.raw_user_meta_data->>'full_name',new.email),'staff',false);
  return new;
end $$;
revoke all on function public.handle_new_user() from public,anon,authenticated;

create function public.protect_last_active_admin() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.role='admin' and old.is_active and (new.role<>'admin' or not new.is_active) then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('active_shop_last_admin',0));
    if auth.uid()=old.id then raise exception using errcode='42501',message='CANNOT_DISABLE_SELF_ADMIN'; end if;
    if (select count(*) from public.profiles where role='admin' and is_active) <= 1 then
      raise exception using errcode='42501',message='LAST_ACTIVE_ADMIN';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.protect_last_active_admin() from public,anon,authenticated;
create trigger protect_last_active_admin before update of role,is_active on public.profiles
  for each row execute function public.protect_last_active_admin();

create function public.manage_staff_profile(p_actor_id uuid,p_target_id uuid,p_role text,p_is_active boolean,p_full_name text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor public.profiles%rowtype; v_target public.profiles%rowtype;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception using errcode='42501',message='SERVICE_ROLE_REQUIRED'; end if;
  if p_role not in ('admin','staff','kitchen_staff') or p_is_active is null or nullif(pg_catalog.btrim(p_full_name),'') is null
    or pg_catalog.length(p_full_name)>120 then raise exception using errcode='22023',message='INVALID_PROFILE'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('active_shop_last_admin',0));
  select * into v_actor from public.profiles where id=p_actor_id for update;
  if not found or v_actor.role<>'admin' or not v_actor.is_active then raise exception using errcode='42501',message='ACTIVE_ADMIN_REQUIRED'; end if;
  select * into v_target from public.profiles where id=p_target_id for update;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;
  if p_actor_id=p_target_id and (p_role<>'admin' or not p_is_active) then
    raise exception using errcode='42501',message='CANNOT_DISABLE_SELF_ADMIN';
  end if;
  if v_target.role='admin' and v_target.is_active and (p_role<>'admin' or not p_is_active)
    and (select count(*) from public.profiles where role='admin' and is_active)<=1 then
    raise exception using errcode='42501',message='LAST_ACTIVE_ADMIN';
  end if;
  update public.profiles set role=p_role,is_active=p_is_active,full_name=pg_catalog.btrim(p_full_name)
    where id=p_target_id;
end $$;
revoke all on function public.manage_staff_profile(uuid,uuid,text,boolean,text) from public,anon,authenticated;
grant execute on function public.manage_staff_profile(uuid,uuid,text,boolean,text) to service_role;

commit;
