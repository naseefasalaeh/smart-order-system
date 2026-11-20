-- Migration: Member Management System
-- Provides auto-generated member_code (MEM-XXXXX), customer registration/login,
-- 1-click admin approval/rejection, customer profile/history, Admin Member CRUD (Add/Edit/Delete), and Marketing Analytics.

begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- 1. Automatic Member Code Sequence and Trigger
create sequence if not exists public.member_code_seq start with 1 increment by 1 minvalue 1;

alter table public.members
  add column if not exists member_code text unique,
  add column if not exists password_hash text;

create or replace function public.set_member_code()
returns trigger as $$
begin
  if new.member_code is null or new.member_code = '' then
    new.member_code := 'MEM-' || lpad(nextval('public.member_code_seq')::text, 5, '0');
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_set_member_code on public.members;
create trigger trg_set_member_code
  before insert on public.members
  for each row execute function public.set_member_code();

-- Backfill any existing members without member_code
update public.members
  set member_code = 'MEM-' || lpad(nextval('public.member_code_seq')::text, 5, '0')
  where member_code is null;

-- Drop check constraint requiring phone_verified to always be false so login / verification works smoothly
alter table public.members drop constraint if exists members_phone_verified_check;

-- Ensure foreign key from orders to members supports on delete set null
alter table public.orders drop constraint if exists orders_member_id_fkey;
alter table public.orders add constraint orders_member_id_fkey
  foreign key (member_id) references public.members(id) on delete set null;

-- 2. Customer Member Registration
-- Must strictly prevent duplicate registration if phone already exists
create or replace function public.enroll_member_request(
  p_phone text,
  p_gender text,
  p_age text,
  p_promotions boolean,
  p_hash text
)
returns table(id uuid, member_code text, phone text, gender text, age_range text, promotion_consent boolean, created_at timestamptz, is_active boolean)
language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_phone, 3));

  select m.id into v_id from public.members m where m.phone = p_phone;
  if found then
    raise exception 'PHONE_ALREADY_EXISTS';
  end if;

  insert into public.members(phone, gender, age_range, promotion_consent)
    values(p_phone, coalesce(p_gender, 'unspecified'), coalesce(p_age, 'unspecified'), coalesce(p_promotions, false))
    returning public.members.id into v_id;

  insert into public.member_devices(token_hash, member_id, active, expires_at)
    values(p_hash, v_id, false, now() + interval '180 days')
    on conflict(token_hash) do update
      set member_id = v_id, active = false, expires_at = now() + interval '180 days', revoked_at = null;

  return query select m.id, m.member_code, m.phone, m.gender, m.age_range, m.promotion_consent, m.created_at, false
    from public.members m where m.id = v_id;
end $$;
revoke all on function public.enroll_member_request(text,text,text,boolean,text) from public,anon,authenticated;
grant execute on function public.enroll_member_request(text,text,text,boolean,text) to service_role;

-- Backward compatible enroll_member_password
create or replace function public.enroll_member_password(
  p_phone text,
  p_password_hash text,
  p_gender text,
  p_age text,
  p_promotions boolean,
  p_hash text
)
returns table(id uuid, member_code text, phone text, gender text, age_range text, promotion_consent boolean, created_at timestamptz)
language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_phone, 3));

  select m.id into v_id from public.members m where m.phone = p_phone;
  if found then
    raise exception 'PHONE_ALREADY_EXISTS';
  end if;

  insert into public.members(phone, password_hash, gender, age_range, promotion_consent)
    values(p_phone, p_password_hash, p_gender, p_age, coalesce(p_promotions, false))
    returning public.members.id into v_id;

  insert into public.member_devices(token_hash, member_id, active, expires_at)
    values(p_hash, v_id, true, now() + interval '180 days')
    on conflict(token_hash) do update
      set member_id = v_id, active = true, expires_at = now() + interval '180 days', revoked_at = null;

  return query select m.id, m.member_code, m.phone, m.gender, m.age_range, m.promotion_consent, m.created_at
    from public.members m where m.id = v_id;
end $$;
revoke all on function public.enroll_member_password(text,text,text,text,boolean,text) from public,anon,authenticated;
grant execute on function public.enroll_member_password(text,text,text,text,boolean,text) to service_role;

