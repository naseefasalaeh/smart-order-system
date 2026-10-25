-- Read-only audit: no identities or order contents are returned.
select p.proname, p.prosecdef, p.proconfig,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in
  ('advance_order_status', 'serve_order', 'complete_order_payment', 'current_shop_role')
order by p.proname;
