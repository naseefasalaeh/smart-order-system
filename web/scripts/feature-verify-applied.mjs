import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {native,privateRoot} from './feature-postgres-local.mjs';
import {remoteConnection} from './feature-remote-connection.mjs';
process.on('uncaughtException',error=>{fs.writeFileSync(path.join(privateRoot,'applied-verification-error.private.log'),error.stack??error.message);console.error('Post-apply verification failed; inspect the private verification log.');process.exitCode=1;});
const read=name=>JSON.parse(fs.readFileSync(path.join(privateRoot,name),'utf8'));
const before=read('data-before.private.json'),after=read('data-after-apply.private.json');
const schemaBefore=read('schema-before.private.json'),schemaAfter=read('schema-after-apply.private.json');
assert.deepEqual(after.sequences,before.sequences,'Application changed original sequence state');
const projected=await native('psql',['-X','-qAt','-v','ON_ERROR_STOP=1','-c',`set role postgres;begin read only;set local timezone='UTC';
select jsonb_build_object(
 'orders',(select md5(coalesce(string_agg((to_jsonb(t)-'member_id')::text,E'\\n' order by (to_jsonb(t)-'member_id')::text collate "C"),'')) from public.orders t),
 'payments',(select md5(coalesce(string_agg((to_jsonb(t)-array['amount_satang','request_id','request_payload','received_by'])::text,E'\\n' order by (to_jsonb(t)-array['amount_satang','request_id','request_payload','received_by'])::text collate "C"),'')) from public.payments t),
 'history',(select md5(coalesce(string_agg(to_jsonb(t)::text,E'\\n' order by to_jsonb(t)::text collate "C"),'')) from supabase_migrations.schema_migrations t where version not in ('20261031000000','20261031010000')),
 'allocation_mismatches',(select count(*) from public.payments p where status='paid' and amount_satang<>(select coalesce(sum(a.amount_satang),0) from public.payment_allocations a where a.payment_id=p.id)),
 'anon_private_access',has_table_privilege('anon','public.members','SELECT') or has_table_privilege('anon','public.member_devices','SELECT'),
 'public_private_functions',(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('enroll_member','revoke_member_device','create_member_order') and (has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE')))
);commit;`],{env:await remoteConnection()});
const values=JSON.parse(projected.stdout);
assert.equal(values.orders,before.tables['public.orders'].md5);
assert.equal(values.payments,before.tables['public.payments'].md5);
assert.equal(values.history,before.tables['supabase_migrations.schema_migrations'].md5);
assert.equal(values.allocation_mismatches,0);assert.equal(values.anon_private_access,false);assert.equal(values.public_private_functions,0);
for(const [table,entry] of Object.entries(before.tables)) if(!['public.orders','public.payments','supabase_migrations.schema_migrations'].includes(table)) assert.deepEqual(after.tables[table],entry,`Unexpected data change: ${table}`);
assert.equal(after.tables['public.orders'].count,before.tables['public.orders'].count);
assert.equal(after.tables['public.payments'].count,before.tables['public.payments'].count);
assert.equal(after.tables['supabase_migrations.schema_migrations'].count,before.tables['supabase_migrations.schema_migrations'].count+2);
assert.deepEqual(schemaAfter.triggers,schemaBefore.triggers);
// An all-columns publication automatically exposes the new order member UUID
// to its existing authorized internal subscribers; no phone/demographics exist
// on orders. Publication membership and filters themselves must stay unchanged.
assert.deepEqual(schemaAfter.publication.map(row=>({...row,attnames:row.attnames.filter(name=>!(row.tablename==='orders'&&name==='member_id'))})),schemaBefore.publication);
assert.deepEqual(schemaAfter.cron_jobs,schemaBefore.cron_jobs);
const oldTables=new Set(schemaBefore.rls.map(row=>row.table));
assert.deepEqual(schemaAfter.rls.filter(row=>oldTables.has(row.table)),schemaBefore.rls);
assert.deepEqual(schemaAfter.policies.filter(row=>oldTables.has(row.tablename)),schemaBefore.policies);
const oldGrantedRelations=new Set(schemaBefore.grants.map(row=>row.table_name));
assert.deepEqual(schemaAfter.grants.filter(row=>oldGrantedRelations.has(row.table_name)),schemaBefore.grants);
for(const fn of schemaBefore.functions)if(!/^(public\.)?complete_order_payment\(/.test(fn.name))assert.deepEqual(schemaAfter.functions.find(row=>row.name===fn.name),fn,`Unrelated function changed: ${fn.name}`);
const result={at:new Date().toISOString(),originalRowValuesPreserved:true,originalSequencesUnchanged:true,legacyAllocationsMatch:true,oldPoliciesGrantsTriggersAndCronUnchanged:true,publicationMembershipUnchangedWithNewMemberUuidColumn:true,privateTableAndFunctionDenial:true,migrationHistoryCount:after.tables['supabase_migrations.schema_migrations'].count};
fs.writeFileSync(path.join(privateRoot,'applied-verification.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