-- Lookup member credentials by phone for login
create or replace function public.member_get_by_phone(p_phone text)
returns table(id uuid, member_code text, phone text, password_hash text, gender text, age_range text, promotion_consent boolean, created_at timestamptz)
language plpgsql security definer set search_path='' as $$
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  return query select m.id, m.member_code, m.phone, m.password_hash, m.gender, m.age_range, m.promotion_consent, m.created_at
    from public.members m where m.phone = p_phone;
end $$;
revoke all on function public.member_get_by_phone(text) from public,anon,authenticated;
grant execute on function public.member_get_by_phone(text) to service_role;

-- Login member by phone
create or replace function public.member_login(p_phone text, p_hash text)
returns table(id uuid, member_code text, phone text, gender text, age_range text, promotion_consent boolean, created_at timestamptz, is_active boolean)
language plpgsql security definer set search_path='' as $$
declare v_member_id uuid; v_active boolean := false;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  select m.id into v_member_id from public.members m where m.phone = p_phone;
  if not found then
    raise exception 'MEMBER_NOT_FOUND';
  end if;

  -- Check if member has ever been active/approved
  select exists(select 1 from public.member_devices where member_id = v_member_id and (active or reviewed_at is not null)) into v_active;

  insert into public.member_devices(token_hash, member_id, active, expires_at)
    values(p_hash, v_member_id, v_active, now() + interval '180 days')
    on conflict(token_hash) do update
      set member_id = v_member_id, active = v_active, expires_at = now() + interval '180 days', revoked_at = null;

  return query select m.id, m.member_code, m.phone, m.gender, m.age_range, m.promotion_consent, m.created_at, v_active
    from public.members m where m.id = v_member_id;
end $$;
revoke all on function public.member_login(text,text) from public,anon,authenticated;
grant execute on function public.member_login(text,text) to service_role;

-- Change member password
create or replace function public.change_member_password(p_hash text, p_new_password_hash text)
returns boolean
language plpgsql security definer set search_path='' as $$
declare v_member_id uuid;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  select d.member_id into v_member_id from public.member_devices d
    where d.token_hash = p_hash and d.active and d.revoked_at is null and d.expires_at > now();
  if not found then
    raise exception 'UNAUTHORIZED';
  end if;
  update public.members set password_hash = p_new_password_hash where id = v_member_id;
  return true;
end $$;
revoke all on function public.change_member_password(text,text) from public,anon,authenticated;
grant execute on function public.change_member_password(text,text) to service_role;

-- Get member profile by active device token_hash
create or replace function public.get_member_profile(p_hash text)
returns table(id uuid, member_code text, phone text, gender text, age_range text, promotion_consent boolean, created_at timestamptz)
language plpgsql security definer set search_path='' as $$
declare v_member_id uuid;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  select d.member_id into v_member_id from public.member_devices d
    where d.token_hash = p_hash and d.active and d.revoked_at is null and d.expires_at > now();
  if not found then
    return;
  end if;
  return query select m.id, m.member_code, m.phone, m.gender, m.age_range, m.promotion_consent, m.created_at
    from public.members m where m.id = v_member_id;
end $$;
revoke all on function public.get_member_profile(text) from public,anon,authenticated;
grant execute on function public.get_member_profile(text) to service_role;

-- Update member profile by active device token_hash
create or replace function public.update_member_profile(p_hash text, p_gender text, p_age text, p_promotions boolean)
returns table(id uuid, member_code text, phone text, gender text, age_range text, promotion_consent boolean, created_at timestamptz)
language plpgsql security definer set search_path='' as $$
declare v_member_id uuid;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  select d.member_id into v_member_id from public.member_devices d
    where d.token_hash = p_hash and d.active and d.revoked_at is null and d.expires_at > now();
  if not found then
    raise exception 'UNAUTHORIZED_MEMBER_DEVICE';
  end if;
  if p_gender not in ('female','male','other','unspecified') then raise exception 'INVALID_GENDER'; end if;
  if p_age not in ('under18','18-24','25-34','35-44','45-54','55plus','unspecified') then raise exception 'INVALID_AGE'; end if;

  update public.members as mem
    set gender = p_gender, age_range = p_age, promotion_consent = coalesce(p_promotions, false)
    where mem.id = v_member_id;

  return query select m.id, m.member_code, m.phone, m.gender, m.age_range, m.promotion_consent, m.created_at
    from public.members m where m.id = v_member_id;
