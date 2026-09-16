// Explicit integration test; only uniquely registered TEST rows may be changed.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
assert.ok(process.argv.includes('--remote-test'),'Requires --remote-test');
process.loadEnvFile('.env.local');
const runName=process.env.CATALOG_BROWSER_RUN ?? 'catalog-redesign-browser';
assert.match(runName,/^[a-zA-Z0-9_-]+$/);
const root=`.test-artifacts/${runName}`; mkdirSync(root,{recursive:true});
const file=`${root}/registry.json`;
const s=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{prefix:`TEST_REDESIGN_${Date.now()}`,menus:[],ingredients:[],addons:[],checks:[]};
const save=()=>writeFileSync(file,JSON.stringify(s,null,2));
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const data=async(q)=>{const r=await q;if(r.error)throw new Error(`${r.error.code}: ${r.error.message}`);return r.data;};
const check=(name)=>{s.checks.push(name);save();console.log(`PASS ${name}`);};
async function fingerprint(){
  const result={};
  for(const table of ['menus','ingredients','menu_ingredients','menu_options','menu_option_groups','menu_option_ingredients','addons','addon_ingredients','orders','order_items','order_item_options','order_ingredient_usages','restaurant_tables','dining_sessions','profiles','categories','ingredient_categories','payments','reviews']){
    const rows=[];for(let offset=0;;offset+=1000){
      let q=db.from(table).select('*');
      if(table==='menu_ingredients')q=q.order('menu_id').order('ingredient_id');
      else if(table==='addon_ingredients')q=q.order('addon_id').order('ingredient_id');
      else q=q.order('id');
      const batch=await data(q.range(offset,offset+999));rows.push(...batch);if(batch.length<1000)break;
    }
    result[table]={count:rows.length,hash:createHash('sha256').update(JSON.stringify(rows)).digest('hex')};
  }return result;
}
async function setup(){
  assert.ok(!s.before,'Existing registry: run or cleanup, never overwrite');
  s.before=await fingerprint();s.email=`${s.prefix.toLowerCase()}@example.invalid`;s.password=randomBytes(24).toString('base64url');save();
  const user=await db.auth.admin.createUser({email:s.email,password:s.password,email_confirm:true});assert.ifError(user.error);s.userId=user.data.user.id;save();
  s.table=await data(db.from('restaurant_tables').insert({table_number:String(800000+Math.floor(Math.random()*90000)),qr_code:s.prefix,status:'available'}).select().single());save();
  const source=await data(db.from('menus').select('*').eq('catalog_key','rice-basil').single());
  const base=await data(db.from('menu_ingredients').select('*').eq('menu_id',source.id));
  const sourceOptions=await data(db.from('effective_menu_options').select('*').eq('menu_id',source.id).is('addon_id',null));
  const recipes=await data(db.from('effective_menu_option_ingredients').select('*').in('menu_option_id',sourceOptions.map(o=>o.id)));
  const ingredientIds=[...new Set([...base,...recipes].map(r=>r.ingredient_id))];
  const egg=await data(db.from('ingredients').select('*').eq('name','ไข่ไก่').single());ingredientIds.push(egg.id);
  const sourceIngredients=await data(db.from('ingredients').select('*').in('id',ingredientIds));
  s.ingredientMap={};
  for(const i of sourceIngredients){const created=await data(db.from('ingredients').insert({name:`${s.prefix}_${i.name}`,unit:i.unit,stock_quantity:10000,minimum_stock:0,category_id:i.category_id}).select().single());s.ingredients.push(created);s.ingredientMap[i.id]=created.id;save();}
  for(const suffix of ['A','B']){
    const menu=await data(db.from('menus').insert({name:`${s.prefix}_${suffix}`,price:50,is_available:true,category_id:source.category_id}).select().single());s.menus.push(menu);save();
    await data(db.from('menu_ingredients').insert(base.map(r=>({menu_id:menu.id,ingredient_id:s.ingredientMap[r.ingredient_id],quantity_required:r.quantity_required}))));
    const group=await data(db.from('menu_option_groups').insert({menu_id:menu.id,name:'ตัวเลือกเนื้อสัตว์',kind:'meat',selection_type:'single',is_required:true,min_select:1,max_select:1,max_total_quantity:1,is_active:true}).select().single());
    for(const o of sourceOptions){const option=await data(db.from('menu_options').insert({menu_id:menu.id,group_id:group.id,name:o.name,additional_price:o.additional_price,max_quantity:1,is_available:true}).select().single());await data(db.from('menu_option_ingredients').insert(recipes.filter(r=>r.menu_option_id===o.id).map(r=>({menu_option_id:option.id,ingredient_id:s.ingredientMap[r.ingredient_id],quantity_required:r.quantity_required}))));}
  }check('isolated menu/protein/stock fixtures registered');
}
async function run(){
  assert.ok(s.table&&!s.cleaned);
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1000}});const page=await context.newPage();page.setDefaultTimeout(20000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const base='http://localhost:3000';
  const ingredient=(name)=>s.ingredients.find(i=>i.name===`${s.prefix}_${name}`);
  const stock=async()=>Object.fromEntries((await data(db.from('ingredients').select('id,stock_quantity').in('id',s.ingredients.map(i=>i.id)))).map(i=>[i.id,Number(i.stock_quantity)]));
  try{
    await page.goto(`${base}/login`);await page.getByLabel('อีเมล',{exact:true}).fill(s.email);await page.getByLabel('รหัสผ่าน',{exact:true}).fill(s.password);await page.getByRole('button',{name:'เข้าสู่ระบบ',exact:true}).click();await page.waitForURL('**/dashboard');
    await page.goto(`${base}/dashboard/menus/${s.menus[0].id}/edit`);
    for(const [name,ing,qty] of [['ไข่ดาว','ไข่ไก่',1],['เพิ่มข้าว','ข้าวสวย',100]]){
      await page.getByRole('button',{name:'+ เพิ่มตัวเลือกเสริม',exact:true}).click();const dialog=page.getByRole('dialog');
      await dialog.locator('input[name="name"]').fill(`${s.prefix}_${name}`);
      await dialog.getByRole('button',{name:'+ เพิ่มวัตถุดิบในสูตร',exact:true}).click();
      await dialog.getByRole('combobox',{name:'วัตถุดิบ',exact:true}).selectOption(String(ingredient(ing).id));
      await dialog.getByRole('spinbutton',{name:'ปริมาณ',exact:true}).fill(String(qty));
      await dialog.getByRole('button',{name:'บันทึกตัวเลือกเสริม',exact:true}).click();await dialog.waitFor({state:'hidden'});
      const a=await data(db.from('addons').select('*').eq('name',`${s.prefix}_${name}`).single());s.addons.push(a);save();
      assert.equal(await page.getByRole('checkbox',{name:new RegExp(`${s.prefix}_${name}`)}).isChecked(),true);
    }
    await page.getByRole('button',{name:'บันทึกข้อมูลเมนู',exact:true}).click();await page.waitForURL('**/edit?tab=info&success=**');check('create shared addons in menu modal and save checkbox links');
    await page.goto(`${base}/dashboard/menus/${s.menus[1].id}/edit`);
    await page.getByRole('checkbox',{name:new RegExp(`${s.prefix}_ไข่ดาว`)}).check();await page.getByRole('button',{name:'บันทึกข้อมูลเมนู',exact:true}).click();await page.waitForURL('**/edit?tab=info&success=**');
    assert.equal((await data(db.from('menu_options').select('*').eq('addon_id',s.addons[0].id).eq('is_available',true))).length,2);check('same central addon reused by a second menu');
    // New-menu screen must also save links in the same RPC transaction.
    await page.goto(`${base}/dashboard/menus/new`);await page.locator('input[name="name"]').fill(`${s.prefix}_NEW`);await page.locator('select[name="category_id"]').selectOption(String(s.menus[0].category_id));await page.locator('input[name="price"]').fill('50');await page.getByRole('checkbox',{name:new RegExp(`${s.prefix}_ไข่ดาว`)}).check();
    await page.getByRole('button',{name:'บันทึกเมนูอาหาร',exact:true}).click();await page.waitForURL('**/edit?tab=recipe&success=**');const newId=Number(page.url().match(/menus\/(\d+)\/edit/)[1]);s.menus.push({id:newId,name:`${s.prefix}_NEW`});save();
    assert.equal((await data(db.from('menu_options').select('id').eq('menu_id',newId).eq('addon_id',s.addons[0].id))).length,1);check('new-menu form persists central addon selection');

    await page.goto(`${base}/table/${s.table.table_number}`);
    await page.locator('article').filter({has:page.getByRole('heading',{name:s.menus[0].name,exact:true})}).getByRole('button',{name:'เพิ่ม',exact:true}).click();
    await page.getByRole('radio',{name:/^เนื้อ/}).check();await page.getByRole('checkbox',{name:new RegExp(`${s.prefix}_ไข่ดาว`)}).check();await page.getByRole('checkbox',{name:new RegExp(`${s.prefix}_เพิ่มข้าว`)}).check();
    await page.getByRole('button',{name:/^เพิ่มลงตะกร้า/}).click();await page.getByRole('button',{name:'ดูตะกร้า',exact:true}).click();await page.getByRole('radio',{name:'กลับบ้าน',exact:true}).check();
    const responsePromise=page.waitForResponse(r=>r.url().endsWith('/api/orders')&&r.request().method()==='POST');await page.getByRole('button',{name:'ยืนยันการสั่งอาหาร',exact:true}).click();const response=await responsePromise;assert.equal(response.status(),201,await response.text());s.firstOrder=(await response.json()).order;save();await page.waitForURL('**/orders');await page.getByText('กลับบ้าน (Takeaway)',{exact:true}).waitFor();
    let first=await data(db.from('orders').select('*').eq('id',s.firstOrder.id).single());assert.equal(Number(first.total_amount),80);assert.equal(first.dining_type,'takeaway');
    const usage=await data(db.from('order_ingredient_usages').select('*').eq('order_id',first.id));const quantities=Object.fromEntries(usage.map(u=>[s.ingredients.find(i=>i.id===u.ingredient_id).name.replace(`${s.prefix}_`,''),Number(u.quantity_used)]));assert.deepEqual(quantities,{'ข้าวสวย':300,'ใบกะเพรา':20,'พริก':10,'กระเทียม':10,'เนื้อวัว':150,'ไข่ไก่':1});check('browser meat + addons + takeaway order has exact price and six ingredient usages');
    const deducted=await stock();
    await page.goto(`${base}/dashboard/kitchen`);let card=page.locator('article').filter({hasText:`ออเดอร์ #${first.order_number}`});await card.getByRole('heading',{name:'กลับบ้าน (Takeaway)',exact:true}).waitFor();await card.getByRole('button',{name:'เริ่มทำอาหาร',exact:true}).click();await card.getByRole('button',{name:'อาหารพร้อมเสิร์ฟ',exact:true}).click();
    await page.goto(`${base}/dashboard/orders`);card=page.locator('article').filter({hasText:`ออเดอร์ #${first.order_number}`});await card.getByRole('button',{name:'รับชำระเงิน',exact:true}).click();await card.getByRole('button',{name:'เงินสด',exact:true}).click();
    await page.waitForTimeout(700);first=await data(db.from('orders').select('*').eq('id',first.id).single());assert.equal(first.status,'completed');assert.deepEqual(await stock(),deducted);check('Kitchen to ready to payment completes order without a second deduction');
    await page.goto(`${base}/dashboard/addons`);const detail=page.locator('details').filter({has:page.locator('summary').filter({hasText:`${s.prefix}_ไข่ดาว`})});await detail.locator('summary').click();await detail.locator('input[name="price"]').fill('15');await detail.getByRole('button',{name:'บันทึกตัวเลือกเสริม',exact:true}).click();await detail.getByRole('status').filter({hasText:'บันทึกตัวเลือกเสริมกลางแล้ว'}).waitFor();
    assert.equal((await data(db.from('effective_menu_options').select('id').eq('addon_id',s.addons[0].id).eq('additional_price',15))).length,3);
    assert.equal(Number((await data(db.from('order_item_options').select('additional_price').eq('option_name',s.addons[0].name).single())).additional_price),10);check('central price edit updates all three links and preserves paid order snapshot');
    const opts=await data(db.from('effective_menu_options').select('*').eq('menu_id',s.menus[0].id));const select=(name,quantity=1)=>({optionId:opts.find(o=>o.name===name).id,quantity});
    for(const meat of ['ไก่','ทะเล']){
      const before=await stock();const r=await context.request.post(`${base}/api/orders`,{data:{tableId:s.table.id,sessionToken:randomUUID(),diningType:'dine_in',items:[{menuId:s.menus[0].id,quantity:2,optionSelections:[select(meat),select(s.addons[0].name)]}]}});assert.equal(r.status(),201,await r.text());const id=(await r.json()).order.id;
      const cancelled=await context.request.post(`${base}/api/orders/${id}/cancel`,{data:{currentStatus:'confirmed'}});assert.equal(cancelled.status(),200);assert.deepEqual(await stock(),before);assert.equal((await context.request.post(`${base}/api/orders/${id}/cancel`,{data:{currentStatus:'confirmed'}})).status(),409);
    }check('chicken/seafood multi-quantity dine-in orders cancel and restore stock once');
    for(const route of ['/dashboard','/dashboard/reports','/dashboard/ingredients','/dashboard/tables']){await page.goto(base+route);assert.equal(await page.locator('nextjs-portal [data-nextjs-dialog-overlay]').count(),0);}
    await page.screenshot({path:`${root}/tables.png`});assert.deepEqual(errors,[]);check('Dashboard Reports Ingredients and Tables render without browser errors');
  }catch(e){s.failure={message:e.message,url:page.url()};save();await page.screenshot({path:`${root}/failure.png`});throw e;}finally{await browser.close();}
}
async function cleanup(){
  assert.ok(s.before&&s.prefix.startsWith('TEST_REDESIGN_')&&!s.cleaned);
  // Discover crash-created fixtures only under this run's unpredictable prefix.
  const menus=await data(db.from('menus').select('id,name').like('name',`${s.prefix}%`));
  if(s.table){const table=await data(db.from('restaurant_tables').select('*').eq('id',s.table.id).single());assert.equal(table.qr_code,s.prefix);
    const orders=await data(db.from('orders').select('*').eq('table_id',s.table.id));
    for(const o of orders){const items=await data(db.from('order_items').select('menu_id,menu_id_snapshot').eq('order_id',o.id));assert.ok(items.every(i=>s.menus.some(m=>m.id===(i.menu_id_snapshot ?? i.menu_id))));
      if(o.stock_deducted&&['pending','confirmed','preparing'].includes(o.status))await data(db.rpc('cancel_order_and_restore_stock',{p_order_id:o.id,p_current_status:o.status}));
      // Only ephemeral TEST orders are removed; all pre-test rows are fingerprinted below.
      await data(db.from('orders').delete().eq('id',o.id).eq('table_id',s.table.id));
    }
    await data(db.from('dining_sessions').delete().eq('table_id',s.table.id));await data(db.from('restaurant_tables').delete().eq('id',s.table.id).eq('qr_code',s.prefix));
  }
  for(const m of menus)await data(db.from('menus').delete().eq('id',m.id).eq('name',m.name));
  const addons=await data(db.from('addons').select('id,name').like('name',`${s.prefix}%`));
  for(const a of addons){await data(db.from('addon_ingredients').delete().eq('addon_id',a.id));await data(db.from('addons').delete().eq('id',a.id).eq('name',a.name));}
  for(const i of s.ingredients)await data(db.from('ingredients').delete().eq('id',i.id).eq('name',i.name));
  if(s.userId){const u=await db.auth.admin.getUserById(s.userId);assert.equal(u.data.user.email,s.email);const r=await db.auth.admin.deleteUser(s.userId);assert.ifError(r.error);}
  s.after=await fingerprint();assert.deepEqual(s.after,s.before,'PRE-EXISTING DATA CHANGED');s.cleaned=true;delete s.password;save();check('cleanup: all 19 pre-test table fingerprints unchanged');
}
async function verify(){
  assert.equal(s.cleaned,true,'Cleanup registry must be complete');
  assert.deepEqual(await fingerprint(),s.after,'CURRENT DATA DIFFERS FROM POST-CLEANUP FINGERPRINT');
  console.log('PASS current fingerprints match post-cleanup snapshots for all 19 tables');
  const leftovers={};
  for(const [table,column] of [['menus','name'],['ingredients','name'],['addons','name'],['menu_options','name'],['menu_option_groups','name'],['categories','name'],['ingredient_categories','name'],['restaurant_tables','qr_code'],['orders','note'],['profiles','full_name']]){
    const rows=await data(db.from(table).select(column).ilike(column,'TEST%'));
    leftovers[table]=rows.length;
  }
  let testUsers=0;
  for(let page=1;;page++){
    const result=await db.auth.admin.listUsers({page,perPage:100});assert.ifError(result.error);
    testUsers+=result.data.users.filter(u=>/^test[_-]/i.test(u.email??'')).length;
    if(result.data.users.length<100)break;
  }
  leftovers.auth_users=testUsers;
  assert.ok(Object.values(leftovers).every(n=>n===0),`TEST rows remain: ${JSON.stringify(leftovers)}`);
  console.log('PASS no TEST-prefixed catalog, order, table, profile or authentication records remain');
}
export { s,save,db,data,check,setup,cleanup,verify,fingerprint,root };
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  try{if(process.argv[2]==='setup')await setup();else if(process.argv[2]==='run')await run();else if(process.argv[2]==='cleanup')await cleanup();else if(process.argv[2]==='verify')await verify();else throw new Error('Use setup/run/cleanup/verify --remote-test');}catch(e){if(process.argv[2]!=='verify')save();console.error(e.message);process.exitCode=1;}
}
