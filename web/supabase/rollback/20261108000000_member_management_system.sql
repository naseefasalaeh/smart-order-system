begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

drop function if exists public.admin_member_analytics();
drop function if exists public.admin_get_member_orders(uuid,int,int);
drop function if exists public.admin_get_member_detail(uuid);
drop function if exists public.admin_list_members(text,int,int);
drop function if exists public.admin_delete_member(uuid);
drop function if exists public.admin_update_member(uuid,text,text,text,boolean);
drop function if exists public.admin_add_member(text,text,text,boolean);
drop function if exists public.admin_reject_member(text);
drop function if exists public.admin_approve_member(text);
drop function if exists public.admin_list_pending_members();
drop function if exists public.get_member_order_detail(text,uuid);
drop function if exists public.get_member_orders(text,int,int);
drop function if exists public.update_member_profile(text,text,text,boolean);
drop function if exists public.change_member_password(text,text);
drop function if exists public.get_member_profile(text);
drop function if exists public.member_login(text,text);
drop function if exists public.member_get_by_phone(text);
drop function if exists public.enroll_member_password(text,text,text,text,boolean,text);
drop function if exists public.enroll_member_request(text,text,text,boolean,text);

drop trigger if exists trg_set_member_code on public.members;
drop function if exists public.set_member_code();
alter table public.members
  drop column if exists member_code,
  drop column if exists password_hash;
drop sequence if exists public.member_code_seq;

commit;
