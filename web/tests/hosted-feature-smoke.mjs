// Authorized, sequential hosted smoke test. No payment races on hosted data.
// Every created ID is registered privately and cleanup targets only those IDs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {chromium} from 'playwright';
import {native,privateRoot} from '../scripts/feature-postgres-local.mjs';
import {remoteConnection} from '../scripts/feature-remote-connection.mjs';
process.loadEnvFile('.env.local');
const prefix=`TEST-feature-${randomBytes(5).toString('hex')}`;
const root=path.join(privateRoot,prefix);fs.mkdirSync(root,{recursive:true});
const registry={prefix,users:[],rows:[],orders:[],items:[],sessions:[],payments:[],members:[],deviceHashes:[],cleaned:false};
const result={checks:[],realtimeEvents:0};
const save=()=>{fs.writeFileSync(path.join(root,'registry.private.json'),JSON.stringify(registry,null,2));fs.writeFileSync(path.join(root,'result.json'),JSON.stringify(result,null,2));};
const options={auth:{persistSession:false,autoRefreshToken:false}};
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,options);
const client=()=>createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,options);
const checked=async request=>{const response=await request;if(response.error)throw Error(response.error.message);return response.data;};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(predicate,label,timeout=30_000){const deadline=Date.now()+timeout;while(Date.now()<deadline){if(await predicate())return;await wait(200);}throw Error(`Timeout: ${label}`);}
const pass=label=>{result.checks.push(label);save();console.log(`PASS ${label}`);};
const password=randomBytes(24).toString('base64url')+'aA1!';
let browser,app,menu,ingredient,table,channel;
const clients={},contexts={};
async function insert(name,values){const row=await checked(db.from(name).insert(values).select('id').single());registry.rows.push({table:name,id:row.id});save();return row.id;}
const base='http://localhost:4424';
async function fingerprint(label){
 const env=await remoteConnection();
 const {stdout}=await native('psql',['-X','-qAt','-v','ON_ERROR_STOP=1','-c','set role postgres','-f','supabase/feature-data-fingerprint.sql'],{env});
 const data=JSON.parse(stdout);fs.writeFileSync(path.join(root,`${label}.private.json`),JSON.stringify(data,null,2));return data;
}
const before=await fingerprint('before');
const existingMemberIds=new Set((await checked(db.from('members').select('id'))).map(member=>member.id));
try {
 const active=await checked(db.from('orders').select('id').in('status',['confirmed','preparing']));
 assert.equal(active.length,0,'Hosted FCFS smoke requires an idle original kitchen queue');
 const actor=await checked(db.from('profiles').select('id').eq('role','admin').eq('is_active',true).limit(1).single());
 for(const role of ['admin','staff','kitchen_staff']){
  const email=`${prefix}-${role}@example.invalid`.toLowerCase();
  const data=await checked(db.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:`${prefix} ${role}`}}));
  registry.users.push({id:data.user.id,email,role});save();
  await checked(db.rpc('manage_staff_profile',{p_actor_id:actor.id,p_target_id:data.user.id,p_role:role,p_is_active:true,p_full_name:`${prefix} ${role}`}));
  clients[role]=client();await checked(clients[role].auth.signInWithPassword({email,password}));
 }
 const category=await insert('categories',{name:prefix});
 ingredient=await checked(clients.admin.rpc('save_ingredient',{p_id:null,p_values:{name:prefix,unit:'TEST',stock_quantity:100,minimum_stock:0,category_id:null,reset_every_days:null,reset_start_date:null,reset_time:null}}));
 registry.rows.push({table:'ingredients',id:ingredient});save();
 menu=await checked(clients.admin.rpc('create_menu_complete',{p_values:{name:prefix,price:37,category_id:category,is_available:false,meat_required:false},p_recipe:[{ingredient_id:ingredient,quantity_required:1}],p_addon_ids:[]}));
 registry.rows.push({table:'menus',id:menu});save();
 table=await checked(clients.admin.rpc('manage_restaurant_table',{p_id:null,p_number:prefix,p_active:true}));
 registry.rows.push({table:'restaurant_tables',id:table});save();
 const appDir=path.join(root,'app');fs.mkdirSync(appDir);
 for(const name of ['src','public','package.json','package-lock.json','tsconfig.json','next-env.d.ts','next.config.ts','postcss.config.mjs'])fs.cpSync(name,path.join(appDir,name),{recursive:true});
 const log=fs.openSync(path.join(root,'server.private.log'),'w');
 app=spawn(process.execPath,[path.resolve('node_modules/next/dist/bin/next'),'dev','-p','4424'],{cwd:appDir,env:{...process.env,NEXT_TELEMETRY_DISABLED:'1'},windowsHide:true,stdio:['ignore',log,log]});fs.closeSync(log);
 await until(async()=>{try{return(await fetch(base+'/login')).ok;}catch{return false;}},'local application ready',60_000);
 browser=await chromium.launch({channel:'msedge',headless:true});
 async function customer(){const context=await browser.newContext();contexts[randomUUID()]=context;return context;}
 const customerContext=await customer(),guestContext=await customer();
 const customerPage=await customerContext.newPage();customerPage.setDefaultTimeout(30_000);
 await customerPage.goto(`${base}/table/id-${table}`);
 await customerPage.locator('summary').filter({hasText:'สมาชิกสมัครใจ'}).click();
 const phone='08'+String(randomBytes(4).readUInt32BE()%100000000).padStart(8,'0');
 await customerPage.locator('input[name=phone]').fill(phone);
 await customerPage.locator('select[name=gender]').selectOption('female');
 await customerPage.locator('input[name=accept]').check();
 assert.equal(await customerPage.locator('input[name=promotions]').isChecked(),false);
 await customerPage.getByRole('button',{name:'สมัครสมาชิกโดยสมัครใจ',exact:true}).click();
 await customerPage.getByText(/อุปกรณ์นี้ผูกสมาชิกแล้ว/).waitFor();
 const cookie=(await customerContext.cookies()).find(cookie=>cookie.name==='smart-order-member');assert.ok(cookie.httpOnly);
 const tokenHash=createHash('sha256').update(cookie.value).digest('hex');
 registry.deviceHashes.push(tokenHash);save();
 const device=await checked(db.from('member_devices').select('member_id,active').eq('token_hash',tokenHash).single());
 assert.ok(!existingMemberIds.has(device.member_id),'Never use an original member as a test fixture');
 registry.members.push(device.member_id);save();assert.equal(device.active,true);
 const sessionToken=randomUUID();
 async function createOrder(context,quantity){
  const requestId=randomUUID();
  // Register request identity first, including recovery after a lost HTTP response.
  registry.orders.push({requestId});save();
  await checked(db.from('menus').update({is_available:true}).eq('id',menu));
  let response;
  try {response=await context.request.post(base+'/api/orders',{headers:{Origin:base},data:{requestId,tableId:String(table),sessionToken,diningType:'dine_in',items:[{menuId:menu,quantity,optionSelections:[]}]}});}
  finally {await checked(db.from('menus').update({is_available:false}).eq('id',menu));}
  const body=await response.json();assert.equal(response.status(),201,body.error);
  const entry=registry.orders.find(order=>order.requestId===requestId);entry.id=body.order.id;save();
  const items=await checked(db.from('order_items').select('id').eq('order_id',entry.id));registry.items.push(...items.map(item=>item.id));
  registry.sessions=[...new Set([...registry.sessions,body.order.session_id])];save();
  return {id:entry.id,item:items[0].id};
 }
 const first=await createOrder(customerContext,2),second=await createOrder(guestContext,1);
 const owners=await checked(db.from('orders').select('id,member_id').in('id',[first.id,second.id]).order('id'));
 assert.equal(owners.find(order=>order.id===first.id).member_id,device.member_id);assert.equal(owners.find(order=>order.id===second.id).member_id,null);
 pass('real HTTP order creation keeps voluntary member and guest ownership separate');
 const staffContext=await browser.newContext();contexts.staff=staffContext;
 const staffPage=await staffContext.newPage();staffPage.setDefaultTimeout(30_000);
 const staffUser=registry.users.find(user=>user.role==='staff');
 await staffPage.goto(base+'/login');await staffPage.locator('input[type=email]').fill(staffUser.email);await staffPage.locator('input[type=password]').fill(password);await staffPage.locator('button[type=submit]').click();await staffPage.waitForURL('**/dashboard/orders');
 await staffPage.goto(base+'/dashboard/ready');await staffPage.getByRole('button',{name:'เปิดเสียงแจ้งเตือน',exact:true}).click();
 await clients.staff.realtime.setAuth();
 channel=clients.staff.channel(`feature-smoke-${randomUUID()}`).on('postgres_changes',{event:'UPDATE',schema:'public',table:'orders',filter:`id=eq.${first.id}`},()=>{result.realtimeEvents++;});
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Realtime subscribe timeout')),20_000);channel.subscribe(status=>{if(status==='SUBSCRIBED'){clearTimeout(timer);resolve();}else if(['CHANNEL_ERROR','TIMED_OUT'].includes(status)){clearTimeout(timer);reject(Error(status));}});});
 await checked(clients.kitchen_staff.rpc('advance_order_status',{p_order_id:first.id,p_expected:'confirmed',p_next:'preparing'}));
 await checked(clients.kitchen_staff.rpc('set_kitchen_plate',{p_item_id:first.item,p_plate:1,p_completed:true}));
 const card=staffPage.locator('article').filter({hasText:prefix});await card.waitFor();
 await card.getByRole('button',{name:'ยืนยันเสิร์ฟ จานที่ 1',exact:true}).click();
 const partiallyServed=await checked(db.from('orders').select('status').eq('id',first.id).single());assert.equal(partiallyServed.status,'preparing');
 await checked(clients.kitchen_staff.rpc('set_kitchen_plate',{p_item_id:first.item,p_plate:2,p_completed:true}));
 await checked(clients.kitchen_staff.rpc('advance_order_status',{p_order_id:second.id,p_expected:'confirmed',p_next:'preparing'}));
 await checked(clients.kitchen_staff.rpc('set_kitchen_plate',{p_item_id:second.item,p_plate:1,p_completed:true}));
 await checked(clients.staff.rpc('serve_order_plate',{p_item_id:first.item,p_plate:2}));await checked(clients.staff.rpc('serve_order_plate',{p_item_id:second.item,p_plate:1}));
 await until(()=>result.realtimeEvents>0,'real hosted Realtime event');
 pass('real Auth subscription, partial cooking/service, FCFS and ready-screen refresh');
 await staffPage.goto(base+'/dashboard/payments');
 const group=staffPage.locator('section.rounded-2xl').filter({hasText:prefix});await group.waitFor();
 const firstLine=group.locator('li').filter({hasText:new RegExp('#'+(await checked(db.from('orders').select('order_number').eq('id',first.id).single())).order_number+' ')});
 await firstLine.locator('input[type=number]').fill('1');await group.getByRole('button',{name:'รับเงินสดแล้ว',exact:true}).click();await group.getByText(/รับชำระแล้ว/).waitFor();
 assert.equal((await checked(db.from('orders').select('status').eq('id',first.id).single())).status,'served');
 await group.getByRole('button',{name:'เลือกทั้งหมดที่ค้างในรอบนี้',exact:true}).click();await group.getByRole('button',{name:'ตรวจรับ QR แล้ว',exact:true}).click();await group.waitFor({state:'hidden'});
 const allocations=await checked(db.from('payment_allocations').select('payment_id,amount_satang').in('order_item_id',registry.items));registry.payments=[...new Set(allocations.map(allocation=>allocation.payment_id))];save();
 const receipts=await checked(db.from('payments').select('id,amount_satang,payment_method').in('id',registry.payments));
 assert.equal(receipts.length,2);assert.equal(receipts.reduce((sum,row)=>sum+Number(row.amount_satang),0),11100);assert.equal(allocations.reduce((sum,row)=>sum+Number(row.amount_satang),0),11100);
 assert.deepEqual(await checked(db.from('orders').select('id,member_id').in('id',[first.id,second.id]).order('id')),owners);
 assert.ok((await checked(db.from('orders').select('status').in('id',[first.id,second.id]))).every(order=>order.status==='completed'));
 const stats=await checked(clients.admin.rpc('member_menu_statistics',{p_start:new Date(Date.now()-3600_000).toISOString(),p_end:new Date(Date.now()+3600_000).toISOString()}));
 const ownStats=stats.filter(row=>row.menu_name===prefix);assert.equal(ownStats.find(row=>row.customer_group==='member').quantity,2);assert.equal(ownStats.find(row=>row.customer_group==='guest').quantity,1);
 pass('cash partial payment plus combined QR, exact receipt/allocation totals, unchanged order ownership and admin aggregates');
 await checked(db.from('member_devices').update({expires_at:new Date(Date.now()-1000).toISOString()}).eq('token_hash',tokenHash));
 assert.equal((await(await customerContext.request.get(base+'/api/membership')).json()).state,'guest');
 const recovery=await customer();
 const enrollment=await recovery.request.post(base+'/api/membership',{headers:{Origin:base},data:{phone,accept:true,promotions:false}});assert.equal(enrollment.status(),200);
 const pending=await(await recovery.request.get(base+'/api/membership')).json();assert.equal(pending.state,'pending');assert.ok(!JSON.stringify(pending).includes(phone));
 const recoveryCookie=(await recovery.cookies()).find(cookie=>cookie.name==='smart-order-member');registry.deviceHashes.push(createHash('sha256').update(recoveryCookie.value).digest('hex'));save();
 await staffPage.goto(base+'/dashboard/members');const form=staffPage.locator('form').filter({hasText:pending.reference});await form.waitFor();assert.ok(!(await form.innerText()).includes(phone));
 await form.locator('textarea[name=note]').fill(`${prefix}: verified test customer's prior device evidence`);await form.locator('input[name=verified]').check();await form.getByRole('button',{name:'อนุมัติผูกอุปกรณ์นี้',exact:true}).click();
 await until(async()=>(await(await recovery.request.get(base+'/api/membership')).json()).state==='member','staff recovery approved');
 assert.equal((await checked(db.from('member_devices').select('active,revoked_at').eq('token_hash',tokenHash).single())).active,false);
 const csrf=await recovery.request.delete(base+'/api/membership',{headers:{Origin:'https://attacker.invalid'}});assert.equal(csrf.status(),403);
 const revoke=await recovery.request.delete(base+'/api/membership',{headers:{Origin:base}});assert.equal(revoke.status(),200);
 assert.equal((await(await recovery.request.get(base+'/api/membership')).json()).state,'guest');
 for(const role of ['admin','staff','kitchen_staff']) assert.ok((await clients[role].from('members').select('phone').limit(1)).error);
 assert.ok((await client().from('member_devices').select('*').limit(1)).error);
 pass('expired token, existing phone denial, masked staff recovery, previous-device revocation, CSRF and role privacy');
 result.passed=true;save();
} catch(error){result.error=error.message;save();throw error;}
finally {
 if(channel)await clients.staff.removeChannel(channel);
 await browser?.close();if(app)app.kill();
 // Recover registered request identities even if an HTTP response was lost.
 for(const order of registry.orders){if(!order.id){const row=await checked(db.from('orders').select('id').eq('request_id',order.requestId).maybeSingle());if(row)order.id=row.id;}}
 save();
 const q=value=>`'${String(value).replaceAll("'","''")}'`;
 const orderIds=registry.orders.filter(order=>order.id).map(order=>q(order.id));
 const statements=['set role postgres;begin;set local lock_timeout=\'5s\';'];
 if(orderIds.length){
  const ids=orderIds.join(',');
  statements.push(`delete from public.payment_allocations where order_item_id in (select id from public.order_items where order_id in (${ids}));`,
   `delete from public.payments where order_id in (${ids});`,
   `delete from public.order_plate_services where order_item_id in (select id from public.order_items where order_id in (${ids}));`,
   `delete from public.order_item_options where order_item_id in (select id from public.order_items where order_id in (${ids}));`,
   `delete from public.order_ingredient_usages where order_id in (${ids});`,
   `delete from public.order_items where order_id in (${ids});`,`delete from public.orders where id in (${ids});`);
 }
 if(registry.deviceHashes.length)statements.push(`delete from public.member_devices where token_hash in (${registry.deviceHashes.map(q)});`);
 for(const member of registry.members){assert.ok(!existingMemberIds.has(member));statements.push(`delete from public.member_devices where member_id=${q(member)};`,`delete from public.members where id=${q(member)};`);}
 if(table)statements.push(`delete from public.dining_sessions where table_id=${Number(table)};`,`delete from public.restaurant_table_aliases where table_id=${Number(table)};`);
 if(menu)statements.push(`delete from public.menu_ingredients where menu_id=${Number(menu)};`);
 const allowedTables=['restaurant_tables','menus','ingredients','categories'];
 for(const row of [...registry.rows].reverse()){assert.ok(allowedTables.includes(row.table));assert.ok(Number.isSafeInteger(Number(row.id)));statements.push(`delete from public.${row.table} where id=${Number(row.id)};`);}
 statements.push('commit;');
 const cleanupFile=path.join(root,'cleanup.private.sql');fs.writeFileSync(cleanupFile,statements.join('\n'));
 await native('psql',['-X','-q','-v','ON_ERROR_STOP=1','-f',cleanupFile],{env:await remoteConnection()});
 for(const user of [...registry.users].reverse()){await clients[user.role]?.auth.signOut();await checked(db.auth.admin.deleteUser(user.id));}
 registry.cleaned=true;save();
 const after=await fingerprint('after-cleanup');
 const changed=Object.keys(before.tables).filter(name=>before.tables[name].md5!==after.tables[name]?.md5||before.tables[name].count!==after.tables[name]?.count);
 result.changedTables=changed;result.sequenceChanges=Object.keys(before.sequences).filter(name=>JSON.stringify(before.sequences[name])!==JSON.stringify(after.sequences[name]));
 assert.ok(changed.every(name=>name==='auth.audit_log_entries'),'Only managed auth audit logs may remain; original business data must match');
 result.cleanupVerified=true;save();console.log(JSON.stringify({passed:result.passed,cleanupVerified:true,checks:result.checks,realtimeEvents:result.realtimeEvents,changedTables:changed,sequenceChanges:result.sequenceChanges}));
}
