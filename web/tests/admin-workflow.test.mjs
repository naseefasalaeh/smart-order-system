import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const migration = (name) => readFileSync(`supabase/migrations/${name}.sql`, 'utf8');
const adminId = '00000000-0000-4000-8000-000000000091';
const staffId = '00000000-0000-4000-8000-000000000092';
const kitchenId = '00000000-0000-4000-8000-000000000093';

test('admin workflow migrations preserve history and enforce roles, transitions and atomic creation', async (t) => {
  const db = new PGlite();
  const query = async (sql, params = []) => (await db.query(sql, params)).rows;
  const one = async (sql, params = []) => (await query(sql, params))[0];
  const as = async (role, id = '') => {
    await db.exec('reset role');
    await query("select set_config('request.jwt.claim.role',$1,false),set_config('request.jwt.claim.sub',$2,false)", [role, id]);
    if (role === 'authenticated' || role === 'anon') await db.exec(`set role ${role}`);
  };
  try {
    await db.exec(readFileSync('tests/fixtures/catalog-baseline.sql','utf8'));
    await db.exec("create table profiles(id uuid primary key, role text not null check(role in ('admin','staff')), full_name text); alter table profiles enable row level security; grant select on profiles to authenticated;");
    await query("insert into profiles(id,role) values($1,'admin'),($2,'staff')",[adminId,staffId]);
    await db.exec(migration('20260902171000_restore_stock_from_usage_once'));
    await db.exec(migration('20260902170000_create_order_transaction'));
    await db.exec(`insert into ingredient_categories(name,display_order,is_active) values ('เนื้อสัตว์',1,true),('ผัก',2,true),('ข้าวและเส้น',3,true),('ไข่และผลิตภัณฑ์นม',4,true);
      insert into categories(name) values('เดิม');
      insert into ingredients(name,unit,stock_quantity,minimum_stock) values('เนื้อไก่','กรัม',1000,100),('จำลองไม่มีคนใช้','กรัม',20,0);
      insert into menus(name,category_id,price,is_available) values('ข้าวกะเพรา',1,25,true),('ข้าวผัดไก่',1,30,true);
      insert into menu_ingredients values(1,1,150);
      insert into restaurant_tables(table_number,qr_code) values('99','test-only');
      insert into orders(table_id,status,total_amount,stock_deducted) values(1,'completed',25,true);
      insert into order_items(order_id,menu_id,quantity,unit_price,subtotal) select id,1,1,25,25 from orders;
      insert into order_ingredient_usages(order_id,ingredient_id,quantity_used) select id,1,150 from orders;`);
    await db.exec(migration('20260914170000_shared_addons'));
    await db.exec(migration('20260914171000_seed_catalog_redesign'));
    await db.exec(migration('20260915010000_admin_hard_delete_snapshots'));
    await db.exec(migration('20260915093000_addon_categories'));
    await db.exec(migration('20260915123000_order_stock_guards'));
    const historical = await one('select * from orders order by order_number limit 1');
    for (const name of ['20260916160000_order_workflow_permissions','20260916161000_admin_catalog_tables','20260916162000_complete_menu_creation','20260916163000_addon_order','20260917120000_standardize_shop_roles','20260917121000_read_own_profile']) {
      const sql = migration(name).trim();
      assert.match(sql,/^begin;/); assert.match(sql,/commit;$/);
      await db.exec(sql);
    }
    await query("insert into profiles(id,role) values($1,'kitchen_staff')",[kitchenId]);
    await assert.rejects(query("insert into profiles(id,role) values('00000000-0000-4000-8000-000000000094','kitchen')"));
    await assert.rejects(query("insert into profiles(id,role) values('00000000-0000-4000-8000-000000000095','owner')"));
    assert.equal(new Set(readdirSync('supabase/migrations').map((f) => f.slice(0,14))).size,readdirSync('supabase/migrations').length);
    await t.test('old order and usage stay unchanged; old QR alias resolves after rename', async () => {
      assert.deepEqual(await one('select * from orders where id=$1',[historical.id]),historical);
      assert.equal((await one('select count(*)::int n from order_ingredient_usages where order_id=$1',[historical.id])).n,1);
      await as('authenticated',adminId);
      assert.equal(Number((await one("select manage_restaurant_table(1,'โต๊ะเก่า',true) id")).id),1);
      assert.equal(Number((await one("select table_id from restaurant_table_aliases where table_number='99'")).table_id),1);
      await assert.rejects(query("select manage_restaurant_table(null,'99',true)"));
    });
    await t.test('menu and recipe save atomically, incomplete recipe leaves no menu', async () => {
      await as('authenticated',adminId);
      const before=(await one('select count(*)::int n from menus')).n;
      await assert.rejects(query('select create_menu_complete($1,$2,$3)',[
        JSON.stringify({name:'TEST_BAD',category_id:1,price:50,is_available:true}),
        JSON.stringify([{ingredient_id:1,quantity_required:0}]),[]]));
      assert.equal((await one('select count(*)::int n from menus')).n,before);
      const saved=await one('select create_menu_complete($1,$2,$3) id',[
        JSON.stringify({name:'TEST_GOOD',category_id:1,price:50,is_available:true}),
        JSON.stringify([{ingredient_id:1,quantity_required:100}]),[]]);
      assert.equal((await one('select is_available from menus where id=$1',[saved.id])).is_available,true);
      assert.equal((await one('select quantity_required from menu_ingredients where menu_id=$1',[saved.id])).quantity_required,'100');
      await assert.rejects(query('select save_menu_with_addons(null,$1,$2)',[JSON.stringify({name:'TEST_INCOMPLETE',category_id:1,price:1,is_available:true}),[]]));
      assert.equal((await one('select count(*)::int n from menus')).n,before+1);
    });
    await t.test('staff cannot mutate catalog or kitchen status', async () => {
      await as('authenticated',staffId);
      assert.equal((await one('select is_catalog_admin() allowed')).allowed,false);
      await assert.rejects(query("insert into menus(name,price,is_available) values('TEST_FORGED',1,false)"));
      await assert.rejects(query("select create_menu_complete('{}','[]','{}')"));
      await assert.rejects(query("select advance_order_status('00000000-0000-4000-8000-000000000000','confirmed','preparing')"));
    });
    await t.test('cancel and kitchen start race has one winner; stock restores once', async () => {
      await as('service_role');
      await db.exec("update ingredients set stock_quantity=900 where id=1");
      const order=await one("insert into orders(table_id,status,total_amount,stock_deducted) values(1,'confirmed',30,true) returning id");
      await query('insert into order_ingredient_usages(order_id,ingredient_id,quantity_used) values($1,1,100)',[order.id]);
      await as('authenticated',kitchenId);
      await query("select advance_order_status($1,'confirmed','preparing')",[order.id]);
      await as('service_role');
      await assert.rejects(query("select cancel_order_and_restore_stock($1,'confirmed')",[order.id]));
      assert.equal((await one('select stock_quantity from ingredients where id=1')).stock_quantity,'900');
      await as('authenticated',kitchenId);
      await query("select advance_order_status($1,'preparing','ready')",[order.id]);
      await as('authenticated',staffId);
      await query("select complete_order_payment($1,'cash')",[order.id]);
      await assert.rejects(query("select complete_order_payment($1,'cash')",[order.id]));
      assert.equal((await one('select stock_quantity from ingredients where id=1')).stock_quantity,'900');

      await as('service_role');
      const next=await one("insert into orders(table_id,status,total_amount,stock_deducted) values(1,'confirmed',30,true) returning id");
      await query('insert into order_ingredient_usages(order_id,ingredient_id,quantity_used) values($1,1,100)',[next.id]);
      await query("select cancel_order_and_restore_stock($1,'confirmed')",[next.id]);
      await assert.rejects(query("select cancel_order_and_restore_stock($1,'confirmed')",[next.id]));
      assert.equal((await one('select stock_quantity from ingredients where id=1')).stock_quantity,'1000');
      assert.equal((await one('select stock_deducted from orders where id=$1',[next.id])).stock_deducted,false);
      assert.equal((await one('select quantity_used from order_ingredient_usages where order_id=$1',[next.id])).quantity_used,'100');
    });
    await t.test('addon deletion blocks active usage and keeps historical option snapshot', async () => {
      await as('authenticated',adminId);
      const addon=await one("select id,name from addons where name='ไข่ดาว'");
      const option=await one('select id from menu_options where addon_id=$1 limit 1',[addon.id]);
      await as('service_role');
      const active=await one("insert into orders(table_id,status,total_amount,stock_deducted) values(1,'confirmed',30,true) returning id");
      const item=await one('insert into order_items(order_id,menu_id,quantity,unit_price,subtotal) values($1,1,1,30,30) returning id',[active.id]);
      await query('insert into order_item_options(order_item_id,menu_option_id,option_name,additional_price,quantity) values($1,$2,$3,10,1)',[item.id,option.id,addon.name]);
      await query('insert into order_ingredient_usages(order_id,ingredient_id,quantity_used) values($1,1,100)',[active.id]);
      await as('authenticated',adminId);
      await assert.rejects(query('select delete_addon_safely($1,$2)',[addon.id,addon.name]));
      await as('service_role');
      await query("select cancel_order_and_restore_stock($1,'confirmed')",[active.id]);
      await as('authenticated',adminId);
      await query('select delete_addon_safely($1,$2)',[addon.id,addon.name]);
      const snapshot=await one('select menu_option_id,option_name,additional_price,quantity from order_item_options where order_item_id=$1',[item.id]);
      assert.deepEqual(snapshot,{menu_option_id:null,option_name:addon.name,additional_price:'10',quantity:1});
      assert.equal((await one('select count(*)::int n from menu_options where addon_id=$1',[addon.id])).n,0);
      assert.equal((await one('select count(*)::int n from addon_ingredients where addon_id=$1',[addon.id])).n,0);
    });
    await t.test('inactive table cannot create a new order', async () => {
      await as('authenticated',adminId);
      await query("select manage_restaurant_table(1,'โต๊ะเก่า',false)");
      await as('service_role');
      await assert.rejects(query("insert into orders(table_id,status,total_amount) values(1,'confirmed',1)"));
    });
    await t.test('category deletion requires destination and preserves stock and usage', async () => {
      await as('authenticated',adminId);
      const category=await one("select id from ingredient_categories where name='ผัก'");
      const other=await one("insert into ingredient_categories(name,display_order,is_active) values('อื่น ๆ',999,true) returning id");
      const stockBefore=await query('select id,stock_quantity from ingredients order by id');
      const usageBefore=await query('select id,order_id,quantity_used from order_ingredient_usages order by id');
      await assert.rejects(query('select delete_ingredient_category_safely($1,null)',[category.id]));
      await query('select delete_ingredient_category_safely($1,$2)',[category.id,other.id]);
      assert.equal((await one('select count(*)::int n from ingredient_categories where id=$1',[category.id])).n,0);
      assert.equal((await one('select count(*)::int n from ingredients where category_id=$1',[category.id])).n,0);
      assert.deepEqual(await query('select id,stock_quantity from ingredients order by id'),stockBefore);
      assert.deepEqual(await query('select id,order_id,quantity_used from order_ingredient_usages order by id'),usageBefore);
      await assert.rejects(query('select delete_ingredient_category_safely($1,null)',[other.id]));
    });
  } finally { await db.close(); }
});
