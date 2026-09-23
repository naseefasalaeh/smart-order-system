import assert from 'node:assert/strict';
import { readFileSync,readdirSync,writeFileSync } from 'node:fs';
const dir='.test-artifacts/served-orders/live';
const read=name=>JSON.parse(readFileSync(`${dir}/${name}.json`,'utf8').replace(/^\uFEFF/,''));
const before=read('schema-before').rows[0].audit;
const mode=process.argv[2]??'before';
const files=readdirSync('supabase/migrations').sort();
const versions=files.map(f=>f.slice(0,14));
assert.equal(new Set(versions).size,versions.length);
assert.equal(files.at(-1),'20260923100000_served_order_payment.sql');
assert.deepEqual(before.history.map(h=>h.version),versions.slice(0,-1));
assert.ok(before.constraints.find(c=>c.conname==='orders_status_check').definition.includes("'served'"));
assert.ok(before.constraints.find(c=>c.conname==='payments_order_id_key').definition.includes('UNIQUE (order_id)'));
assert.equal(before.columns.some(c=>c.table_name==='orders'&&['served_at','served_by'].includes(c.column_name)),false);
assert.ok(before.constraints.find(c=>c.table_name==='profiles'&&c.definition==='PRIMARY KEY (id)'));
for(const table of ['orders','payments'])assert.ok(before.rls.find(r=>r.relname===table).relrowsecurity);
assert.equal(before.table_grants.some(g=>g.grantee==='authenticated'&&g.table_name==='orders'&&g.privilege_type==='UPDATE'),false);
assert.equal(before.table_grants.some(g=>g.grantee==='authenticated'&&g.table_name==='payments'&&['INSERT','UPDATE','DELETE'].includes(g.privilege_type)),false);
assert.ok(before.publication.find(p=>p.pubname==='supabase_realtime'&&p.tablename==='orders'));
const normalize=s=>s.replace(/\s+/g,' ').trim();
for(const name of ['advance_order_status','complete_order_payment']){
 const f=before.functions.find(f=>f.proname===name);
 assert.ok(f.prosecdef&&f.authenticated_execute&&!f.anon_execute);
 assert.ok(f.proconfig.includes('search_path=""'));
 const local=readFileSync('supabase/migrations/20260918101000_reject_inactive_rpc_calls.sql','utf8');
 const body=local.slice(local.indexOf(`create or replace function public.${name}`)).split('$$')[1];
 assert.equal(normalize(f.definition.split('$function$')[1]),normalize(body),`${name}: remote dependency drift`);
}
assert.match(before.functions.find(f=>f.proname==='current_shop_role').definition,/p\.is_active=true/);
if(mode==='after'){
 const after=read('schema-after').rows[0].audit;
 assert.deepEqual(after.history.slice(0,-1),before.history,'old migration history unchanged');
 assert.deepEqual(after.history.map(h=>h.version),versions);
 for(const key of ['rls','policies','table_grants','triggers','publication'])assert.deepEqual(after[key],before[key],key);
 assert.deepEqual(after.columns.filter(c=>!(c.table_name==='orders'&&['served_at','served_by'].includes(c.column_name))),before.columns);
 assert.equal(after.columns.length-before.columns.length,2);
 assert.deepEqual(after.constraints.filter(c=>!['orders_served_by_fkey','orders_served_audit_pair'].includes(c.conname)),before.constraints);
 assert.equal(after.constraints.length-before.constraints.length,2);
 for(const f of before.functions.filter(f=>f.proname!=='complete_order_payment'))assert.deepEqual(after.functions.find(x=>x.proname===f.proname&&x.args===f.args),f);
 for(const name of ['serve_order','complete_order_payment']){
  const f=after.functions.find(f=>f.proname===name);assert.ok(f.prosecdef&&f.authenticated_execute&&!f.anon_execute);assert.ok(f.proconfig.includes('search_path=""'));
  const local=readFileSync('supabase/migrations/20260923100000_served_order_payment.sql','utf8');
  const body=local.slice(local.indexOf(`function public.${name}`)).split('$$')[1];
  assert.equal(normalize(f.definition.split('$function$')[1]),normalize(body));
 }
}
writeFileSync(`${dir}/schema-${mode}-verified.json`,JSON.stringify({at:new Date().toISOString(),passed:true,mode,migrationCount:versions.length},null,2));
console.log(`PASS schema ${mode}: timestamp, dependency, constraints, RLS, RPCs, grants, publication, history`);
