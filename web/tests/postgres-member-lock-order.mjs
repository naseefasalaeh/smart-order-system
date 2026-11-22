// Reproduce device/member FK lock ordering on two native PostgreSQL backends.
// Disposable localhost database only; never runs a race against hosted data.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {sql,native,state,privateRoot} from '../scripts/feature-postgres-local.mjs';
const database=state().database;
assert.match(database,/^feature_restore_\d+$/);
const q=value=>`'${String(value).replaceAll("'","''")}'`;
async function scenario(){
 const staff=randomUUID(),member=randomUUID(),active=randomBytes(32).toString('hex'),pending=randomBytes(32).toString('hex');
 const phone='+668'+String(randomBytes(4).readUInt32BE()%100000000).padStart(8,'0');
 await sql(database,`insert into auth.users(id,email,raw_user_meta_data) values(${q(staff)},${q(staff+'@example.invalid')},'{}');update profiles set role='staff',is_active=true where id=${q(staff)};insert into members(id,phone) values(${q(member)},${q(phone)});insert into member_devices(token_hash,member_id,active) values(${q(active)},${q(member)},true),(${q(pending)},${q(member)},false);`);
 const table=await sql(database,`insert into restaurant_tables(table_number,qr_code) values(${q('TEST-LOCK-'+staff)},gen_random_uuid()::text) returning id`);
 const writer=sql(database,`begin;select token_hash from member_devices where token_hash=${q(active)} for share;select pg_sleep(0.7);insert into orders(table_id,status,total_amount,stock_deducted,member_id) values(${table},'confirmed',0,false,${q(member)});commit;`);
 // Attach handlers immediately so an expected server deadlock is not unhandled.
 const writerResult=writer.then(value=>({ok:true,value}),error=>({ok:false,error}));
 await new Promise(resolve=>setTimeout(resolve,180));
 const recovery=sql(database,`begin;set local request.jwt.claim.sub=${q(staff)};set local role authenticated;select review_member_device(${q(pending)},'Verified additional in-person device recovery evidence');commit;`);
 const recoveryResult=recovery.then(value=>({ok:true,value}),error=>({ok:false,error}));
 const results=await Promise.all([writerResult,recoveryResult]);
 return {successes:results.filter(result=>result.ok).length,deadlocks:results.filter(result=>!result.ok&&/deadlock detected/.test(result.error.stderr??'')).length};
}
const mode=process.argv[2]??'reproduce';
if(mode==='verify-fix'&&(await sql(database,"select pg_get_functiondef('public.review_member_device(text,text)'::regprocedure)")).includes('for no key update')) {
 await native('psql',['-X','-q','-v','ON_ERROR_STOP=1','-d',database,'-f','supabase/rollback/20261101000000_member_recovery_lock_order.sql']);
}
const before=await scenario();
if(mode==='reproduce'){
 assert.equal(before.deadlocks,1,'Expected the old FOR UPDATE/FK cycle to be observable');
 console.log(JSON.stringify({oldLockCycleReproduced:true,...before}));
}else if(mode==='verify-fix'){
 assert.equal(before.deadlocks,1);
 const originalDefinition=await sql(database,"select pg_get_functiondef('public.review_member_device(text,text)'::regprocedure)");
 const originalAcl=await sql(database,"select proacl::text from pg_proc where oid='public.review_member_device(text,text)'::regprocedure");
 const migration='supabase/migrations/20261101000000_member_recovery_lock_order.sql';
 await native('psql',['-X','-q','-v','ON_ERROR_STOP=1','-d',database,'-f',migration]);
 const after=await scenario();assert.equal(after.deadlocks,0);assert.equal(after.successes,2);
 await sql(database,"insert into supabase_migrations.schema_migrations(version,name,statements) values('20261101000000','member_recovery_lock_order',array['local rehearsal'])");
 await native('psql',['-X','-q','-v','ON_ERROR_STOP=1','-d',database,'-f','supabase/rollback/20261101000000_member_recovery_lock_order.sql']);
 assert.equal(await sql(database,"select pg_get_functiondef('public.review_member_device(text,text)'::regprocedure)"),originalDefinition);
 assert.equal(await sql(database,"select count(*) from supabase_migrations.schema_migrations where version='20261101000000'"),'0');
 await native('psql',['-X','-q','-v','ON_ERROR_STOP=1','-d',database,'-f',migration]);
 assert.equal(await sql(database,"select proacl::text from pg_proc where oid='public.review_member_device(text,text)'::regprocedure"),originalAcl);
 const proof={at:new Date().toISOString(),oldLockCycleReproduced:true,fixedConcurrentOrderAndRecovery:true,successfulConnections:after.successes,rollbackDefinitionAndHistory:true,functionPermissionsUnchanged:true,migrationSha256:createHash('sha256').update(fs.readFileSync(migration)).digest('hex')};
 fs.writeFileSync(path.join(privateRoot,'member-lock-order-verification.json'),JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));
}else throw Error('Unknown mode');