end $$;
revoke all on function public.update_member_profile(text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.update_member_profile(text,text,text,boolean) to service_role;

-- Get member order history for customer
create or replace function public.get_member_orders(p_hash text, p_limit int default 50, p_offset int default 0)
returns table(id uuid, order_number bigint, table_id bigint, table_number text, dining_type text, status text, total_amount numeric, created_at timestamptz, item_count bigint)
language plpgsql security definer set search_path='' as $$
declare v_member_id uuid;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  select d.member_id into v_member_id from public.member_devices d
    where d.token_hash = p_hash and d.active and d.revoked_at is null and d.expires_at > now();
  if not found then
    return;
  end if;

  return query
    select o.id, o.order_number, o.table_id, coalesce(t.table_number, '')::text,
           o.dining_type, o.status, o.total_amount, o.created_at,
           coalesce(sum(i.quantity), 0)::bigint as item_count
    from public.orders o
    left join public.restaurant_tables t on t.id = o.table_id
    left join public.order_items i on i.order_id = o.id
    where o.member_id = v_member_id
    group by o.id, o.order_number, o.table_id, t.table_number, o.dining_type, o.status, o.total_amount, o.created_at
    order by o.created_at desc
    limit coalesce(p_limit, 50) offset coalesce(p_offset, 0);
end $$;
revoke all on function public.get_member_orders(text,int,int) from public,anon,authenticated;
grant execute on function public.get_member_orders(text,int,int) to service_role;

-- Get single member order detail for customer (verified by token hash ownership)
create or replace function public.get_member_order_detail(p_hash text, p_order_id uuid)
returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_member_id uuid; v_order jsonb;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  select d.member_id into v_member_id from public.member_devices d
    where d.token_hash = p_hash and d.active and d.revoked_at is null and d.expires_at > now();
  if not found then
    raise exception 'UNAUTHORIZED';
  end if;

  select to_jsonb(t) into v_order from (
    select o.id, o.order_number, o.table_id, tbl.table_number, o.dining_type, o.status, o.note, o.total_amount, o.created_at, o.updated_at,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', i.id,
          'quantity', i.quantity,
          'unit_price', i.unit_price,
          'subtotal', i.subtotal,
          'menu_name', coalesce(i.menu_name_snapshot, m.name, 'อาหาร'),
          'options', coalesce((
            select jsonb_agg(jsonb_build_object(
              'name', opt.option_name,
              'choice', opt.option_name,
              'price', opt.additional_price
            )) from public.order_item_options opt where opt.order_item_id = i.id
          ), '[]'::jsonb)
        ) order by i.id)
        from public.order_items i
        left join public.menus m on m.id = i.menu_id
        where i.order_id = o.id
      ), '[]'::jsonb) as items
    from public.orders o
    left join public.restaurant_tables tbl on tbl.id = o.table_id
    where o.id = p_order_id and o.member_id = v_member_id
  ) t;

  if v_order is null then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  return v_order;
end $$;
revoke all on function public.get_member_order_detail(text,uuid) from public,anon,authenticated;
grant execute on function public.get_member_order_detail(text,uuid) to service_role;

-- 3. Admin Member Management RPCs
-- 3.1 List pending member requests for 1-click admin approval
create or replace function public.admin_list_pending_members()
returns table(
  token_hash text,
  member_id uuid,
  member_code text,
  phone text,
  gender text,
  age_range text,
  promotion_consent boolean,
  created_at timestamptz
)
language plpgsql security definer set search_path='' as $$
begin
  if coalesce(public.current_shop_role(),'') not in ('admin','staff') then
    raise exception using errcode='42501', message='STAFF_ROLE_REQUIRED';
  end if;

  return query
    select d.token_hash, m.id as member_id, m.member_code, m.phone, m.gender, m.age_range, m.promotion_consent, d.created_at
    from public.member_devices d
    join public.members m on m.id = d.member_id
    where not d.active and d.revoked_at is null and d.expires_at > now()
    order by d.created_at desc;
