// Explicitly authorized hosted TEST-only runner. Never applies migrations.
import assert from 'node:assert/strict';
import { randomBytes,randomUUID } from 'node:crypto';
import { readFileSync,writeFileSync,mkdirSync,cpSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
import { capture,compare } from '../scripts/served-order-baseline.mjs';

const dir=resolve('.test-artifacts/served-orders/live');
const baseline=JSON.parse(readFileSync(`${dir}/before.json`,'utf8'));
const prefix=`TEST-served-${randomBytes(5).toString('hex')}`;
const runDir=`${dir}/runs/${prefix}`;mkdirSync(runDir,{recursive:true});
const registry={prefix,users:[],rows:[],orders:[],sessions:[],itemIds:[],cleaned:false};
const mode=process.argv[2]??'dev';
assert.ok(['dev','production'].includes(mode));
const result={prefix,mode,checks:[],errors:[],realtimeFrames:0};
const save=()=>{for(const folder of [dir,runDir]){writeFileSync(`${folder}/test-registry.json`,JSON.stringify(registry,null,2));writeFileSync(`${folder}/test-results.json`,JSON.stringify(result,null,2));}};
const pass=text=>{result.checks.push(text);save();console.log(`PASS ${text}`);};
const options={auth:{persistSession:false,autoRefreshToken:false}};
const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
const db=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,options);
const publicClient=()=>createClient(url,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,options);
const checked=async p=>{const r=await p;if(r.error)throw Error(r.error.message);return r.data;};
const password=randomBytes(24).toString('base64url')+'aA1!';
const clients={}; const contexts={}; const pages={};
let app,browser,serverLog='',table,menu,ingredient,createdCount=0;
const exclude=(name,row)=>{
 if(['authUsers','profiles'].includes(name))return registry.users.some(u=>u.id===row.id);
 if(registry.rows.some(r=>r.table===name&&r.id===row.id))return true;
 if(name==='orders')return registry.orders.includes(row.id);
 if(name==='dining_sessions')return registry.sessions.includes(row.id);
 if(['order_items','order_ingredient_usages','payments','reviews'].includes(name))return registry.orders.includes(row.order_id);
 if(name==='order_item_options')return registry.itemIds.includes(row.order_item_id);
 if(['menu_ingredients','menu_stock_availability','effective_menu_options'].includes(name))return row.menu_id===menu;
 if(name==='restaurant_table_aliases')return row.table_id===table;
 return false;
};
async function assertOriginals(label){const snapshot=await capture(baseline,exclude);writeFileSync(`${dir}/${label}.json`,JSON.stringify(snapshot,null,2));compare(baseline,snapshot);pass(`${label}: original 23 tables/views and Auth fingerprints unchanged`);}
async function insert(name,values){const row=await checked(db.from(name).insert(values).select('id').single());registry.rows.push({table:name,id:row.id});save();return row.id;}
const currentOrder=async id=>checked(db.from('orders').select('*').eq('id',id).single());
async function denied(client,rpc,args,pattern){const r=await client.rpc(rpc,args);assert.ok(r.error,`${rpc} must be denied`);if(pattern)assert.match(r.error.message,pattern);}
async function until(predicate,label){for(let i=0;i<100;i++){if(await predicate())return;await new Promise(r=>setTimeout(r,100));}assert.fail(label);}
function watch(page){
 page.on('websocket',socket=>{if(!socket.url().includes('/realtime/v1/websocket'))return;socket.on('framereceived',event=>{const payload=String(event.payload);if(payload.includes('postgres_changes')&&registry.orders.some(id=>payload.includes(id))){result.realtimeFrames++;(result.frames??=[]).push({page:page.url(),at:Date.now()});}else if(payload.includes('phx_reply')||payload.includes('system'))(result.controlFrames??=[]).push({page:page.url(),payload,at:Date.now()});});});
 page.on('response',async response=>{if(new URL(response.url()).pathname==='/rest/v1/orders')try{const rows=await response.json();(result.reads??=[]).push({page:page.url(),status:response.status(),filter:new URL(response.url()).searchParams.get('status'),testRows:Array.isArray(rows)?rows.filter(r=>registry.orders.includes(r.id)).map(r=>({id:r.id,status:r.status})):rows,at:Date.now()});}catch{}});
}
async function createOrder(diningType,label){
 const sessionToken=randomUUID(); const requestId=randomUUID();
 const response=await fetch('http://localhost:4420/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tableId:String(table),sessionToken,requestId,diningType,note:`${prefix} ${label}`,items:[{menuId:menu,quantity:1,optionSelections:[]}]})});
 const body=await response.json();assert.equal(response.status,201,JSON.stringify(body));
 const order=body.order;registry.orders.push(order.id);registry.sessions.push(order.session_id);save();
 const items=await checked(db.from('order_items').select('id').eq('order_id',order.id));registry.itemIds.push(...items.map(i=>i.id));save();createdCount++;
 assert.equal(order.status,'confirmed');assert.equal(order.stock_deducted,true);
 return {order,sessionToken,label:`${prefix} ${label}`};
}
const article=(page,label)=>page.locator('article').filter({hasText:label});
async function doubleClick(page,button,rpc){const calls=[];const listener=r=>{if(new URL(r.url()).pathname.endsWith(`/rpc/${rpc}`))calls.push(r);};page.on('request',listener);await button.evaluate(el=>{el.click();el.click();});await until(()=>calls.length>0,`${rpc} request`);await page.waitForTimeout(300);page.off('request',listener);assert.equal(calls.length,1,`${rpc} double click sends one request`);}

try {
 compare(baseline,await capture(baseline));save();
 const actors=await checked(db.from('profiles').select('id').eq('role','admin').eq('is_active',true).limit(1));assert.equal(actors.length,1);
 for(const role of ['admin','staff','kitchen_staff']){
  const email=`${prefix}-${role}@example.invalid`.toLowerCase();const data=await checked(db.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:`${prefix} ${role}`}}));
  registry.users.push({id:data.user.id,email,role});save();
  await checked(db.rpc('manage_staff_profile',{p_actor_id:actors[0].id,p_target_id:data.user.id,p_role:role,p_is_active:true,p_full_name:`${prefix} ${role}`}));
  clients[role]=publicClient();await checked(clients[role].auth.signInWithPassword({email,password}));
 }
 const category=await insert('categories',{name:prefix});
 ingredient=await insert('ingredients',{name:prefix,unit:'TEST',stock_quantity:100,minimum_stock:0});
 menu=await insert('menus',{name:prefix,category_id:category,price:37,is_available:false});
 await checked(db.from('menu_ingredients').insert({menu_id:menu,ingredient_id:ingredient,quantity_required:2}));
 await checked(db.from('menus').update({is_available:true}).eq('id',menu));
 table=await insert('restaurant_tables',{table_number:prefix,qr_code:prefix,status:'available'});
 await assertOriginals('after-test-provision');
 const appDir=`${dir}/app-${Date.now()}`;mkdirSync(appDir);
 for(const name of ['src','public','package.json','tsconfig.json','next-env.d.ts','postcss.config.mjs'])cpSync(name,`${appDir}/${name}`,{recursive:true});
 writeFileSync(`${appDir}/next.config.mjs`,`export default {turbopack:{root:${JSON.stringify(process.cwd())}}};\n`);
 if(mode==='production'){
  const build=spawn(process.execPath,[resolve('node_modules/next/dist/bin/next'),'build'],{cwd:appDir,env:{...process.env,NEXT_TELEMETRY_DISABLED:'1'},windowsHide:true,stdio:['ignore','pipe','pipe']});
  build.stdout.on('data',c=>serverLog+=c);build.stderr.on('data',c=>serverLog+=c);
  assert.equal(await new Promise(r=>build.on('exit',r)),0,'production build');
 }
 app=spawn(process.execPath,[resolve('node_modules/next/dist/bin/next'),mode==='production'?'start':'dev','-p','4420'],{cwd:appDir,env:{...process.env,NEXT_TELEMETRY_DISABLED:'1'},windowsHide:true,stdio:['ignore','pipe','pipe']});
 app.stdout.on('data',c=>serverLog+=c);app.stderr.on('data',c=>serverLog+=c);
 await until(async()=>{assert.equal(app.exitCode,null);try{return (await fetch('http://localhost:4420/login',{signal:AbortSignal.timeout(1500)})).ok;}catch{return false;}},'app ready');
 browser=await chromium.launch({channel:'msedge',headless:true});
 for(const user of registry.users){
  const context=await browser.newContext();contexts[user.role]=context;const page=await context.newPage();pages[user.role]=page;page.setDefaultTimeout(30000);watch(page);
  await page.goto('http://localhost:4420/login');await page.locator('input[type=email]').fill(user.email);await page.locator('input[type=password]').fill(password);await page.locator('button[type=submit]').click();await page.waitForURL(/\/dashboard(?:\/kitchen)?$/);
 }
 const kitchen=pages.kitchen_staff;
 for(const path of ['orders','ready']){await kitchen.goto(`http://localhost:4420/dashboard/${path}`);await kitchen.waitForURL('**/access-denied');}
 pass('Kitchen Staff cannot access Orders/Ready pages');
 for(const role of ['staff','admin'])for(const diningType of ['dine_in','takeaway']){
  const {order,sessionToken,label}=await createOrder(diningType,`${role}-${diningType}`);
  const args={p_order_id:order.id};
  await denied(clients[role],'serve_order',args,/ORDER_NOT_READY/);
  await denied(clients[role],'complete_order_payment',{...args,p_payment_method:'cash'},/ORDER_NOT_SERVED/);
  await denied(clients.staff,'advance_order_status',{...args,p_expected:'confirmed',p_next:'preparing'},/KITCHEN_ROLE_REQUIRED/);
  await checked(clients.kitchen_staff.rpc('advance_order_status',{...args,p_expected:'confirmed',p_next:'preparing'}));
  const staffPage=pages[role];await staffPage.setViewportSize(role==='admin'?{width:375,height:812}:{width:1440,height:1000});await staffPage.goto('http://localhost:4420/dashboard/ready');
  const awaiting=await contexts[role].newPage();watch(awaiting);await awaiting.goto('http://localhost:4420/dashboard/orders?status=served');
  const customerContext=await browser.newContext();
  // Disable only the legacy five-second customer poll to prove genuine push updates.
  await customerContext.addInitScript(({table,sessionToken})=>{
   localStorage.setItem(`smart-order-session-id-${table}`,sessionToken);
   const interval=window.setInterval.bind(window);window.setInterval=(handler,timeout,...args)=>timeout===5000?0:interval(handler,timeout,...args);
   window.__streamEvents=[];
   const originalFetch=window.fetch.bind(window);window.fetch=async(...args)=>{
    const response=await originalFetch(...args);
    if(String(args[0]).includes('/api/customer-orders/events')&&response.ok){
     void(async()=>{try{const reader=response.clone().body.getReader();const decoder=new TextDecoder();let pending='';for(;;){const{value,done}=await reader.read();if(done)break;pending+=decoder.decode(value,{stream:true});const lines=pending.split('\n');pending=lines.pop();for(const line of lines)window.__streamEvents.push(JSON.parse(line).type);}}catch{}})();
    }return response;
   };
  },{table,sessionToken});
  const customer=await customerContext.newPage();customer.setDefaultTimeout(30000);
  await customer.goto(`http://localhost:4420/table/id-${table}/orders`);
  await customer.getByText('กำลังทำ',{exact:true}).waitFor();
  await customer.waitForFunction(()=>window.__streamEvents.includes('ready'));
  await kitchen.goto('http://localhost:4420/dashboard/kitchen');await article(kitchen,label).waitFor();
  await doubleClick(kitchen,article(kitchen,label).getByRole('button',{name:'อาหารพร้อมเสิร์ฟ',exact:true}),'advance_order_status');
  await until(async()=>(await currentOrder(order.id)).status==='ready','ready committed');
  await article(staffPage,label).waitFor();await customer.getByText('พร้อมเสิร์ฟ',{exact:true}).waitFor();
  for(const rpc of ['serve_order','complete_order_payment'])await denied(clients.kitchen_staff,rpc,rpc==='serve_order'?args:{...args,p_payment_method:'cash'},/STAFF_ROLE_REQUIRED/);
  await denied(clients.admin,'advance_order_status',{...args,p_expected:'ready',p_next:'completed'},/INVALID_TRANSITION/);
  await denied(clients.kitchen_staff,'advance_order_status',{...args,p_expected:'ready',p_next:'served'},/INVALID_TRANSITION/);
  await denied(clients[role],'complete_order_payment',{...args,p_payment_method:'cash'},/ORDER_NOT_SERVED/);
  await denied(publicClient(),'serve_order',args);
  const direct=await clients.kitchen_staff.from('orders').update({status:'completed'}).eq('id',order.id);assert.ok(direct.error);
  const serveLabel=diningType==='dine_in'?'เสิร์ฟแล้ว':'ส่งมอบแล้ว';
  assert.equal(await article(staffPage,label).getByRole('button',{name:'รับชำระเงิน',exact:true}).count(),0);
  await doubleClick(staffPage,article(staffPage,label).getByRole('button',{name:serveLabel,exact:true}),'serve_order');
  await article(staffPage,label).waitFor({state:'hidden'});await article(awaiting,label).waitFor();
  await customer.getByText('เสิร์ฟแล้ว กรุณาชำระเงินที่เคาน์เตอร์',{exact:true}).waitFor();
  assert.ok((await customer.evaluate(()=>window.__streamEvents)).includes('change'));
  const served=await currentOrder(order.id);assert.equal(served.status,'served');assert.ok(served.served_at);assert.equal(served.served_by,registry.users.find(u=>u.role===role).id);
  assert.match(await article(awaiting,label).innerText(),/37/);assert.match(await article(awaiting,label).innerText(),/เสิร์ฟเมื่อ|ส่งมอบอาหารเมื่อ/);
  if(diningType==='dine_in')assert.match(await article(awaiting,label).innerText(),new RegExp(prefix));
  await Promise.all([checked(clients.admin.rpc('serve_order',args)),checked(clients.staff.rpc('serve_order',args))]);
  const duplicate=await currentOrder(order.id);assert.equal(duplicate.served_at,served.served_at);assert.equal(duplicate.served_by,served.served_by);
  await denied(clients.kitchen_staff,'complete_order_payment',{...args,p_payment_method:'cash'},/STAFF_ROLE_REQUIRED/);
  await article(awaiting,label).getByRole('button',{name:'รับชำระเงิน',exact:true}).click();
  await doubleClick(awaiting,article(awaiting,label).getByRole('button',{name:diningType==='dine_in'?'เงินสด':'QR Code',exact:true}),'complete_order_payment');
  await article(awaiting,label).waitFor({state:'hidden'});assert.equal((await currentOrder(order.id)).status,'completed');
  await denied(clients[role],'complete_order_payment',{...args,p_payment_method:'cash'},/ORDER_NOT_SERVED/);
  const payments=await checked(db.from('payments').select('*').eq('order_id',order.id));assert.equal(payments.length,1);assert.equal(Number(payments[0].amount),37);
  const usage=await checked(db.from('order_ingredient_usages').select('*').eq('order_id',order.id));assert.equal(usage.length,1);assert.equal(usage[0].ingredient_id,ingredient);assert.equal(Number(usage[0].quantity_used),2);
  assert.equal(Number((await checked(db.from('ingredients').select('stock_quantity').eq('id',ingredient).single())).stock_quantity),100-2*createdCount);
  await customerContext.close();await awaiting.close();
  pass(`${role}/${diningType}: preparing → ready → served → completed; labels, two-view live movement, private customer Realtime with polling disabled, audit, double clicks, roles, stock and usage`);
  await assertOriginals(`after-${role}-${diningType}`);
 }
 // Independent JWT clients issue actual concurrent transactions on hosted Postgres.
 const {order}=await createOrder('takeaway','concurrency');const args={p_order_id:order.id};
 await checked(clients.admin.rpc('advance_order_status',{...args,p_expected:'confirmed',p_next:'preparing'}));
 await checked(clients.admin.rpc('advance_order_status',{...args,p_expected:'preparing',p_next:'ready'}));
 await Promise.all([checked(clients.admin.rpc('serve_order',args)),checked(clients.staff.rpc('serve_order',args))]);
 const served=await currentOrder(order.id);assert.ok(registry.users.some(u=>['admin','staff'].includes(u.role)&&u.id===served.served_by));
 const payments=await Promise.all([clients.admin.rpc('complete_order_payment',{...args,p_payment_method:'cash'}),clients.staff.rpc('complete_order_payment',{...args,p_payment_method:'qr_code'})]);
 assert.equal(payments.filter(p=>!p.error).length,1);assert.equal((await checked(db.from('payments').select('id').eq('order_id',order.id))).length,1);
 assert.equal((await currentOrder(order.id)).served_at,served.served_at);
 pass('Concurrent independent Admin/Staff transactions: first service audit preserved, one payment only');
 const invalid=await fetch('http://localhost:4420/api/customer-orders/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tableId:table,sessionToken:randomUUID()})});assert.equal(invalid.status,403);
 pass('Customer Realtime rejects unknown private session tokens');
 assert.ok(result.realtimeFrames>0);pass(`Observed ${result.realtimeFrames} actual hosted postgres_changes frames in dashboard browsers`);
} catch(error){
 result.errors.push(String(error.stack??error));console.error(error.message);process.exitCode=1;
 const diagnostics={pages:[],orders:[]};
 for(const context of browser?.contexts()??[])for(const page of context.pages())diagnostics.pages.push({url:page.url(),visibility:await page.evaluate(()=>document.visibilityState).catch(()=>''),text:await page.locator('body').innerText().catch(()=>''),events:await page.evaluate(()=>window.__streamEvents).catch(()=>null)});
 for(const id of registry.orders)diagnostics.orders.push(await currentOrder(id));
 writeFileSync(`${runDir}/diagnostics.json`,JSON.stringify(diagnostics,null,2));
}
finally {
 await browser?.close();
 if(app&&app.exitCode===null){app.kill();await new Promise(r=>{app.once('exit',r);setTimeout(r,3000);});}
 writeFileSync(`${dir}/server.log`,serverLog);
 try{
  // If original data differs, stop without any cleanup/repair write.
  await assertOriginals('before-test-cleanup');
  for(const id of registry.orders){
   const row=await currentOrder(id);assert.ok(row.note.startsWith(`${prefix} `));assert.equal(row.table_id,table);
   for(const child of ['payments','order_ingredient_usages'])await checked(db.from(child).delete().eq('order_id',id));
   const items=await checked(db.from('order_items').select('id').eq('order_id',id));
   if(items.length)await checked(db.from('order_item_options').delete().in('order_item_id',items.map(i=>i.id)));
   await checked(db.from('order_items').delete().eq('order_id',id));await checked(db.from('orders').delete().eq('id',id));
  }
  for(const id of registry.sessions){const row=await checked(db.from('dining_sessions').select('table_id').eq('id',id).single());assert.equal(row.table_id,table);await checked(db.from('dining_sessions').delete().eq('id',id));}
  for(const row of [...registry.rows].reverse()){
   const current=await checked(db.from(row.table).select('*').eq('id',row.id).single());assert.equal(current.name??current.table_number,prefix);
   if(row.table==='restaurant_tables')await checked(db.from('restaurant_table_aliases').delete().eq('table_id',row.id).eq('table_number',prefix));
   if(row.table==='menus')await checked(db.from('menu_ingredients').delete().eq('menu_id',row.id).eq('ingredient_id',ingredient));
   await checked(db.from(row.table).delete().eq('id',row.id));
  }
  for(const user of [...registry.users].reverse()){const data=await checked(db.auth.admin.getUserById(user.id));assert.equal(data.user.email,user.email);await checked(db.auth.admin.deleteUser(user.id));}
  const after=await capture(baseline);writeFileSync(`${dir}/after-cleanup.json`,JSON.stringify(after,null,2));compare(baseline,after);registry.cleaned=true;
  pass('Only registered TEST rows/users removed; final fingerprints equal pre-migration baseline');
 }catch(error){result.errors.push(`STOP cleanup/audit: ${error.message}`);console.error(`STOP: ${error.message}`);process.exitCode=1;}
 for(const client of Object.values(clients))await client.removeAllChannels();
 save();console.log(JSON.stringify({checks:result.checks.length,errors:result.errors.length,cleaned:registry.cleaned}));
}
