import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';

const sql = (name) => readFileSync(`supabase/migrations/${name}.sql`, 'utf8');
function loadTs(path, imports) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(path,'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, require: (name) => { assert.ok(name in imports, name); return imports[name]; }, console: { error() {} }, Request, Response });
  return exports;
}
const groupRules = loadTs('src/lib/menu-option-groups.ts', {});

test('new migrations have unique timestamps and explicit transactions', () => {
  const files = readdirSync('supabase/migrations');
  assert.equal(new Set(files.map((f) => f.split('_')[0])).size,files.length);
  for (const f of files.filter((f) => f.startsWith('20260914') || f.startsWith('20260915093000'))) {
    const text = readFileSync(`supabase/migrations/${f}`,'utf8').trim();
    assert.match(text,/^begin;/); assert.match(text,/commit;$/);
  }
});

test('catalog + actual order API + SQL stock transaction regression', async (t) => {
  const db = new PGlite();
  const query = async (text, params=[]) => (await db.query(text,params)).rows;
  const row = async (text, params=[]) => (await query(text,params))[0];
  try {
    await db.exec(readFileSync('tests/fixtures/catalog-baseline.sql','utf8'));
    await db.exec(sql('20260902171000_restore_stock_from_usage_once'));
    await db.exec(sql('20260902170000_create_order_transaction'));
    await db.exec(`insert into ingredient_categories(name,display_order,is_active) values ('เนื้อสัตว์',1,true),('ผัก',2,true),('ข้าวและเส้น',3,true),('ไข่และผลิตภัณฑ์นม',4,true);
      insert into categories(name) values('เดิม');
      insert into ingredients(name,unit,stock_quantity,minimum_stock) values('เนื้อไก่','กรัม',1000,100),('จำลองไม่มีคนใช้','กรัม',20,0);
      insert into menus(name,category_id,price,is_available) values('ข้าวกะเพรา',1,25,true),('ข้าวผัดไก่',1,30,true);
      insert into menu_ingredients values(1,1,150);
      insert into restaurant_tables(table_number,qr_code) values('99','test-only');
      insert into orders(table_id,status,total_amount,stock_deducted) values(1,'completed',25,true);
      insert into order_items(order_id,menu_id,quantity,unit_price,subtotal) select id,1,1,25,25 from orders;
      insert into order_ingredient_usages(order_id,ingredient_id,quantity_used) select id,1,150 from orders;`);
    const oldOrder = await row('select * from orders');
    await db.exec(sql('20260914170000_shared_addons'));
    await db.exec(sql('20260914171000_seed_catalog_redesign'));
    await db.exec(sql('20260915093000_addon_categories'));
    await t.test('backfill separates all categories and retains option IDs and recipes', async () => {
      assert.deepEqual((await query('select name,category from addons order by name')).map((a)=>[a.name,a.category]), [['ทะเล','meat'],['เนื้อ','meat'],['เพิ่มข้าว','portion'],['เพิ่มเนื้อ','portion'],['ไก่','meat'],['ไข่ดาว','topping'],['ไข่เจียว','topping']].sort((a,b)=>a[0]<b[0]?-1:1));
      assert.equal((await row("select count(*)::int n from menu_options o join addons a on a.id=o.addon_id join menu_option_groups g on g.id=o.group_id where a.category<>g.kind")).n,0);
    });
    const menu = await row("select * from menus where catalog_key='rice-basil'");
    const options = await query('select * from effective_menu_options where menu_id=$1',[menu.id]);
    const opt = (name, quantity=1) => ({ optionId: options.find((o) => o.name===name).id, quantity });
    await t.test('seed preserves history, referenced recipes and balances; deletes only unused demos', async () => {
      assert.equal((await row('select count(*)::int n from menus where catalog_key is not null')).n,11);
      assert.equal((await row('select count(*)::int n from addons')).n,7);
      assert.equal((await row('select name from menus where id=1')).name,'ข้าวกะเพรา');
      assert.equal((await row('select stock_quantity from ingredients where id=1')).stock_quantity,'1000');
      assert.equal((await row("select count(*)::int n from ingredients where name='จำลองไม่มีคนใช้'")).n,0);
      assert.deepEqual(await row('select id,status,total_amount from orders where id=$1',[oldOrder.id]), {id:oldOrder.id,status:oldOrder.status,total_amount:oldOrder.total_amount});
      assert.equal((await row('select count(*)::int n from catalog_backup.before_redesign')).n,14);
      const tm = await row("select id from menus where catalog_key='tomyum'");
      assert.deepEqual((await query("select name from effective_menu_options where menu_id=$1 and addon_id is not null and name like 'เพิ่ม%' order by name",[tm.id])).map((r)=>r.name).sort(),['เพิ่มข้าว','เพิ่มเนื้อ'].sort());
    });
    await db.exec("update ingredients set stock_quantity=10000; select set_config('request.jwt.claim.role','service_role',false);");

    // Execute the actual Next route against disposable PostgreSQL via a minimal SDK adapter.
    const sdk = {
      from(table) {
        assert.match(table,/^[a-z_]+$/);
        const filters=[]; const params=[]; let single=false;
        const chain = {
          select() { return chain; },
          eq(key,value) { params.push(value); filters.push(`${key}=$${params.length}`); return chain; },
          in(key,values) { params.push(values); filters.push(`${key}=any($${params.length}::bigint[])`); return chain; },
          maybeSingle() { single=true; return chain; },
          single() { single=true; return chain; },
          then(resolve,reject) { return query(`select * from ${table}${filters.length ? ' where '+filters.join(' and ') : ''}`,params).then((data)=>({data:single ? data[0] ?? null:data,error:null})).then(resolve,reject); },
        }; return chain;
      },
      rpc(name,args) {
        assert.equal(name,'create_order_with_stock');
        return { async single() {
          try { return { data: await row('select * from create_order_with_stock($1,$2,$3,$4,$5,$6,$7)',[args.p_table_id,args.p_session_token,args.p_order_note,args.p_total_amount,JSON.stringify(args.p_items),JSON.stringify(args.p_required_items),args.p_dining_type]),error:null }; }
          catch(e) { return {data:null,error:{code:e.code,message:e.message}}; }
        } };
      },
    };
    const { POST } = loadTs('src/app/api/orders/route.ts',{
      'next/server': { NextResponse: { json: (data,init) => Response.json(data,init) } },
      'node:crypto':{createHash},'@/lib/menu-option-groups':groupRules,'@/lib/supabase/admin':{createAdminClient:()=>sdk},
    });
    const order = async (selections,extra={}) => {
      const response=await POST(new Request('http://local/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tableId:1,sessionToken:randomUUID(),items:[{menuId:menu.id,quantity:1,optionSelections:selections}],...extra})}));
      return { status:response.status, body:await response.json() };
    };
    let created;
    await t.test('beef + fried egg + extra rice: correct authoritative price, recipes, takeaway and stock', async () => {
      created=await order([opt('เนื้อ'),opt('ไข่ดาว'),opt('เพิ่มข้าว')],{diningType:'takeaway'});
      assert.equal(created.status,201,JSON.stringify(created.body));
      const result=await row('select * from orders where id=$1',[created.body.order.id]);
      assert.equal(result.total_amount,'80'); assert.equal(result.status,'confirmed'); assert.equal(result.dining_type,'takeaway');
      const usage=await query('select i.name,u.quantity_used from order_ingredient_usages u join ingredients i on i.id=u.ingredient_id where order_id=$1',[result.id]);
      assert.deepEqual(Object.fromEntries(usage.map((u)=>[u.name,Number(u.quantity_used)])),{'ข้าวสวย':300,'ใบกะเพรา':20,'พริก':10,'กระเทียม':10,'เนื้อวัว':150,'ไข่ไก่':1});
    });
    await t.test('missing/multiple meat, unlinked add-on, duplicates, bad quantity and dining type leave DB unchanged', async () => {
      const before=await row('select count(*)::int n from orders');
      for (const [selections,extra] of [[[],{}],[[opt('ไก่'),opt('ทะเล')],{}],[[opt('ไก่'),opt('ไข่ดาว'),opt('ไข่ดาว')],{}],[[opt('ไก่'),opt('เพิ่มข้าว',4)],{}],[[opt('ไก่')],{diningType:'invalid'}]]) {
        assert.equal((await order(selections,extra)).status,400);
      }
      const another=await row("select o.id from effective_menu_options o join menus m on m.id=o.menu_id where m.catalog_key='garlic' limit 1");
      assert.equal((await order([opt('ไก่'),{optionId:another.id,quantity:1}])).status,400);
      assert.deepEqual(await row('select count(*)::int n from orders'),before);
    });
    await t.test('cancel restores original usage after central recipe edits, exactly once', async () => {
      await db.exec("update addon_ingredients set quantity_required=99 where addon_id=(select id from addons where name='ไข่ดาว')");
      await query('select cancel_order_and_restore_stock($1,$2)',[created.body.order.id,'confirmed']);
      assert.equal((await row("select stock_quantity from ingredients where name='ไข่ไก่'")).stock_quantity,'10000');
      await assert.rejects(query('select cancel_order_and_restore_stock($1,$2)',[created.body.order.id,'confirmed']));
      assert.equal((await row("select stock_quantity from ingredients where name='ไข่ไก่'")).stock_quantity,'10000');
      await db.exec("update addon_ingredients set quantity_required=1 where addon_id=(select id from addons where name='ไข่ดาว')");
    });
    await t.test('chicken and seafood, multiple dishes, kitchen transitions and payment do not deduct twice', async () => {
      for (const meat of ['ไก่','ทะเล']) {
        const r=await order([opt(meat)],{diningType:'dine_in',items:[{menuId:menu.id,quantity:2,optionSelections:[opt(meat)]}]});
        assert.equal(r.status,201,JSON.stringify(r.body));
        const usage=await query('select * from order_ingredient_usages where order_id=$1',[r.body.order.id]);
        const stock=await query('select id,stock_quantity from ingredients order by id');
        await query("update orders set status='preparing' where id=$1",[r.body.order.id]);
        await query("update orders set status='ready' where id=$1",[r.body.order.id]);
        await query("select complete_order_payment($1,'cash')",[r.body.order.id]);
        assert.deepEqual(await query('select id,stock_quantity from ingredients order by id'),stock);
        assert.equal((await row('select status from orders where id=$1',[r.body.order.id])).status,'completed');
        assert.ok(usage.length >= 5);
        if(meat==='ทะเล') assert.equal(usage.filter((u)=>Number(u.quantity_used)===160).length,2);
        await assert.rejects(query("select cancel_order_and_restore_stock($1,'completed')",[r.body.order.id]));
      }
    });
    await t.test('insufficient stock rolls back order, session and partial stock writes', async () => {
      await db.exec("update ingredients set stock_quantity=0 where name='เนื้อวัว'");
      const before=await query('select id,stock_quantity from ingredients order by id');
      const counts=await row('select (select count(*) from orders) orders,(select count(*) from dining_sessions) sessions');
      assert.equal((await order([opt('เนื้อ')])).status,409);
      assert.deepEqual(await query('select id,stock_quantity from ingredients order by id'),before);
      assert.deepEqual(await row('select (select count(*) from orders) orders,(select count(*) from dining_sessions) sessions'),counts);
    });
    await t.test('all eleven recipes support all three meats with correct totals; cancel balances exactly', async () => {
      await db.exec('update ingredients set stock_quantity=10000');
      const before = await query('select id,stock_quantity from ingredients order by id');
      for (const m of await query('select id,price from menus where catalog_key is not null')) {
        for (const name of ['ไก่','เนื้อ','ทะเล']) {
          const o = await row('select id,additional_price from effective_menu_options where menu_id=$1 and name=$2',[m.id,name]);
          const result = await order([],{items:[{menuId:m.id,quantity:1,optionSelections:[{optionId:o.id,quantity:1}]}]});
          assert.equal(result.status,201,JSON.stringify(result.body));
          assert.equal(Number(result.body.order.total_amount),Number(m.price)+Number(o.additional_price));
          await query("select cancel_order_and_restore_stock($1,'confirmed')",[result.body.order.id]);
        }
      }
      assert.deepEqual(await query('select id,stock_quantity from ingredients order by id'),before);
    });
    await t.test('decimal menu and addon prices use integer cents and cannot be forged', async () => {
      await query('update menus set price=50.10 where id=$1',[menu.id]);
      await db.exec("update addons set additional_price=10.20 where name='ไข่ดาว'");
      const result=await order([opt('ไก่'),opt('ไข่ดาว')]);
      assert.equal(result.status,201,JSON.stringify(result.body));
      assert.equal(Number(result.body.order.total_amount),60.30);
      await query("select cancel_order_and_restore_stock($1,'confirmed')",[result.body.order.id]);
      const snapshot = await row('select count(*)::int n from orders');
      await assert.rejects(query('select * from create_order_with_stock($1,$2,null,1,$3,$4)',[1,randomUUID(),JSON.stringify([{menu_id:menu.id,quantity:1,unit_price:1,subtotal:1,options:[{menu_option_id:opt('ไก่').optionId,option_name:'ไก่',additional_price:0,quantity:1}]}]),'[]']));
      assert.deepEqual(await row('select count(*)::int n from orders'),snapshot);
      await query('update menus set price=50 where id=$1',[menu.id]);
      await db.exec("update addons set additional_price=10 where name='ไข่ดาว'");
    });
    await t.test('central addon edits affect multiple menus, snapshots stay unchanged, unchecked links are rejected', async () => {
      await db.exec("select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false); select set_config('request.jwt.claim.role','authenticated',false); set role authenticated;");
      const egg=await row("select id from ingredients where name='ไข่ไก่'");
      const a=await row('select save_addon(null,$1,10,true,3,$2,$$topping$$) id',['ไข่ต้ม',JSON.stringify([{ingredient_id:egg.id,quantity_required:1}])]);
      const oldMenu=await row('select name,price from menus where id=$1',[menu.id]);
      await assert.rejects(query('select save_menu_with_addons($1,$2,$3)',[menu.id,JSON.stringify({name:'must rollback',price:999,category_id:1,is_available:true}),[9999999]]));
      assert.deepEqual(await row('select name,price from menus where id=$1',[menu.id]),oldMenu);
      await query('select set_menu_addons($1,$2)',[menu.id,[a.id]]);
      const other=await row("select id from menus where catalog_key='garlic'");
      await query('select set_menu_addons($1,$2)',[other.id,[a.id]]);
      await query('select save_addon($1,$2,15,true,3,$3,$$topping$$)',[a.id,'ไข่ต้ม',JSON.stringify([{ingredient_id:egg.id,quantity_required:2}])]);
      assert.equal((await row('select count(*)::int n from effective_menu_options where addon_id=$1 and additional_price=15',[a.id])).n,2);
      await db.exec("reset role; select set_config('request.jwt.claim.role','service_role',false);");
      assert.equal((await order([opt('ไก่'),opt('ไข่ดาว')])).status,400);
      assert.equal((await row('select additional_price from order_item_options where option_name=$1 limit 1',['ไข่ดาว'])).additional_price,'10');
    });
    await t.test('disabled links remain selected but cannot be newly assigned; category changes regroup existing links', async () => {
      await db.exec("select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false); select set_config('request.jwt.claim.role','authenticated',false); set role authenticated;");
      const a=await row("select id from addons where name='ไข่ต้ม'");
      await query('update addons set is_available=false where id=$1',[a.id]);
      await query('select set_menu_addons($1,$2)',[menu.id,[a.id]]);
      const other=await row("select id from menus where catalog_key='rice-chilli'");
      await assert.rejects(query('select set_menu_addons($1,$2)',[other.id,[a.id]]),/ADDON_DISABLED/);
      const egg=await row("select id from ingredients where name='ไข่ไก่'");
      await query("select save_addon($1,'ไข่ต้ม',15,false,3,$2,'portion')",[a.id,JSON.stringify([{ingredient_id:egg.id,quantity_required:2}])]);
      assert.equal((await row('select g.kind from menu_options o join menu_option_groups g on g.id=o.group_id where o.menu_id=$1 and o.addon_id=$2',[menu.id,a.id])).kind,'portion');
      await db.exec('reset role');
    });
    await t.test('anon cannot read central data or call privileged RPC; FK protects addon ingredients', async () => {
      await db.exec("select set_config('request.jwt.claim.sub','',false); select set_config('request.jwt.claim.role','anon',false); set role anon;");
      await assert.rejects(query('select * from addons'));
      await assert.rejects(query('select set_menu_addons(1,array[]::bigint[])'));
      await assert.rejects(query("select * from create_order_with_stock(1,gen_random_uuid(),null,0,'[]','[]','takeaway')"));
      await db.exec('reset role');
      await assert.rejects(query("delete from ingredients where name='ไข่ไก่'"));
    });
  } finally { await db.close(); }
});