end $$;
revoke all on function public.admin_list_pending_members() from public,anon;
grant execute on function public.admin_list_pending_members() to authenticated;

-- 3.2 Fast 1-click Admin Approve Member Request
create or replace function public.admin_approve_member(p_token_hash text)
returns void
language plpgsql security definer set search_path='' as $$
declare v_member uuid;
begin
  if coalesce(public.current_shop_role(),'') not in ('admin','staff') then
    raise exception using errcode='42501', message='STAFF_ROLE_REQUIRED';
  end if;

  select member_id into v_member from public.member_devices where token_hash = p_token_hash;
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;

  update public.member_devices
    set active = true, reviewed_at = now(), reviewed_by = auth.uid(), review_note = 'Approved by admin'
    where token_hash = p_token_hash and not active and revoked_at is null and expires_at > now();

  -- Deactivate previous active devices for this member
  update public.member_devices
    set active = false, revoked_at = now()
    where member_id = v_member and token_hash <> p_token_hash and active = true;
end $$;
revoke all on function public.admin_approve_member(text) from public,anon;
grant execute on function public.admin_approve_member(text) to authenticated;

-- 3.3 Fast 1-click Admin Reject Member Request
create or replace function public.admin_reject_member(p_token_hash text)
returns void
language plpgsql security definer set search_path='' as $$
begin
  if coalesce(public.current_shop_role(),'') not in ('admin','staff') then
    raise exception using errcode='42501', message='STAFF_ROLE_REQUIRED';
  end if;

  update public.member_devices
    set active = false, revoked_at = now(), review_note = 'Rejected by admin'
    where token_hash = p_token_hash and not active and revoked_at is null;
end $$;
revoke all on function public.admin_reject_member(text) from public,anon;
grant execute on function public.admin_reject_member(text) to authenticated;

-- 3.4 Admin Add Member (เพิ่มสมาชิกโดยตรงจากหลังบ้าน)
create or replace function public.admin_add_member(
  p_phone text,
  p_gender text default 'unspecified',
  p_age text default 'unspecified',
  p_promotions boolean default false
)
returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_result jsonb;
begin
  if coalesce(public.current_shop_role(),'') not in ('admin','staff') then
    raise exception using errcode='42501', message='STAFF_ROLE_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_phone, 3));
  select m.id into v_id from public.members m where m.phone = p_phone;
  if found then
    raise exception 'PHONE_ALREADY_EXISTS';
  end if;

  insert into public.members(phone, gender, age_range, promotion_consent)
    values(p_phone, coalesce(p_gender, 'unspecified'), coalesce(p_age, 'unspecified'), coalesce(p_promotions, false))
    returning public.members.id into v_id;

  select to_jsonb(m) into v_result from (
    select id, member_code, phone, gender, age_range, promotion_consent, created_at
    from public.members where id = v_id
  ) m;

  return v_result;
end $$;
revoke all on function public.admin_add_member(text,text,text,boolean) from public,anon;
grant execute on function public.admin_add_member(text,text,text,boolean) to authenticated;

-- 3.5 Admin Update Member (แก้ไขข้อมูลสมาชิก)
create or replace function public.admin_update_member(
  p_member_id uuid,
  p_phone text,
  p_gender text,
  p_age text,
  p_promotions boolean
)
returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_exists uuid; v_result jsonb;
begin
  if coalesce(public.current_shop_role(),'') not in ('admin','staff') then
    raise exception using errcode='42501', message='STAFF_ROLE_REQUIRED';
  end if;

  -- Check duplicate phone for other members
  select m.id into v_exists from public.members m where m.phone = p_phone and m.id <> p_member_id;
  if found then
    raise exception 'PHONE_ALREADY_EXISTS';
  end if;

  update public.members
    set phone = p_phone,
        gender = coalesce(p_gender, gender),
        age_range = coalesce(p_age, age_range),
        promotion_consent = coalesce(p_promotions, promotion_consent)
    where id = p_member_id;

  if not found then
    raise exception 'MEMBER_NOT_FOUND';
  end if;

  select to_jsonb(m) into v_result from (
    select id, member_code, phone, gender, age_range, promotion_consent, created_at
    from public.members where id = p_member_id
  ) m;

  return v_result;
