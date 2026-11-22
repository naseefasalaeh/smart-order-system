begin;
set local lock_timeout='5s';
lock table public.members,public.member_devices,public.orders in access exclusive mode;
do $$ begin
  if exists(select 1 from public.members) or exists(select 1 from public.member_devices) or exists(select 1 from public.orders where member_id is not null) then
    raise exception 'MEMBER_DATA_EXISTS_USE_FORWARD_FIX_OR_RECONCILED_RESTORE';
  end if;
end $$;
drop function public.create_member_order(bigint,uuid,text,numeric,jsonb,jsonb,text,uuid,text,text);
drop function public.member_menu_statistics(timestamptz,timestamptz);
drop function public.review_member_device(text,text);
drop function public.revoke_member_device(text);
drop function public.enroll_member(text,text,text,boolean,text);
alter table public.orders drop column member_id;
drop table public.member_devices;
drop table public.members;
do $$ begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version='20261031010000';
  end if;
end $$;
commit;
