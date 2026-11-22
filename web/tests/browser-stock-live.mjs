import {createClient} from '@supabase/supabase-js';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
process.env.CATALOG_BROWSER_RUN=process.env.STOCK_BROWSER_RUN ?? 'stock-live';
const {s,save,db,data,check,cleanup,verify,fingerprint,root}=await import('./browser-catalog-redesign.mjs');
const base=process.env.STOCK_BASE_URL ?? 'http://localhost:3102';
async function setup(){
 assert.ok(!s.before);s.before=await fingerprint();s.email=`${s.prefix.toLowerCase()}@example.invalid`;s.password=randomBytes(24).toString('base64url');save();
 const user=await db.auth.admin.createUser({email:s.email,password:s.password,email_confirm:true});assert.ifError(user.error);s.userId=user.data.user.id;save();
 await data(db.from('profiles').update({role:'admin'}).eq('id',s.userId));
 s.table=await data(db.from('restaurant_tables').insert({table_number:String(800000+Math.floor(Math.random()*90000)),qr_code:s.prefix,status:'available'}).select().single());save();
 for(const name of ['ข้าว','เนื้อ','ไข่','กุ้ง','ปลาหมึก']){s.ingredients.push(await data(db.from('ingredients').insert({name:`${s.prefix}_${name}`,unit:'กรัม',stock_quantity:10000,minimum_stock:0}).select().single()));save();}
 const category=(await data(db.from('categories').select('id').limit(1)))[0];
 for(const suffix of ['A','B']){const m=await data(db.from('menus').insert({name:`${s.prefix}_${suffix}`,price:50,is_available:true,category_id:category.id}).select().single());s.menus.push(m);save();await data(db.from('menu_ingredients').insert({menu_id:m.id,ingredient_id:s.ingredients[0].id,quantity_required:100}));}
 for(const [name,category,price,recipe]of [['เนื้อ','meat',10,[[1,150]]],['ทะเล','meat',15,[[3,30],[4,30]]],['ไข่ดาว','topping',10,[[2,1]]],['เพิ่มข้าว','portion',10,[[0,50]]]]){
 const a=await data(db.from('addons').insert({name:`${s.prefix}_${name}`,category,additional_price:price,is_available:true,max_quantity:3}).select().single());s.addons.push(a);save();await data(db.from('addon_ingredients').insert(recipe.map(([i,q])=>({addon_id:a.id,ingredient_id:s.ingredients[i].id,quantity_required:q}))));
 }
 check('isolated Admin account, 2 menus, 4 addons, 5 ingredients and table registered');
}

async function reproduce(){
 const browser=await chromium.launch({channel:'msedge',headless:true});const ctx=await browser.newContext();const page=await ctx.newPage();
 try {
 await page.goto(`${base}/login`);await page.getByLabel('อีเมล',{exact:true}).fill(s.email);await page.getByLabel('รหัสผ่าน',{exact:true}).fill(s.password);await page.getByRole('button',{name:'เข้าสู่ระบบ',exact:true}).click();await page.waitForURL('**/dashboard');
 await page.goto(`${base}/dashboard/ingredients`);const cell=page.getByRole('row').filter({has:page.getByText(s.ingredients[0].name,{exact:true})}).getByRole('cell').nth(2);const before=await cell.innerText();
 const r=await ctx.request.post(`${base}/api/orders`,{data:{tableId:s.table.id,sessionToken:randomUUID(),items:[{menuId:s.menus[0].id,quantity:1,optionSelections:[]}]}});assert.equal(r.status(),201,await r.text());const order=(await r.json()).order;
 const ingredient=await data(db.from('ingredients').select('stock_quantity').eq('id',s.ingredients[0].id).single());const usages=await data(db.from('order_ingredient_usages').select('*').eq('order_id',order.id));
 await page.waitForTimeout(3000);const stale=await cell.innerText();await page.reload();const refreshed=await cell.innerText();
 const evidence={order,before,stale,refreshed,dbStock:ingredient.stock_quantity,usages};writeFileSync(`${root}/before-fix.json`,JSON.stringify(evidence,null,2));
 assert.equal(order.stock_deducted,true);assert.equal(Number(ingredient.stock_quantity),9900);assert.equal(before,stale);assert.notEqual(refreshed,stale);
 const cancelled=await ctx.request.post(`${base}/api/orders/${order.id}/cancel`,{data:{currentStatus:'confirmed'}});assert.equal(cancelled.status(),200);check('REPRODUCED: DB deducts 100 and records usage; open Ingredients page stays at 10000 until reload');
 }finally{await browser.close();}
}

