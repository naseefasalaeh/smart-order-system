begin;
set local lock_timeout='5s';
-- Maintenance only: restores the previous function definition, including its
-- known order/recovery deadlock. Prefer a forward fix during normal operations.
create or replace function public.review_member_device(p_hash text,p_note text)
returns void language plpgsql security definer set search_path='' as $$
declare v_member uuid;
begin
  if coalesce(public.current_shop_role(),'')<>'staff' then raise exception using errcode='42501',message='STAFF_ROLE_REQUIRED'; end if;
  if length(btrim(coalesce(p_note,'')))<10 or length(p_note)>1000 then raise exception 'VERIFICATION_NOTE_REQUIRED'; end if;
  select member_id into v_member from public.member_devices where token_hash=p_hash;
  perform 1 from public.members where id=v_member for update;
  update public.member_devices set active=true,reviewed_by=auth.uid(),reviewed_at=now(),review_note=p_note
    where token_hash=p_hash and not active and revoked_at is null and expires_at>now();
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
  -- Recovery is a handover after an in-person review, never a phone lookup.
  -- Invalidate lost/previous devices so their old bearer tokens stop working.
  update public.member_devices set active=false,revoked_at=now(),expires_at=least(expires_at,now())
    where member_id=v_member and token_hash<>p_hash and revoked_at is null;
end $$;

do $$ begin
 if to_regclass('supabase_migrations.schema_migrations') is not null then
  delete from supabase_migrations.schema_migrations where version='20261101000000';
 end if;
end $$;
commit;
