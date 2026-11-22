-- Read-only fingerprints; contains no row values or credentials.
begin isolation level repeatable read read only;
set local timezone='UTC';
select jsonb_build_object(
  'tables', (select jsonb_object_agg(n.nspname||'.'||c.relname,
    jsonb_build_object('count',((xpath('/row/n/text()',x.data))[1]::text)::bigint,
      'md5',(xpath('/row/hash/text()',x.data))[1]::text))
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    cross join lateral (select query_to_xml(format(
      'select count(*) n,md5(coalesce(string_agg(to_jsonb(t)::text,E''\n'' order by to_jsonb(t)::text collate "C"),'''')) hash from %I.%I t',n.nspname,c.relname),true,true,'') data) x
    where c.relkind='r' and n.nspname in ('public','auth','catalog_backup','supabase_migrations')),
  'sequences', (select jsonb_object_agg(n.nspname||'.'||c.relname,
    jsonb_build_object('last_value',(xpath('/row/last_value/text()',x.data))[1]::text,
      'is_called',(xpath('/row/is_called/text()',x.data))[1]::text))
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    cross join lateral (select query_to_xml(format('select last_value,is_called from %I.%I',n.nspname,c.relname),true,true,'') data) x
    where c.relkind='S' and n.nspname in ('public','auth','catalog_backup','supabase_migrations'))
);
commit;
