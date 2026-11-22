-- Migration: 20261121010000_member_completed_order_stats.sql
-- Ensure member order statistics (order_count and total_spent) only count completed orders
begin;

-- 1. Admin list members: filter order_count by status = 'completed'
create or replace function public.admin_list_members(
  p_search text default null,
  p_limit int default 100,
  p_offset int default 0
)
returns table (
  id uuid,
  member_code text,
  phone text,
  gender text,
  age_range text,
  promotion_consent boolean,
  created_at timestamptz,
  order_count bigint,
  total_spent numeric
)
language plpgsql security definer set search_path='' as $$
begin
  if coalesce(public.current_shop_role(),'') not in ('admin','staff') then
    raise exception using errcode='42501', message='STAFF_ROLE_REQUIRED';
  end if;

  return query
    select
      m.id,
      m.member_code,
      m.phone,
      m.gender,
      m.age_range,
      m.promotion_consent,
      m.created_at,
      count(case when o.status = 'completed' then 1 end)::bigint as order_count,
      coalesce(sum(case when o.status = 'completed' then o.total_amount else 0 end), 0)::numeric as total_spent
    from public.members m
    left join public.orders o on o.member_id = m.id
    where (
      p_search is null
      or p_search = ''
      or m.member_code ilike '%' || trim(p_search) || '%'
      or m.phone ilike '%' || trim(p_search) || '%'
    )
    group by m.id, m.member_code, m.phone, m.gender, m.age_range, m.promotion_consent, m.created_at
    order by m.created_at desc
    limit coalesce(p_limit, 100) offset coalesce(p_offset, 0);
end $$;
revoke all on function public.admin_list_members(text,int,int) from public,anon;
grant execute on function public.admin_list_members(text,int,int) to authenticated;

-- 2. Admin get member detail: count only completed orders
create or replace function public.admin_get_member_detail(p_member_id uuid)
returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
  if coalesce(public.current_shop_role(),'') not in ('admin','staff') then
    raise exception using errcode='42501', message='STAFF_ROLE_REQUIRED';
  end if;

  select to_jsonb(row) into v_result from (
    select m.id, m.member_code, m.phone, m.gender, m.age_range, m.promotion_consent, m.created_at,
           count(distinct case when o.status = 'completed' then o.id end) as order_count,
           coalesce(sum(case when o.status = 'completed' then o.total_amount else 0 end), 0) as total_spent,
           (select count(*) from public.member_devices d where d.member_id = m.id and d.active) as device_count,
           max(case when o.status = 'completed' then o.created_at end) as last_order_at
    from public.members m
    left join public.orders o on o.member_id = m.id
    where m.id = p_member_id
    group by m.id, m.member_code, m.phone, m.gender, m.age_range, m.promotion_consent, m.created_at
  ) row;

  if v_result is null then
    raise exception 'MEMBER_NOT_FOUND';
  end if;

  return v_result;
end $$;
revoke all on function public.admin_get_member_detail(uuid) from public,anon;
grant execute on function public.admin_get_member_detail(uuid) to authenticated;

-- 3. Admin member analytics: count and sum only completed orders
create or replace function public.admin_member_analytics()
returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_total_members bigint; v_total_orders bigint; v_total_spent numeric;
        v_monthly jsonb; v_gender jsonb; v_age jsonb;
begin
  if coalesce(public.current_shop_role(),'') not in ('admin','staff') then
    raise exception using errcode='42501', message='STAFF_ROLE_REQUIRED';
  end if;

  select count(*) into v_total_members from public.members;
  select count(o.id), coalesce(sum(o.total_amount), 0)
    into v_total_orders, v_total_spent
    from public.orders o
    where o.member_id is not null and o.status = 'completed';

  -- New members monthly for past 12 months (in Bangkok time)
  select coalesce(jsonb_agg(jsonb_build_object('month', m_series.month_str, 'count', coalesce(counts.cnt, 0))), '[]'::jsonb)
  into v_monthly
  from (
    select to_char(date_trunc('month', (now() at time zone 'Asia/Bangkok') - (n || ' months')::interval), 'YYYY-MM') as month_str
    from generate_series(11, 0, -1) n
  ) m_series
  left join (
    select to_char(date_trunc('month', created_at at time zone 'Asia/Bangkok'), 'YYYY-MM') as month_str, count(*) as cnt
    from public.members
    where created_at >= (date_trunc('month', now() at time zone 'Asia/Bangkok') - interval '11 months')
    group by 1
  ) counts on counts.month_str = m_series.month_str;

  -- Gender breakdown for marketing
  select coalesce(jsonb_agg(jsonb_build_object('gender', g.gender, 'count', coalesce(c.cnt, 0))), '[]'::jsonb)
  into v_gender
  from (values ('female'), ('male'), ('other'), ('unspecified')) as g(gender)
  left join (
    select gender, count(*) as cnt from public.members group by gender
  ) c on c.gender = g.gender;

  -- Age range breakdown for marketing
  select coalesce(jsonb_agg(jsonb_build_object('age_range', a.age_range, 'count', coalesce(c.cnt, 0))), '[]'::jsonb)
  into v_age
  from (values ('under18'), ('18-24'), ('25-34'), ('35-44'), ('45-54'), ('55plus'), ('unspecified')) as a(age_range)
  left join (
    select age_range, count(*) as cnt from public.members group by age_range
  ) c on c.age_range = a.age_range;

  return jsonb_build_object(
    'total_members', v_total_members,
    'total_orders', v_total_orders,
    'total_spent', v_total_spent,
    'monthly_signups', v_monthly,
    'gender_distribution', v_gender,
    'age_distribution', v_age
  );
end $$;
revoke all on function public.admin_member_analytics() from public,anon;
grant execute on function public.admin_member_analytics() to authenticated;

commit;
