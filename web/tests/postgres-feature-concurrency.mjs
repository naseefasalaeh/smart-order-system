// Real PostgreSQL backend connections. Never connects to hosted Supabase.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID,randomBytes,createHash } from 'node:crypto';
import { sql,native,state,privateRoot } from '../scripts/feature-postgres-local.mjs';
const database=state().database;
assert.match(database,/^feature_restore_\d+$/);
const quote=value=>`'${String(value).replaceAll("'","''")}'`;
const staff=randomUUID(),admin=randomUUID();
const runTag=randomBytes(5).toString('hex');
const proof={at:new Date().toISOString(),database,checks:[],backendPids:[],lockWaitObserved:false};
proof.testedMigrationSha256=Object.fromEntries(['20261031000000_item_payments','20261031010000_optional_members','20261101000000_member_recovery_lock_order'].map(name=>[name,createHash('sha256').update(fs.readFileSync(`supabase/migrations/${name}.sql`)).digest('hex')]));
const jsonLines=text=>String(text??'').trim().split(/\r?\n/).filter(line=>line.startsWith('{')).map(line=>JSON.parse(line));
await sql(database,`insert into auth.users(id,email,raw_user_meta_data) values(${quote(staff)},'feature-staff-${runTag}@example.invalid','{}'),(${quote(admin)},'feature-admin-${runTag}@example.invalid','{}'); update profiles set role=case when id=${quote(admin)} then 'admin' else 'staff' end,is_active=true where id in (${quote(staff)},${quote(admin)});`);
const table=await sql(database,`insert into restaurant_tables(table_number,qr_code,status) values('FEATURE TEST LOCAL ${runTag}',gen_random_uuid()::text,'occupied') returning id`);
const menu=await sql(database,"insert into menus(name,price,is_available) values('FEATURE TEST LOCAL',50,true) returning id");
async function session() { return sql(database,`insert into dining_sessions(table_id,access_token,status) values(${table},gen_random_uuid(),'active') returning id`); }
async function order(quantity=1,sessionId=null) {
  const id=randomUUID();
  await sql(database,`insert into orders(id,table_id,session_id,status,total_amount,stock_deducted,dining_type,served_at,served_by) values(${quote(id)},${table},${sessionId?quote(sessionId):'null'},'served',60.50*${quantity},true,'dine_in',now(),${quote(staff)});`);
  const item=Number(await sql(database,`insert into order_items(order_id,menu_id,quantity,unit_price,subtotal,menu_name_snapshot,menu_price_snapshot,completed_plates,served_plates) values(${quote(id)},${menu},${quantity},60.50,60.50*${quantity},'FEATURE TEST LOCAL',50,array(select generate_series(1,${quantity})),array(select generate_series(1,${quantity}))) returning id`));
  await sql(database,`insert into order_item_options(order_item_id,option_name,additional_price,quantity) values(${item},'FEATURE TEST ADDON',10.50,1)`);
  return {id,item,quantity};
}
function paymentSql(key,items,method='cash') { return `select collect_item_payment(${quote(key)},${quote(method)},${quote(JSON.stringify(items))}::jsonb) result;`; }
function authenticated(statement,{hold=0,name='feature-single'}={}) {
  return sql(database,`set application_name=${quote(name)}; begin; set local request.jwt.claim.sub=${quote(staff)}; set local request.jwt.claim.role='authenticated'; set local role authenticated; select jsonb_build_object('pid',pg_backend_pid()); ${statement} ${hold?`select pg_sleep(${hold});`:''} commit;`);
}
async function race(label,requests) {
  const pending=requests.map((request,index)=>authenticated(request,{hold:0.6,name:`feature-race-${label}-${index}`}));
  await new Promise(resolve=>setTimeout(resolve,180));
  const activity=JSON.parse(await sql(database,"select coalesce(jsonb_agg(jsonb_build_object('pid',pid,'wait',wait_event_type)),'[]') from pg_stat_activity where application_name like 'feature-race-%' and state='active'"));
  proof.lockWaitObserved ||= activity.some(row=>row.wait==='Lock');
  const results=await Promise.allSettled(pending);
  for(const result of results) {
    const rows=jsonLines(result.status==='fulfilled'?result.value:result.reason.stdout);
    for(const row of rows) if(row.pid) proof.backendPids.push(row.pid);
  }
  assert.equal(new Set(results.flatMap(result=>jsonLines(result.status==='fulfilled'?result.value:result.reason.stdout).filter(row=>row.pid).map(row=>row.pid))).size,requests.length,'Must use distinct real backend connections');
  proof.checks.push(label);
  return results;
}
function successes(results) { return results.filter(result=>result.status==='fulfilled'); }
async function invariant(orders) {
  const ids=orders.map(row=>quote(row.id)).join(',');
  const invalid=await sql(database,`select count(*) from order_items i where i.order_id in (${ids}) and (coalesce((select sum(a.quantity) from payment_allocations a join payments p on p.id=a.payment_id where a.order_item_id=i.id and p.status='paid'),0)>i.quantity or i.quantity<0)`);
  assert.equal(invalid,'0');
  const receiptMismatch=await sql(database,`select count(*) from payments p where p.request_id is not null and p.amount_satang<>(select coalesce(sum(a.amount_satang),0) from payment_allocations a where a.payment_id=p.id)`);
  assert.equal(receiptMismatch,'0','Every receipt equals its allocations exactly once');
  const statusMismatch=await sql(database,`select count(*) from orders o where o.id in (${ids}) and (o.status='completed') is distinct from (not exists(select 1 from order_items i where i.order_id=o.id and (cardinality(i.served_plates)<>i.quantity or i.quantity<>(select coalesce(sum(a.quantity),0) from payment_allocations a join payments p on p.id=a.payment_id where a.order_item_id=i.id and p.status='paid'))))`);
  assert.equal(statusMismatch,'0','Completion requires served and paid quantities');
}
const one=await order(1);
const legacy=await order(1);
const legacyResponse=await authenticated(`select complete_order_payment(${quote(legacy.id)},'cash');`);
const legacyReceipt=jsonLines(legacyResponse).find(row=>row.success);
assert.equal(legacyReceipt.order_id,legacy.id);assert.equal(Number(legacyReceipt.amount),60.5);
await invariant([legacy]);proof.checks.push('legacy-full-payment-rpc-response-compatible');
assert.equal(successes(await race('same-plate',[paymentSql(randomUUID(),[{item_id:one.item,quantity:1}]),paymentSql(randomUUID(),[{item_id:one.item,quantity:1}])])).length,1);
await invariant([one]);
const split=await order(2);
assert.equal(successes(await race('two-units',[paymentSql(randomUUID(),[{item_id:split.item,quantity:1}]),paymentSql(randomUUID(),[{item_id:split.item,quantity:1}],'qr_code')])).length,2);
await invariant([split]);
const round=await session(),first=await order(2,round),second=await order(2,round);
const combined=await race('combined-vs-partial',[
  paymentSql(randomUUID(),[{item_id:first.item,quantity:2},{item_id:second.item,quantity:2}]),
  paymentSql(randomUUID(),[{item_id:second.item,quantity:1}]),
]);
assert.equal(successes(combined).length,1);
await invariant([first,second]);
const duplicate=await order(2),duplicateKey=randomUUID(),payload=[{item_id:duplicate.item,quantity:1}];
const repeats=await race('same-key',[paymentSql(duplicateKey,payload),paymentSql(duplicateKey,payload)]);
assert.equal(successes(repeats).length,2);
assert.equal(await sql(database,`select count(*) from payments where request_id=${quote(duplicateKey)}`),'1');
await assert.rejects(authenticated(paymentSql(duplicateKey,[{item_id:duplicate.item,quantity:2}])),/IDEMPOTENCY_CONFLICT/);
await invariant([duplicate]);
const conflict=await order(3),conflictKey=randomUUID();
assert.equal(successes(await race('same-key-different-payload',[
  paymentSql(conflictKey,[{item_id:conflict.item,quantity:1}]),paymentSql(conflictKey,[{item_id:conflict.item,quantity:2}]),
])).length,1);
await invariant([conflict]);
const timeoutOrder=await order(2),timeoutKey=randomUUID(),timeoutPayload=[{item_id:timeoutOrder.item,quantity:1}];
await assert.rejects(native('psql',['-X','-qAt','-v','ON_ERROR_STOP=1','-d',database,'-c',`begin;set local request.jwt.claim.sub=${quote(staff)};set local role authenticated;${paymentSql(timeoutKey,timeoutPayload)}commit;select pg_sleep(3);`],{timeout:800}));
await authenticated(paymentSql(timeoutKey,timeoutPayload));
assert.equal(await sql(database,`select count(*) from payments where request_id=${quote(timeoutKey)}`),'1');
await invariant([timeoutOrder]);proof.checks.push('retry-after-client-timeout-after-commit');
const failureSession=await session(),failureA=await order(1,failureSession),failureB=await order(1,failureSession),failureKey=randomUUID();
await sql(database,`create function public.feature_test_failure() returns trigger language plpgsql as $$ begin if new.order_item_id=${failureB.item} then raise exception 'INJECTED_ALLOCATION_FAILURE'; end if;return new;end $$;create trigger feature_test_failure before insert on payment_allocations for each row execute function public.feature_test_failure();`);
try {
  await assert.rejects(authenticated(paymentSql(failureKey,[{item_id:failureA.item,quantity:1},{item_id:failureB.item,quantity:1}])),/INJECTED_ALLOCATION_FAILURE/);
  assert.equal(await sql(database,`select count(*) from payments where request_id=${quote(failureKey)}`),'0');
  assert.equal(await sql(database,`select count(*) from payment_allocations where order_item_id in (${failureA.item},${failureB.item})`),'0');
  await invariant([failureA,failureB]);
} finally { await sql(database,'drop trigger feature_test_failure on payment_allocations;drop function public.feature_test_failure();'); }
proof.checks.push('rollback-after-receipt-before-all-allocations');
const otherRound=await order(1,await session());
await assert.rejects(authenticated(paymentSql(randomUUID(),[{item_id:failureA.item,quantity:1},{item_id:otherRound.item,quantity:1}])),/DIFFERENT_DINING_SESSION/);
proof.checks.push('same-table-different-round-rejected');
const phone='+668'+String(randomBytes(4).readUInt32BE()%100000000).padStart(8,'0'),tokens=[randomBytes(32).toString('hex'),randomBytes(32).toString('hex')],hashes=tokens.map(token=>createHash('sha256').update(token).digest('hex'));
await Promise.all(hashes.map((hash,index)=>sql(database,`begin;set local request.jwt.claim.role='service_role';set local role service_role;select enroll_member(${quote(phone)},${quote(index?'male':'female')},'unspecified',false,${quote(hash)});select pg_sleep(0.3);commit;`)));
assert.equal(await sql(database,`select count(*) from members where phone=${quote(phone)}`),'1');
assert.equal(await sql(database,`select count(*) from member_devices where token_hash in (${hashes.map(quote)}) and active`),'1');
assert.equal(await sql(database,`select count(*) from member_devices where token_hash in (${hashes.map(quote)})`),'2');
const activeHash=await sql(database,`select token_hash from member_devices where token_hash in (${hashes.map(quote)}) and active`);
const pendingHash=hashes.find(hash=>hash!==activeHash);
await authenticated(`select review_member_device(${quote(pendingHash)},'Verified prior device and customer evidence in person');`);
assert.equal(await sql(database,`select count(*) from member_devices where token_hash=${quote(activeHash)} and (active or revoked_at is null or expires_at>now())`),'0');
assert.equal(await sql(database,`select active from member_devices where token_hash=${quote(pendingHash)}`),'t');
await sql(database,`begin;set local request.jwt.claim.role='service_role';set local role service_role;select revoke_member_device(${quote(pendingHash)});commit;`);
assert.equal(await sql(database,`select count(*) from member_devices where token_hash in (${hashes.map(quote)}) and active`),'0');
for(const role of ['anon','authenticated']) await assert.rejects(sql(database,`set role ${role};select * from members limit 1`),/permission denied/);
proof.checks.push('concurrent-enrollment-and-revocation-and-private-table-denial');
await assert.rejects(native('psql',['-X','-q','-v','ON_ERROR_STOP=1','-d',database,'-f','supabase/rollback/20261031010000_optional_members.sql']),/MEMBER_DATA_EXISTS/);
await assert.rejects(native('psql',['-X','-q','-v','ON_ERROR_STOP=1','-d',database,'-f','supabase/rollback/20261031000000_item_payments.sql']),/NEW_PAYMENTS_EXIST/);
proof.checks.push('rollback-refuses-new-transaction-history');
assert.ok(proof.lockWaitObserved,'At least one real backend must have waited for a competing lock');
proof.backendPids=[...new Set(proof.backendPids)];
proof.allPassed=true;
fs.writeFileSync(path.join(privateRoot,'postgres-concurrency.json'),JSON.stringify(proof,null,2));
console.log(JSON.stringify(proof));
