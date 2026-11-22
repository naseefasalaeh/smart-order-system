-- Rollback auto-approve members migration
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
