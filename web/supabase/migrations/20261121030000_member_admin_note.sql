-- Migration: 20261121030000_member_admin_note.sql
-- Add admin_note column to members table and update admin_get_member_detail
begin;

alter table public.members
  add column if not exists admin_note text default null;

-- Update admin_get_member_detail to return admin_note and filter completed orders
create or replace function public.admin_get_member_detail(p_member_id uuid)
returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
  if coalesce(public.current_shop_role(),'') not in ('admin','staff') then
    raise exception using errcode='42501', message='STAFF_ROLE_REQUIRED';
  end if;

  select to_jsonb(row) into v_result from (
    select m.id, m.member_code, m.phone, m.gender, m.age_range, m.promotion_consent, m.admin_note, m.created_at,
           count(distinct case when o.status = 'completed' then o.id end) as order_count,
           coalesce(sum(case when o.status = 'completed' then o.total_amount else 0 end), 0) as total_spent,
           (select count(*) from public.member_devices d where d.member_id = m.id and d.active) as device_count,
           max(case when o.status = 'completed' then o.created_at end) as last_order_at
    from public.members m
    left join public.orders o on o.member_id = m.id
    where m.id = p_member_id
    group by m.id, m.member_code, m.phone, m.gender, m.age_range, m.promotion_consent, m.admin_note, m.created_at
  ) row;

  if v_result is null then
    raise exception 'MEMBER_NOT_FOUND';
  end if;

  return v_result;
end $$;
revoke all on function public.admin_get_member_detail(uuid) from public,anon;
grant execute on function public.admin_get_member_detail(uuid) to authenticated;

-- Function to save admin note for customer care
create or replace function public.admin_save_member_note(
  p_member_id uuid,
  p_note text
)
returns void
language plpgsql security definer set search_path='' as $$
begin
  if coalesce(public.current_shop_role(),'') not in ('admin','staff') then
    raise exception using errcode='42501', message='STAFF_ROLE_REQUIRED';
  end if;

  update public.members
    set admin_note = nullif(trim(p_note), '')
    where id = p_member_id;

  if not found then
    raise exception 'MEMBER_NOT_FOUND';
  end if;
end $$;
revoke all on function public.admin_save_member_note(uuid,text) from public,anon;
grant execute on function public.admin_save_member_note(uuid,text) to authenticated;

commit;
