begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
create table public.members (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique check(phone ~ '^\+66[689][0-9]{8}$'),
  phone_verified boolean not null default false check(not phone_verified),
  gender text not null default 'unspecified' check(gender in ('female','male','other','unspecified')),
  age_range text not null default 'unspecified' check(age_range in ('under18','18-24','25-34','35-44','45-54','55plus','unspecified')),
  promotion_consent boolean not null default false,
  consent_version text not null default '2026-10-31',
  created_at timestamptz not null default now()
);
create table public.member_devices (
  token_hash text primary key check(token_hash ~ '^[0-9a-f]{64}$'),
  member_id uuid not null references public.members(id),
  active boolean not null default false,
  expires_at timestamptz not null default now()+interval '180 days',
  created_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  review_note text
);
alter table public.orders add column member_id uuid references public.members(id);
create index orders_member_idx on public.orders(member_id) where member_id is not null;
alter table public.members enable row level security;
alter table public.member_devices enable row level security;
revoke all on public.members,public.member_devices from public,anon,authenticated;
grant select,insert,update on public.members,public.member_devices to service_role;

create function public.enroll_member(p_phone text,p_gender text,p_age text,p_promotions boolean,p_hash text)
returns void language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_new boolean:=false;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_phone,3));
  select id into v_id from public.members where phone=p_phone;
  if not found then
    insert into public.members(phone,gender,age_range,promotion_consent) values(p_phone,p_gender,p_age,p_promotions) returning id into v_id;
    v_new:=true;
  end if;
  -- Existing number: demographics and consent are never changed or disclosed.
  insert into public.member_devices(token_hash,member_id,active) values(p_hash,v_id,v_new);
end $$;
revoke all on function public.enroll_member(text,text,text,boolean,text) from public,anon,authenticated;
grant execute on function public.enroll_member(text,text,text,boolean,text) to service_role;

create function public.review_member_device(p_hash text,p_note text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if coalesce(public.current_shop_role(),'')<>'staff' then raise exception using errcode='42501',message='STAFF_ROLE_REQUIRED'; end if;
  if length(btrim(coalesce(p_note,'')))<10 or length(p_note)>1000 then raise exception 'VERIFICATION_NOTE_REQUIRED'; end if;
  update public.member_devices set active=true,reviewed_by=auth.uid(),reviewed_at=now(),review_note=p_note
    where token_hash=p_hash and not active and expires_at>now();
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
end $$;
revoke all on function public.review_member_device(text,text) from public,anon;
grant execute on function public.review_member_device(text,text) to authenticated;

create function public.create_member_order(p_table_id bigint,p_session_token uuid,p_order_note text,
  p_total_amount numeric,p_items jsonb,p_required_items jsonb,p_dining_type text,p_request_id uuid,p_request_fingerprint text,p_member_hash text)
returns table(id uuid,order_number bigint,table_id bigint,session_id uuid,status text,total_amount numeric,stock_deducted boolean)
language plpgsql security definer set search_path='' as $$
declare v_member uuid; v_order record; v_exists boolean;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if p_request_id is not null then perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0)); end if;
  select exists(select 1 from public.orders o where o.request_id=p_request_id) into v_exists;
  select member_id into v_member from public.member_devices where token_hash=p_member_hash and active and expires_at>now();
  select * into v_order from public.create_order_with_stock(p_table_id,p_session_token,p_order_note,p_total_amount,p_items,p_required_items,p_dining_type,p_request_id,p_request_fingerprint);
  if not v_exists and v_member is not null then update public.orders o set member_id=v_member where o.id=v_order.id; end if;
  return query select v_order.id,v_order.order_number,v_order.table_id,v_order.session_id,v_order.status,v_order.total_amount,v_order.stock_deducted;
end $$;
revoke all on function public.create_member_order(bigint,uuid,text,numeric,jsonb,jsonb,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.create_member_order(bigint,uuid,text,numeric,jsonb,jsonb,text,uuid,text,text) to service_role;

-- Aggregate-only analytics; no phones or device credentials leave this RPC.
create function public.member_menu_statistics(p_start timestamptz,p_end timestamptz)
returns table(customer_group text,gender text,age_range text,menu_name text,quantity bigint)
language plpgsql security definer set search_path='' as $$
begin
  if coalesce(public.current_shop_role(),'')<>'admin' then raise exception using errcode='42501',message='ADMIN_ROLE_REQUIRED'; end if;
  return query select case when o.member_id is null then 'guest' else 'member' end,
    coalesce(m.gender,'unspecified'),coalesce(m.age_range,'unspecified'),coalesce(i.menu_name_snapshot,'อาหาร'),sum(i.quantity)::bigint
    from public.orders o join public.order_items i on i.order_id=o.id left join public.members m on m.id=o.member_id
    where o.status<>'cancelled' and o.created_at>=p_start and o.created_at<p_end
    group by 1,2,3,4;
end $$;
revoke all on function public.member_menu_statistics(timestamptz,timestamptz) from public,anon;
grant execute on function public.member_menu_statistics(timestamptz,timestamptz) to authenticated;
commit;