end $$;
revoke all on function public.admin_update_member(uuid,text,text,text,boolean) from public,anon;
grant execute on function public.admin_update_member(uuid,text,text,text,boolean) to authenticated;

-- 3.6 Admin Delete Member (ลบสมาชิก)
create or replace function public.admin_delete_member(p_member_id uuid)
returns boolean
language plpgsql security definer set search_path='' as $$
begin
  if coalesce(public.current_shop_role(),'') not in ('admin','staff') then
    raise exception using errcode='42501', message='STAFF_ROLE_REQUIRED';
  end if;

  -- Nullify orders.member_id to preserve sales records and reports
  update public.orders set member_id = null where member_id = p_member_id;

  -- Delete associated device tokens
  delete from public.member_devices where member_id = p_member_id;

  -- Delete member record
  delete from public.members where id = p_member_id;
  if not found then
    raise exception 'MEMBER_NOT_FOUND';
  end if;

  return true;
end $$;
revoke all on function public.admin_delete_member(uuid) from public,anon;
grant execute on function public.admin_delete_member(uuid) to authenticated;

-- 3.7 Admin list all approved members with stats and search
create or replace function public.admin_list_members(p_search text default null, p_limit int default 100, p_offset int default 0)
returns table(
  id uuid,
  member_code text,
  phone text,
  gender text,
  age_range text,
  promotion_consent boolean,
  created_at timestamptz,
  order_count bigint,
  total_spent numeric
)
language plpgsql security definer set search_path='' as $$
begin
  if coalesce(public.current_shop_role(),'') not in ('admin','staff') then
    raise exception using errcode='42501', message='STAFF_ROLE_REQUIRED';
  end if;

  return query
    select
      m.id,
      m.member_code,
      m.phone,
      m.gender,
      m.age_range,
      m.promotion_consent,
      m.created_at,
      count(o.id)::bigint as order_count,
      coalesce(sum(case when o.status = 'completed' then o.total_amount else 0 end), 0)::numeric as total_spent
    from public.members m
    left join public.orders o on o.member_id = m.id
    where (
      p_search is null
      or p_search = ''
      or m.member_code ilike '%' || trim(p_search) || '%'
      or m.phone ilike '%' || trim(p_search) || '%'
    )
    group by m.id, m.member_code, m.phone, m.gender, m.age_range, m.promotion_consent, m.created_at
    order by m.created_at desc
    limit coalesce(p_limit, 100) offset coalesce(p_offset, 0);
end $$;
revoke all on function public.admin_list_members(text,int,int) from public,anon;
grant execute on function public.admin_list_members(text,int,int) to authenticated;

-- 3.8 Admin get member detail
create or replace function public.admin_get_member_detail(p_member_id uuid)
returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
  if coalesce(public.current_shop_role(),'') not in ('admin','staff') then
    raise exception using errcode='42501', message='STAFF_ROLE_REQUIRED';
  end if;

  select to_jsonb(row) into v_result from (
    select m.id, m.member_code, m.phone, m.gender, m.age_range, m.promotion_consent, m.created_at,
           count(distinct o.id) as order_count,
           coalesce(sum(case when o.status = 'completed' then o.total_amount else 0 end), 0) as total_spent,
           (select count(*) from public.member_devices d where d.member_id = m.id and d.active) as device_count,
           max(o.created_at) as last_order_at
    from public.members m
    left join public.orders o on o.member_id = m.id
    where m.id = p_member_id
    group by m.id, m.member_code, m.phone, m.gender, m.age_range, m.promotion_consent, m.created_at
  ) row;

  if v_result is null then
    raise exception 'MEMBER_NOT_FOUND';
  end if;

  return v_result;
end $$;
revoke all on function public.admin_get_member_detail(uuid) from public,anon;
grant execute on function public.admin_get_member_detail(uuid) to authenticated;

