-- Migration: Member Password & Admin Reset
-- Allows setting password_hash on registration, verifying on login, and Admin reset password for forgot-password support.

begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- 1. Enroll Member Request with Password Hash
drop function if exists public.enroll_member_request(text,text,text,boolean,text);
drop function if exists public.enroll_member_request(text,text,text,boolean,text,text);

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

  insert into public.member_devices(token_hash, member_id, active, expires_at)
    values(p_hash, v_id, false, now() + interval '180 days')
    on conflict(token_hash) do update
      set member_id = v_id, active = false, expires_at = now() + interval '180 days', revoked_at = null;

  return query select m.id, m.member_code, m.phone, m.gender, m.age_range, m.promotion_consent, m.created_at, false
    from public.members m where m.id = v_id;
end $$;
revoke all on function public.enroll_member_request(text,text,text,boolean,text,text) from public,anon,authenticated;
grant execute on function public.enroll_member_request(text,text,text,boolean,text,text) to service_role;

-- 2. Admin Reset Member Password
create or replace function public.admin_reset_member_password(
  p_member_id uuid,
  p_new_password_hash text
)
returns boolean
language plpgsql security definer set search_path='' as $$
begin
  if coalesce(public.current_shop_role(),'') not in ('admin','staff') then
    raise exception using errcode='42501', message='STAFF_ROLE_REQUIRED';
  end if;

  update public.members
    set password_hash = p_new_password_hash
    where id = p_member_id;

  if not found then
    raise exception 'MEMBER_NOT_FOUND';
  end if;

  -- Revoke existing devices so the member logs in with the new password
  update public.member_devices
    set active = false, revoked_at = now()
    where member_id = p_member_id;

  return true;
end $$;
revoke all on function public.admin_reset_member_password(uuid,text) from public,anon;
grant execute on function public.admin_reset_member_password(uuid,text) to authenticated;

notify pgrst, 'reload schema';

commit;