async function regression(){
 const staff=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false}});assert.ifError((await staff.auth.signInWithPassword({email:s.email,password:s.password})).error);
 await data(staff.rpc('set_menu_addons',{p_menu_id:s.menus[0].id,p_addon_ids:s.addons.map(a=>a.id)}));
 const options=await data(db.from('effective_menu_options').select('*').eq('menu_id',s.menus[0].id));const sel=(i,q=1)=>({optionId:options.find(o=>o.addon_id===s.addons[i].id).id,quantity:q});
 const browser=await chromium.launch({channel:'msedge',headless:true});const ctx=await browser.newContext();const page=await ctx.newPage();page.setDefaultTimeout(20000);
 const stock=async()=>await data(db.from('ingredients').select('id,stock_quantity').in('id',s.ingredients.map(i=>i.id)).order('id'));
 const post=async(body)=>{const r=await ctx.request.post(`${base}/api/orders`,{data:body});return {status:r.status(),body:await r.json()};};
 const payload=(selections=[],quantity=1,menu=s.menus[0],token=randomUUID())=>({requestId:randomUUID(),tableId:s.table.id,sessionToken:token,items:[{menuId:menu.id,quantity,optionSelections:selections}]});
 const cancel=async o=>{const r=await ctx.request.post(`${base}/api/orders/${o.id}/cancel`,{data:{currentStatus:'confirmed'}});assert.equal(r.status(),200,await r.text());};
 const verifyOrder=async(o,before,expected)=>{
 assert.equal(o.stock_deducted,true);assert.equal((await data(db.from('orders').select('stock_deducted').eq('id',o.id).single())).stock_deducted,true);
 const usage=await data(db.from('order_ingredient_usages').select('*').eq('order_id',o.id));assert.deepEqual(Object.fromEntries(usage.map(u=>[u.ingredient_id,Number(u.quantity_used)])),expected);
 const now=await stock();for(const i of now)assert.equal(Number(i.stock_quantity),Number(before.find(x=>x.id===i.id).stock_quantity)-(expected[i.id]??0));
 };
 try {
 await page.goto(`${base}/login`);await page.getByLabel('อีเมล',{exact:true}).fill(s.email);await page.getByLabel('รหัสผ่าน',{exact:true}).fill(s.password);await page.getByRole('button',{name:'เข้าสู่ระบบ',exact:true}).click();await page.waitForURL('**/dashboard');
 await page.goto(`${base}/dashboard/ingredients`);await page.getByText(s.ingredients[0].name,{exact:true}).waitFor();const cell=page.getByRole('row').filter({has:page.getByText(s.ingredients[0].name,{exact:true})}).getByRole('cell').nth(2);const original=await cell.innerText();
 const evidence=[];
 for(const [name,selections,qty,amounts]of [['base',[],1,[100,0,0,0,0]],['meat',[sel(0)],1,[100,150,0,0,0]],['all groups',[sel(0),sel(2),sel(3)],1,[150,150,1,0,0]],['multiple dishes and shared rice',[sel(0),sel(2,2),sel(3,3)],2,[500,300,4,0,0]]]){
 const before=await stock();const result=await post(payload(selections,qty));assert.equal(result.status,201,JSON.stringify(result));const expected=Object.fromEntries(amounts.map((q,i)=>[s.ingredients[i].id,q]).filter(([,q])=>q));await verifyOrder(result.body.order,before,expected);
 if(name==='base'){await page.waitForFunction(name=>{const row=[...document.querySelectorAll('tr')].find(r=>r.textContent.includes(name));return row?.children[2]?.textContent.includes('9,900');},s.ingredients[0].name,{timeout:20000});assert.notEqual(await cell.innerText(),original);evidence.push({name,order:result.body.order,expected,screen:await cell.innerText()});}
 await cancel(result.body.order);assert.deepEqual(await stock(),before);assert.equal((await ctx.request.post(`${base}/api/orders/${result.body.order.id}/cancel`,{data:{currentStatus:'confirmed'}})).status(),409);assert.deepEqual(await stock(),before);check(name+': usage, stock=true, aggregate deduction and cancel exactly once');
 }
 await page.waitForFunction(name=>{const row=[...document.querySelectorAll('tr')].find(r=>r.textContent.includes(name));return row?.children[2]?.textContent.includes('10,000');},s.ingredients[0].name);check('open Ingredients page updates deduction and restoration without reload');
 const before=await stock();const identical=payload([sel(0),sel(2),sel(3)]);const same=await Promise.all([post(identical),post(identical)]);assert.ok(same.every(r=>[200,201].includes(r.status)),JSON.stringify(same));assert.equal(same[0].body.order.id,same[1].body.order.id);await verifyOrder(same[0].body.order,before,{[s.ingredients[0].id]:150,[s.ingredients[1].id]:150,[s.ingredients[2].id]:1});
 assert.equal((await post({...identical,items:[{...identical.items[0],quantity:2}]})).status,409);await cancel(same[0].body.order);assert.deepEqual(await stock(),before);check('simultaneous identical request creates one order and deducts once; changed payload rejected');
 const session=randomUUID();const sameSession=await Promise.all([post(payload([],1,s.menus[0],session)),post(payload([],1,s.menus[0],session))]);assert.ok(sameSession.every(r=>r.status===201),JSON.stringify(sameSession));for(const r of sameSession)await cancel(r.body.order);assert.deepEqual(await stock(),before);check('concurrent first orders in same session avoid session creation race');
 const scarce=await data(db.from('ingredients').insert({name:`${s.prefix}_scarce`,unit:'gram',stock_quantity:100,minimum_stock:0}).select().single());s.ingredients.push(scarce);save();
 const raceMenu=await data(db.from('menus').insert({name:`${s.prefix}_RACE`,price:10,is_available:true,category_id:s.menus[0].category_id}).select().single());s.menus.push(raceMenu);save();await data(db.from('menu_ingredients').insert({menu_id:raceMenu.id,ingredient_id:scarce.id,quantity_required:100}));
 const ordersBefore=await data(db.from('orders').select('id').eq('table_id',s.table.id));const race=await Promise.all([post(payload([],1,raceMenu)),post(payload([],1,raceMenu))]);assert.deepEqual(race.map(r=>r.status).sort(),[201,409],JSON.stringify(race));assert.equal((await data(db.from('orders').select('id').eq('table_id',s.table.id))).length,ordersBefore.length+1);assert.equal(Number((await data(db.from('ingredients').select('stock_quantity').eq('id',scarce.id).single())).stock_quantity),0);await cancel(race.find(r=>r.status===201).body.order);assert.equal(Number((await data(db.from('ingredients').select('stock_quantity').eq('id',scarce.id).single())).stock_quantity),100);check('competing orders for last stock: exactly one succeeds; loser leaves no order; cancel restores');
 await data(db.from('menu_ingredients').delete().eq('menu_id',s.menus[1].id));const counts=await data(db.from('orders').select('id').eq('table_id',s.table.id));assert.equal((await post(payload([],1,s.menus[1]))).status,409);
 const eggRecipe=await data(db.from('addon_ingredients').select('*').eq('addon_id',s.addons[2].id));await data(db.from('addon_ingredients').delete().eq('addon_id',s.addons[2].id));assert.equal((await post(payload([sel(2)]))).status,409);await data(db.from('addon_ingredients').insert(eggRecipe));assert.deepEqual(await data(db.from('orders').select('id').eq('table_id',s.table.id)),counts);check('missing base/addon recipes rejected with no orders');
 // Real customer click and network payload (not only API requests).
 const customer=await ctx.newPage();await customer.goto(`${base}/table/${s.table.table_number}`);await customer.locator('article').filter({has:customer.getByRole('heading',{name:s.menus[0].name,exact:true})}).getByRole('button',{name:'เพิ่ม',exact:true}).click();await customer.getByRole('button',{name:/^เพิ่มลงตะกร้า/}).click();await customer.getByRole('button',{name:'ดูตะกร้า',exact:true}).click();
 const requests=[];customer.on('request',r=>{if(r.url().endsWith('/api/orders')&&r.method()==='POST')requests.push(r.postDataJSON());});
 const response=customer.waitForResponse(r=>r.url().endsWith('/api/orders')&&r.request().method()==='POST');await customer.getByRole('button',{name:'ยืนยันการสั่งอาหาร',exact:true}).evaluate(e=>{e.click();e.click();});const r=await response;assert.equal(r.status(),201,await r.text());const actual=(await r.json()).order;await customer.waitForURL('**/orders');assert.equal(requests.length,1);assert.match(requests[0].requestId,/^[0-9a-f-]{36}$/);const retry=await post(requests[0]);assert.equal(retry.status,200);assert.equal(retry.body.order.id,actual.id);await cancel(actual);check('Browser double click sends one request; retry reuses existing order');
 writeFileSync(`${root}/after-fix.json`,JSON.stringify({evidence,checks:s.checks},null,2));await page.screenshot({path:`${root}/after-fix.png`});
 }catch(e){await page.screenshot({path:`${root}/failure.png`});throw e;}finally{await browser.close();}
}
try{if(process.argv[2]==='setup')await setup();else if(process.argv[2]==='regression')await regression();else if(process.argv[2]==='reproduce')await reproduce();else if(process.argv[2]==='cleanup')await cleanup();else if(process.argv[2]==='verify')await verify();else throw Error('setup/reproduce/cleanup/verify --remote-test');}catch(e){save();console.error(e.message);process.exitCode=1;}