-- 3.9 Admin get member orders list
create or replace function public.admin_get_member_orders(p_member_id uuid, p_limit int default 50, p_offset int default 0)
returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_orders jsonb;
begin
  if coalesce(public.current_shop_role(),'') not in ('admin','staff') then
    raise exception using errcode='42501', message='STAFF_ROLE_REQUIRED';
  end if;

  select coalesce(jsonb_agg(to_jsonb(o_row) order by (o_row.created_at) desc), '[]'::jsonb) into v_orders from (
    select o.id, o.order_number, o.table_id, tbl.table_number, o.dining_type, o.status, o.note, o.total_amount, o.created_at, o.updated_at,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', i.id,
          'quantity', i.quantity,
          'unit_price', i.unit_price,
          'subtotal', i.subtotal,
          'menu_name', coalesce(i.menu_name_snapshot, m.name, 'อาหาร'),
          'options', coalesce((
            select jsonb_agg(jsonb_build_object(
              'option_name', opt.option_name,
              'additional_price', opt.additional_price,
              'quantity', opt.quantity
            )) from public.order_item_options opt where opt.order_item_id = i.id
          ), '[]'::jsonb)
        ) order by i.id)
        from public.order_items i
        left join public.menus m on m.id = i.menu_id
        where i.order_id = o.id
      ), '[]'::jsonb) as items
    from public.orders o
    left join public.restaurant_tables tbl on tbl.id = o.table_id
    where o.member_id = p_member_id
    order by o.created_at desc
    limit coalesce(p_limit, 50) offset coalesce(p_offset, 0)
  ) o_row;

  return v_orders;
end $$;
revoke all on function public.admin_get_member_orders(uuid,int,int) from public,anon;
grant execute on function public.admin_get_member_orders(uuid,int,int) to authenticated;

-- 3.10 Admin member analytics dashboard (for marketing insights)
create or replace function public.admin_member_analytics()
returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_total_members bigint; v_total_orders bigint; v_total_spent numeric;
        v_monthly jsonb; v_gender jsonb; v_age jsonb;
begin
  if coalesce(public.current_shop_role(),'') not in ('admin','staff') then
    raise exception using errcode='42501', message='STAFF_ROLE_REQUIRED';
  end if;

  select count(*) into v_total_members from public.members;
  select count(o.id), coalesce(sum(case when o.status='completed' then o.total_amount else 0 end), 0)
    into v_total_orders, v_total_spent
    from public.orders o where o.member_id is not null;

  -- New members monthly for past 12 months (in Bangkok time)
  select coalesce(jsonb_agg(jsonb_build_object('month', m_series.month_str, 'count', coalesce(counts.cnt, 0))), '[]'::jsonb)
  into v_monthly
  from (
    select to_char(date_trunc('month', (now() at time zone 'Asia/Bangkok') - (n || ' months')::interval), 'YYYY-MM') as month_str
    from generate_series(11, 0, -1) n
  ) m_series
  left join (
    select to_char(date_trunc('month', created_at at time zone 'Asia/Bangkok'), 'YYYY-MM') as month_str, count(*) as cnt
    from public.members
    where created_at >= (date_trunc('month', now() at time zone 'Asia/Bangkok') - interval '11 months')
    group by 1
  ) counts on counts.month_str = m_series.month_str;

  -- Gender breakdown for marketing
  select coalesce(jsonb_agg(jsonb_build_object('gender', g.gender, 'count', coalesce(c.cnt, 0))), '[]'::jsonb)
  into v_gender
  from (values ('female'), ('male'), ('other'), ('unspecified')) as g(gender)
  left join (
    select gender, count(*) as cnt from public.members group by gender
  ) c on c.gender = g.gender;

  -- Age range breakdown for marketing
  select coalesce(jsonb_agg(jsonb_build_object('age_range', a.age_range, 'count', coalesce(c.cnt, 0))), '[]'::jsonb)
  into v_age
  from (values ('under18'), ('18-24'), ('25-34'), ('35-44'), ('45-54'), ('55plus'), ('unspecified')) as a(age_range)
  left join (
    select age_range, count(*) as cnt from public.members group by age_range
  ) c on c.age_range = a.age_range;

  return jsonb_build_object(
    'total_members', v_total_members,
    'total_orders', v_total_orders,
    'total_spent', v_total_spent,
    'monthly_signups', v_monthly,
    'gender_distribution', v_gender,
    'age_distribution', v_age
  );
end $$;
revoke all on function public.admin_member_analytics() from public,anon;
grant execute on function public.admin_member_analytics() to authenticated;

notify pgrst, 'reload schema';

commit;
