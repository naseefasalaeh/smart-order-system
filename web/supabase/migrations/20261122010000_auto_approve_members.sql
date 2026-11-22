-- Auto-approve all legacy pending members and devices
update public.member_devices
set active = true, reviewed_at = coalesce(reviewed_at, now())
where active = false;

-- 1. enroll_member_request creates active/approved member immediately
create or replace function public.enroll_member_request(
  p_phone text,
  p_gender text,
  p_age text,
  p_promotions boolean,
  p_hash text,
  p_password_hash text default null
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

  insert into public.members(phone, password_hash, gender, age_range, promotion_consent)
    values(p_phone, p_password_hash, coalesce(p_gender, 'unspecified'), coalesce(p_age, 'unspecified'), coalesce(p_promotions, false))
    returning public.members.id into v_id;

  -- Create device token in active/approved state immediately (auto-login, no admin confirmation required)
  insert into public.member_devices(token_hash, member_id, active, reviewed_at, expires_at)
    values(p_hash, v_id, true, now(), now() + interval '180 days')
    on conflict(token_hash) do update
      set member_id = v_id, active = true, reviewed_at = now(), expires_at = now() + interval '180 days', revoked_at = null;

  return query select m.id, m.member_code, m.phone, m.gender, m.age_range, m.promotion_consent, m.created_at, true
    from public.members m where m.id = v_id;
end $$;
revoke all on function public.enroll_member_request(text,text,text,boolean,text,text) from public,anon,authenticated;
grant execute on function public.enroll_member_request(text,text,text,boolean,text,text) to service_role;

-- 2. member_login activates device immediately
create or replace function public.member_login(p_phone text, p_hash text)
returns table(id uuid, member_code text, phone text, gender text, age_range text, promotion_consent boolean, created_at timestamptz, is_active boolean)
language plpgsql security definer set search_path='' as $$
declare v_member_id uuid;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  select m.id into v_member_id from public.members m where m.phone = p_phone;
  if not found then
    raise exception 'MEMBER_NOT_FOUND';
  end if;

  -- All registered members are now active/approved
  insert into public.member_devices(token_hash, member_id, active, reviewed_at, expires_at)
    values(p_hash, v_member_id, true, now(), now() + interval '180 days')
    on conflict(token_hash) do update
      set member_id = v_member_id, active = true, reviewed_at = coalesce(public.member_devices.reviewed_at, now()), expires_at = now() + interval '180 days', revoked_at = null;

  return query select m.id, m.member_code, m.phone, m.gender, m.age_range, m.promotion_consent, m.created_at, true
    from public.members m where m.id = v_member_id;
end $$;
revoke all on function public.member_login(text,text) from public,anon,authenticated;
grant execute on function public.member_login(text,text) to service_role;

-- 3. get_member_profile returns profile for valid active token (or automatically marks active if unrevoked and not expired)
create or replace function public.get_member_profile(p_hash text)
returns table(id uuid, member_code text, phone text, gender text, age_range text, promotion_consent boolean, created_at timestamptz)
language plpgsql security definer set search_path='' as $$
declare v_member_id uuid;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  
  -- Auto-upgrade any unrevoked unexpired token to active
  update public.member_devices
    set active = true, reviewed_at = coalesce(reviewed_at, now())
    where token_hash = p_hash and active = false and revoked_at is null and expires_at > now();

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
