-- Run read-only. Results include definitions and must stay outside Git.
begin read only;
select jsonb_build_object(
 'version',current_setting('server_version'),
 'columns',(select jsonb_agg(to_jsonb(c) order by table_name,ordinal_position) from information_schema.columns c where table_schema='public'),
 'constraints',(select jsonb_agg(jsonb_build_object('table',c.conrelid::regclass::text,'name',conname,'definition',pg_get_constraintdef(c.oid)) order by conname) from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname='public'),
 'policies',(select jsonb_agg(to_jsonb(p) order by tablename,policyname) from pg_policies p where schemaname='public'),
 'grants',(select jsonb_agg(to_jsonb(g) order by table_name,grantee,privilege_type) from information_schema.role_table_grants g where table_schema='public'),
 'functions',(select jsonb_agg(jsonb_build_object('name',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid),'acl',p.proacl,'owner',pg_get_userbyid(p.proowner)) order by p.oid::regprocedure::text) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f'),
 'triggers',(select jsonb_agg(jsonb_build_object('table',t.tgrelid::regclass::text,'definition',pg_get_triggerdef(t.oid)) order by t.tgrelid::regclass::text,t.tgname) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','auth') and not t.tgisinternal),
 'rls',(select jsonb_agg(jsonb_build_object('table',c.relname,'enabled',c.relrowsecurity,'forced',c.relforcerowsecurity) order by c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'),
 'indexes',(select jsonb_agg(to_jsonb(i) order by tablename,indexname) from pg_indexes i where schemaname='public'),
 'publication',(select jsonb_agg(to_jsonb(p) order by pubname,tablename) from pg_publication_tables p where schemaname='public'),
 'cron_jobs',(select jsonb_agg(jsonb_build_object('jobname',jobname,'schedule',schedule,'command',command,'active',active) order by jobname) from cron.job)
);
commit;
