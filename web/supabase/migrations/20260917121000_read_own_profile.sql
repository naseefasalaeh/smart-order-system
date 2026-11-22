begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$
begin
  if not (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass) then
    raise exception 'profiles RLS must be enabled';
  end if;
  if exists(select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles') then
    raise exception 'Unexpected profiles policy already exists';
  end if;
  if has_table_privilege('authenticated', 'public.profiles', 'INSERT') or
     has_table_privilege('authenticated', 'public.profiles', 'UPDATE') or
     has_table_privilege('authenticated', 'public.profiles', 'DELETE') then
    raise exception 'Authenticated profile write grant is unexpected';
  end if;
end $$;

grant select on public.profiles to authenticated;
create policy authenticated_read_own_profile on public.profiles
  for select to authenticated using (auth.uid() = id);

commit;
