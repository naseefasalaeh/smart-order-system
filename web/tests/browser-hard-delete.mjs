import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
process.env.CATALOG_BROWSER_RUN='hard-delete-browser';
const {s,save,db,data,check,setup,cleanup,verify,root}=await import('./browser-catalog-redesign.mjs');

async function run(){
 assert.ok(s.table&&!s.cleaned);
 const browser=await chromium.launch({channel:'chrome',headless:true});const ctx=await browser.newContext({viewport:{width:1440,height:1000}});const page=await ctx.newPage();page.setDefaultTimeout(20000);
 const base='http://localhost:3000';const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const ingredient=name=>s.ingredients.find(i=>i.name===`${s.prefix}_${name}`);
 async function openDelete(kind,row){await page.goto(`${base}/dashboard/${kind==='menu'?'menus':'ingredients'}`);await page.getByRole('row').filter({has:page.getByText(row.name,{exact:true})}).getByRole('button',{name:kind==='menu'?'ลบเมนู':'ลบวัตถุดิบ',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByRole('textbox').fill(row.name);return dialog;}
 const order=async(menu,meat)=>{
  const option=await data(db.from('effective_menu_options').select('*').eq('menu_id',menu.id).eq('name',meat).single());
  const token=randomUUID();const r=await ctx.request.post(`${base}/api/orders`,{data:{tableId:s.table.id,sessionToken:token,diningType:'takeaway',items:[{menuId:menu.id,quantity:1,optionSelections:[{optionId:option.id,quantity:1}]}]}});assert.equal(r.status(),201,await r.text());const result=(await r.json()).order;result.token=token;return result;
 };
 try{
  await page.goto(`${base}/login`);await page.getByLabel('อีเมล',{exact:true}).fill(s.email);await page.getByLabel('รหัสผ่าน',{exact:true}).fill(s.password);await page.getByRole('button',{name:'เข้าสู่ระบบ',exact:true}).click();await page.waitForURL('**/dashboard');
  await page.goto(`${base}/dashboard/menus`);assert.equal(await page.getByRole('button',{name:'ลบเมนู',exact:true}).count(),0);
  const staffDb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false}});
  const token=await staffDb.auth.signInWithPassword({email:s.email,password:s.password});assert.ifError(token.error);
  const staff=await staffDb.rpc('delete_catalog_item_safely',{p_kind:'menu',p_id:s.menus[0].id,p_name:s.menus[0].name});assert.ok(staff.error);await staffDb.auth.signOut({scope:'local'});
  // Only this run's temporary user is promoted; the real Admin account is untouched.
  await data(db.from('profiles').update({role:'admin'}).eq('id',s.userId));check('staff cannot see delete controls or call hard-delete RPC');
  s.paid=await order(s.menus[0],'เนื้อ');s.active=await order(s.menus[0],'ไก่');save();
  await data(db.from('orders').update({status:'ready'}).eq('id',s.paid.id));await data(db.rpc('complete_order_payment',{p_order_id:s.paid.id,p_payment_method:'cash'}));
  const orderCount=(await data(db.from('orders').select('id').eq('table_id',s.table.id))).length;
  let dialog=await openDelete('ingredient',ingredient('เนื้อไก่'));await dialog.getByRole('button',{name:'ยืนยันลบถาวร',exact:true}).click();await dialog.getByRole('alert').filter({hasText:'ปิดหรือยกเลิกออเดอร์'}).waitFor();await dialog.getByRole('button',{name:'ยกเลิก',exact:true}).click();check('browser blocks ingredient linked to deducted active order');
  dialog=await openDelete('menu',s.menus[0]);await dialog.getByRole('textbox').fill('wrong');assert.equal(await dialog.getByRole('button',{name:'ยืนยันลบถาวร',exact:true}).isDisabled(),true);await dialog.getByRole('textbox').fill(s.menus[0].name);
  await dialog.getByRole('button',{name:'ยืนยันลบถาวร',exact:true}).click();await page.waitForURL('**/dashboard/menus?success=**');assert.equal((await data(db.from('menus').select('id').eq('id',s.menus[0].id))).length,0);
  const historical=await data(db.from('order_items').select('*,order_item_options(*)').eq('order_id',s.paid.id).single());assert.equal(historical.menu_id,null);assert.equal(historical.menu_name_snapshot,s.menus[0].name);assert.equal(Number(historical.menu_price_snapshot),60);assert.equal(historical.order_item_options[0].option_name,'เนื้อ');assert.equal(Number(historical.order_item_options[0].additional_price),10);check('browser deletes actual menu, preserving charged price/name/options in history');
  await page.goto(`${base}/dashboard/orders?status=history`);await page.getByText(s.menus[0].name,{exact:false}).first().waitFor();
  await page.goto(`${base}/dashboard/kitchen`);await page.getByText(s.menus[0].name,{exact:false}).first().waitFor();
  await page.goto(`${base}/table/${s.table.table_number}/orders`);await page.evaluate(({table,token})=>localStorage.setItem(`smart-order-session-${table}`,token),{table:s.table.table_number,token:s.active.token});await page.reload();await page.getByText(s.menus[0].name,{exact:false}).first().waitFor();
  await page.goto(`${base}/dashboard/reports`);assert.equal(await page.locator('nextjs-portal [data-nextjs-dialog-overlay]').count(),0);check('Orders Kitchen and customer orders render deleted menu; Reports loads without an error');
  const cancelled=await ctx.request.post(`${base}/api/orders/${s.active.id}/cancel`,{data:{currentStatus:'confirmed'}});assert.equal(cancelled.status(),200);
  assert.equal(Number((await data(db.from('ingredients').select('stock_quantity').eq('id',ingredient('เนื้อไก่').id).single())).stock_quantity),10000);
  dialog=await openDelete('ingredient',ingredient('เนื้อไก่'));await dialog.getByRole('button',{name:'ยืนยันลบถาวร',exact:true}).click();await page.waitForURL('**/dashboard/ingredients?success=**');
  const usage=await data(db.from('order_ingredient_usages').select('*').eq('order_id',s.active.id).eq('ingredient_id_snapshot',ingredient('เนื้อไก่').id).single());assert.equal(usage.ingredient_id,null);assert.equal(usage.ingredient_name_snapshot,ingredient('เนื้อไก่').name);assert.equal(Number(usage.quantity_used),150);check('cancel restores stock after menu deletion; ingredient then physically deletes with usage snapshot');
  dialog=await openDelete('ingredient',ingredient('เนื้อวัว'));await dialog.getByRole('button',{name:'ยืนยันลบถาวร',exact:true}).click();await page.waitForURL('**/dashboard/ingredients?success=**');assert.equal((await data(db.from('ingredients').select('id').eq('id',ingredient('เนื้อวัว').id))).length,0);
  assert.equal((await data(db.from('orders').select('id').eq('table_id',s.table.id))).length,orderCount);
  const before=await data(db.from('ingredients').select('id,stock_quantity').in('id',s.ingredients.map(i=>i.id)).order('id'));
  const remaining=await order(s.menus[1],'ทะเล');const r=await ctx.request.post(`${base}/api/orders/${remaining.id}/cancel`,{data:{currentStatus:'confirmed'}});assert.equal(r.status(),200);assert.deepEqual(await data(db.from('ingredients').select('id,stock_quantity').in('id',s.ingredients.map(i=>i.id)).order('id')),before);check('remaining menu seafood order deducts/restores exact stock after ingredient deletion');
  assert.deepEqual(errors,[]);await page.screenshot({path:`${root}/completed.png`});
 }catch(e){s.failure={message:e.message,url:page.url()};save();await page.screenshot({path:`${root}/failure.png`});throw e;}finally{await browser.close();}
}
async function clean(){
 // Remove only audit events generated by this temporary user's registered TEST IDs.
 assert.match(s.userId,/^[0-9a-f-]{36}$/);assert.match(s.email,/^test_redesign_[0-9]+@example.invalid$/);
 const ids=[...s.menus,...s.ingredients].map(r=>r.id);assert.ok(ids.every(Number.isSafeInteger));
 const sql=`begin; do $$ begin if not exists(select 1 from auth.users where id='${s.userId}' and email='${s.email}') then raise exception 'TEST_USER_MISMATCH'; end if; end $$; delete from catalog_backup.hard_delete_events where actor_id='${s.userId}' and catalog_id in (${ids.join(',')}); commit;`;
 const path=`${root}/cleanup-audit.sql`;writeFileSync(path,sql);
 // .cmd invocation needs Windows shell. All dynamic SQL stays in the checked file.
 execFileSync('cmd.exe',['/d','/s','/c',`npx --no-install supabase db query --linked --file ${path} -o json`],{stdio:'pipe'});
 await cleanup();
}
try{if(process.argv[2]==='setup')await setup();else if(process.argv[2]==='run')await run();else if(process.argv[2]==='cleanup')await clean();else if(process.argv[2]==='verify')await verify();else throw new Error('Use setup/run/cleanup/verify --remote-test');}catch(e){save();console.error(e.message);process.exitCode=1;}
