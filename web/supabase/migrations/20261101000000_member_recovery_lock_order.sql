begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
-- Serialize recovery decisions while allowing FK KEY SHARE from in-flight orders.
-- Orders hold a device SHARE lock before linking their member; FOR UPDATE here
-- would create a device/member FK cycle. NO KEY UPDATE avoids that cycle.
create or replace function public.review_member_device(p_hash text,p_note text)
returns void language plpgsql security definer set search_path='' as $$
declare v_member uuid;
begin
  if coalesce(public.current_shop_role(),'')<>'staff' then raise exception using errcode='42501',message='STAFF_ROLE_REQUIRED'; end if;
  if length(btrim(coalesce(p_note,'')))<10 or length(p_note)>1000 then raise exception 'VERIFICATION_NOTE_REQUIRED'; end if;
  select member_id into v_member from public.member_devices where token_hash=p_hash;
  perform 1 from public.members where id=v_member for no key update;
  update public.member_devices set active=true,reviewed_by=auth.uid(),reviewed_at=now(),review_note=p_note
    where token_hash=p_hash and not active and revoked_at is null and expires_at>now();
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
  -- Recovery is a handover after an in-person review, never a phone lookup.
  -- Invalidate lost/previous devices so their old bearer tokens stop working.
  update public.member_devices set active=false,revoked_at=now(),expires_at=least(expires_at,now())
    where member_id=v_member and token_hash<>p_hash and revoked_at is null;
end $$;

commit;
