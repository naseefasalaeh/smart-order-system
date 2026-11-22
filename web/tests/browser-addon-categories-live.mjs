import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {chromium} from 'playwright';
process.env.CATALOG_BROWSER_RUN='addon-categories-live';
const {s,save,db,data,check,cleanup,verify,fingerprint,root}=await import('./browser-catalog-redesign.mjs');
const base='http://localhost:3101';
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
async function run(){
 assert.ok(s.table&&!s.cleaned);const browser=await chromium.launch({channel:'msedge',headless:true});const ctx=await browser.newContext();const page=await ctx.newPage();page.setDefaultTimeout(20000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const stock=async()=>await data(db.from('ingredients').select('id,stock_quantity').in('id',s.ingredients.map(i=>i.id)).order('id'));
 const editMenu=async(m,ids,required)=>{
 await page.goto(`${base}/dashboard/menus/${m.id}/edit`);
 for(const a of s.addons)await page.locator(`input[name="addon_ids"][value="${a.id}"]`).setChecked(ids.includes(a.id));
 await page.locator('input[name="meat_required"]').setChecked(required);
 await page.getByRole('button',{name:'บันทึกข้อมูลเมนู',exact:true}).click();await page.waitForURL('**/edit?tab=info&success=**');
 };
 const editAddon=async(a,available,price)=>{
 await page.goto(`${base}/dashboard/addons?q=${encodeURIComponent(a.name)}`);const detail=page.locator('details').filter({has:page.locator('summary').filter({hasText:a.name})});await detail.locator('summary').click();await detail.locator('input[name="price"]').fill(String(price));await detail.locator('input[name="is_available"]').setChecked(available);await detail.getByRole('button',{name:'บันทึกตัวเลือกเสริม',exact:true}).click();await detail.getByRole('status').filter({hasText:'บันทึกตัวเลือกเสริมกลางแล้ว'}).waitFor();
 };
 let options=await data(db.from('effective_menu_options').select('*').eq('menu_id',s.menus[0].id));const option=i=>options.find(o=>o.addon_id===s.addons[i].id);
 const request=async(m,selections)=>ctx.request.post(`${base}/api/orders`,{data:{tableId:s.table.id,sessionToken:randomUUID(),items:[{menuId:m.id,quantity:1,optionSelections:selections}]}});
 try{
 await page.goto(`${base}/login`);await page.getByLabel('อีเมล',{exact:true}).fill(s.email);await page.getByLabel('รหัสผ่าน',{exact:true}).fill(s.password);await page.getByRole('button',{name:'เข้าสู่ระบบ',exact:true}).click();await page.waitForURL('**/dashboard');
 if (!s.firstOrder) {
 for(const [c,label]of [['meat','ตัวเลือกเนื้อสัตว์'],['topping','ไข่และท็อปปิ้ง'],['portion','เพิ่มปริมาณ']]){
 await page.goto(`${base}/dashboard/addons`);await page.getByRole('textbox',{name:'ค้นหา',exact:true}).fill(s.prefix);await page.getByRole('combobox',{name:'ประเภท',exact:true}).selectOption(c);await page.getByRole('button',{name:'ค้นหา / กรอง',exact:true}).click();await page.waitForURL(u=>u.searchParams.get('category')===c);await page.getByRole('heading',{name:label,exact:true}).waitFor();assert.equal(await page.locator('section').count(),1);assert.equal(await page.locator('section details').count(),c==='meat'?2:1);
 }check('Admin live search and each category filter');
 await editMenu(s.menus[0],s.addons.map(a=>a.id),true);await editMenu(s.menus[1],[s.addons[0].id],false);
 await editAddon(s.addons[2],false,12);
 await page.goto(`${base}/dashboard/menus/${s.menus[0].id}/edit`);assert.ok(await page.locator(`input[value="${s.addons[2].id}"][name="addon_ids"]`).isChecked());
 await page.getByRole('button',{name:'บันทึกข้อมูลเมนู',exact:true}).click();await page.waitForURL('**/edit?tab=info&success=**');
 await page.goto(`${base}/dashboard/menus/${s.menus[1].id}/edit`);assert.ok(await page.locator(`input[value="${s.addons[2].id}"][name="addon_ids"]`).isDisabled());
 await page.goto(`${base}/dashboard/addons?q=${encodeURIComponent(s.prefix)}&status=inactive`);assert.equal(await page.locator('section details').count(),1);
 await editAddon(s.addons[2],true,10);check('Admin edits price and availability; disabled existing link retained and disabled new selection blocked');
 options=await data(db.from('effective_menu_options').select('*').eq('menu_id',s.menus[0].id));
 const stockBefore=await stock();assert.equal((await request(s.menus[0],[])).status(),400);assert.equal((await request(s.menus[0],[{optionId:option(0).id,quantity:1},{optionId:option(1).id,quantity:1}])).status(),400);assert.deepEqual(await stock(),stockBefore);
 await page.goto(`${base}/table/${s.table.table_number}`);await page.locator('article').filter({has:page.getByRole('heading',{name:s.menus[0].name,exact:true})}).getByRole('button',{name:'เพิ่ม',exact:true}).click();
 for(const label of ['ตัวเลือกเนื้อสัตว์','ไข่และท็อปปิ้ง','เพิ่มปริมาณ'])await page.getByText(label,{exact:true}).waitFor();
 assert.equal(await page.getByRole('radio',{name:new RegExp(s.prefix)}).count(),2);
 await page.getByRole('button',{name:/^เพิ่มลงตะกร้า/}).click();assert.equal(await page.getByRole('radio',{name:new RegExp(s.addons[1].name)}).count(),1);
 await page.getByRole('radio',{name:new RegExp(s.addons[1].name)}).check();await page.getByRole('checkbox',{name:new RegExp(s.addons[2].name)}).check();await page.getByRole('checkbox',{name:new RegExp(s.addons[3].name)}).check();await page.getByRole('button',{name:/^เพิ่มลงตะกร้า/}).click();await page.getByRole('button',{name:'ดูตะกร้า',exact:true}).click();
 const responsePromise=page.waitForResponse(r=>r.url().endsWith('/api/orders')&&r.request().method()==='POST');await page.getByRole('button',{name:'ยืนยันการสั่งอาหาร',exact:true}).click();const response=await responsePromise;assert.equal(response.status(),201,await response.text());s.firstOrder=(await response.json()).order;save();assert.equal(Number(s.firstOrder.total_amount),85);await page.waitForURL('**/orders');
 const usage=await data(db.from('order_ingredient_usages').select('*').eq('order_id',s.firstOrder.id));assert.deepEqual(Object.fromEntries(usage.map(u=>[u.ingredient_id,Number(u.quantity_used)])),{[s.ingredients[0].id]:150,[s.ingredients[2].id]:1,[s.ingredients[3].id]:30,[s.ingredients[4].id]:30});
 const deducted=await stock();for(const i of deducted)assert.equal(Number(i.stock_quantity),10000-(usage.find(u=>u.ingredient_id===i.id)?.quantity_used??0));
 check('Customer live required meat radio and two separate checkbox groups; order 85 baht and exact stock deduction');
 }
 const deducted=await stock();
 await page.goto(`${base}/dashboard/kitchen`);let card=page.locator('article').filter({hasText:`ออเดอร์ #${s.firstOrder.order_number}`});await card.getByText(s.menus[0].name,{exact:false}).waitFor();await card.getByRole('button',{name:'เริ่มทำอาหาร',exact:true}).click();await card.getByRole('button',{name:'อาหารพร้อมเสิร์ฟ',exact:true}).click();
 await page.goto(`${base}/dashboard/orders`);card=page.locator('article').filter({hasText:`ออเดอร์ #${s.firstOrder.order_number}`});await card.getByRole('button',{name:'รับชำระเงิน',exact:true}).click();await card.getByRole('button',{name:'เงินสด',exact:true}).click();await page.waitForTimeout(500);assert.equal((await data(db.from('orders').select('status').eq('id',s.firstOrder.id).single())).status,'completed');assert.deepEqual(await stock(),deducted);check('Orders and Kitchen render and complete payment without double stock deduction');
 await editAddon(s.addons[2],true,12);
 const orderItems=await data(db.from('order_items').select('id').eq('order_id',s.firstOrder.id));
 const snapshots=await data(db.from('order_item_options').select('*').in('order_item_id',orderItems.map(i=>i.id)));assert.equal(Number(snapshots.find(o=>o.option_name===s.addons[2].name).additional_price),10);
 const beforeCancel=await stock();const r=await request(s.menus[0],[{optionId:option(0).id,quantity:1},{optionId:option(2).id,quantity:2}]);assert.equal(r.status(),201,await r.text());const created=(await r.json()).order;assert.equal(Number(created.total_amount),84);
 const cancel=await ctx.request.post(`${base}/api/orders/${created.id}/cancel`,{data:{currentStatus:'confirmed'}});assert.equal(cancel.status(),200,await cancel.text());assert.deepEqual(await stock(),beforeCancel);
 assert.equal((await ctx.request.post(`${base}/api/orders/${created.id}/cancel`,{data:{currentStatus:'confirmed'}})).status(),409);assert.deepEqual(await stock(),beforeCancel);
 const optional=await request(s.menus[1],[]);assert.equal(optional.status(),201,await optional.text());const optionalOrder=(await optional.json()).order;assert.equal((await ctx.request.post(`${base}/api/orders/${optionalOrder.id}/cancel`,{data:{currentStatus:'confirmed'}})).status(),200);
 assert.deepEqual(await stock(),beforeCancel);check('new prices and multi-quantity recipes calculated; paid snapshots retained; cancel restores exact stock once; optional meat accepts no selection');
 assert.deepEqual(errors,[]);await page.screenshot({path:`${root}/completed.png`});check('Browser run complete without page errors');
 }catch(e){s.failure={message:e.message,url:page.url()};save();await page.screenshot({path:`${root}/failure.png`});throw e;}finally{await browser.close();}
}
async function createMenuTest(){
 const browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage();page.setDefaultTimeout(20000);
 try {
 await page.goto(`${base}/login`);await page.getByLabel('อีเมล',{exact:true}).fill(s.email);await page.getByLabel('รหัสผ่าน',{exact:true}).fill(s.password);await page.getByRole('button',{name:'เข้าสู่ระบบ',exact:true}).click();await page.waitForURL('**/dashboard');
 await page.goto(`${base}/dashboard/menus/new`);await page.locator('input[name="name"]').fill(`${s.prefix}_NEW`);await page.locator('input[name="price"]').fill('50');await page.locator('select[name="category_id"]').selectOption(String(s.menus[0].category_id));
 for(const a of s.addons)await page.locator(`input[name="addon_ids"][value="${a.id}"]`).check();await page.locator('input[name="meat_required"]').check();
 await page.getByRole('button',{name:'+ เพิ่มตัวเลือกเสริม',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.locator('input[name="name"]').fill(`${s.prefix}_ไข่ต้ม`);await dialog.locator('select[name="category"]').selectOption('topping');await dialog.getByRole('button',{name:'+ เพิ่มวัตถุดิบในสูตร',exact:true}).click();await dialog.locator('select[name="ingredient_id"]').selectOption(String(s.ingredients[2].id));await dialog.locator('input[name="quantity_required"]').fill('1');await dialog.getByRole('button',{name:'บันทึกตัวเลือกเสริม',exact:true}).click();await dialog.waitFor({state:'hidden'});
 const addon=await data(db.from('addons').select('*').eq('name',`${s.prefix}_ไข่ต้ม`).single());s.addons.push(addon);save();assert.equal(addon.category,'topping');assert.ok(await page.locator(`input[name="addon_ids"][value="${addon.id}"]`).isChecked());
 await page.getByRole('button',{name:'บันทึกเมนูอาหาร',exact:true}).click();await page.waitForURL('**/edit?tab=recipe&success=**');const id=Number(page.url().match(/menus\/(\d+)\/edit/)[1]);const menu=await data(db.from('menus').select('*').eq('id',id).single());s.menus.push(menu);save();
 assert.equal((await data(db.from('menu_options').select('id').eq('menu_id',id).eq('is_available',true))).length,5);const groups=await data(db.from('menu_option_groups').select('*').eq('menu_id',id));assert.ok(groups.find(g=>g.kind==='meat').is_required);assert.deepEqual(groups.map(g=>g.kind).sort(),['meat','portion','topping']);check('new-menu form and inline Add-on creation save all category links and required meat atomically');
 }catch(e){await page.screenshot({path:`${root}/new-menu-failure.png`});throw e;}finally{await browser.close();}
}
try{if(process.argv[2]==='setup')await setup();else if(process.argv[2]==='run')await run();else if(process.argv[2]==='create-menu')await createMenuTest();else if(process.argv[2]==='cleanup')await cleanup();else if(process.argv[2]==='verify')await verify();else throw Error('setup/run/cleanup/verify --remote-test');}catch(e){save();console.error(e.message);process.exitCode=1;}
