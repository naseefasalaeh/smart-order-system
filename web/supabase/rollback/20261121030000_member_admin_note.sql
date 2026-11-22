-- Rollback: 20261121030000_member_admin_note.sql
begin;
drop function if exists public.admin_save_member_note(uuid,text);
alter table public.members drop column if exists admin_note;
commit;
