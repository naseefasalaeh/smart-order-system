import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
const migration = name => readFileSync(`supabase/migrations/${name}.sql`,'utf8');
const adminId='00000000-0000-4000-8000-000000000001';
const staffId='00000000-0000-4000-8000-000000000002';

test('hard delete snapshot migration + role checks + stock/history regression',async t=>{
 const db=new PGlite();const q=async(sql,args=[]) => (await db.query(sql,args)).rows;const one=async(sql,args=[]) => (await q(sql,args))[0];
 const as=async(role,id='')=>{await db.exec('reset role');await q("select set_config('request.jwt.claim.role',$1,false),set_config('request.jwt.claim.sub',$2,false)",[role,id]);if(role==='authenticated'||role==='anon')await db.exec(`set role ${role}`);};
 const remove=async(kind,id,name)=> (await one('select delete_catalog_item_safely($1,$2,$3) result',[kind,id,name])).result;
 try{
  await db.exec(readFileSync('tests/fixtures/catalog-baseline.sql','utf8'));
  await db.exec("create table profiles(id uuid primary key,role text not null default 'staff',full_name text); grant all on profiles to authenticated;");
  await q("insert into profiles(id,role) values($1,'admin'),($2,'staff')",[adminId,staffId]);
  await db.exec(migration('20260902171000_restore_stock_from_usage_once'));
  await db.exec(migration('20260902170000_create_order_transaction'));
  await db.exec(migration('20260914170000_shared_addons'));
  await db.exec("insert into ingredient_categories(name,display_order,is_active) values('เนื้อสัตว์',1,true),('ผัก',2,true),('ข้าวและเส้น',3,true),('ไข่และผลิตภัณฑ์นม',4,true)");
  await db.exec(migration('20260914171000_seed_catalog_redesign'));
  await db.exec("update ingredients set stock_quantity=10000;insert into restaurant_tables(table_number,qr_code) values('10','test');");
  const m=await one("select * from menus where catalog_key='rice-basil'");
  const other=await one("select * from menus where catalog_key='garlic'");
  const order=async(menu,protein,addonName)=>{
   const opts=await q('select * from effective_menu_options where menu_id=$1 and name=any($2::text[])',[menu.id,[protein,...(addonName?[addonName]:[])]]);
   const price=Number(menu.price)+opts.reduce((sum,o)=>sum+Number(o.additional_price),0);
   const items=[{menu_id:menu.id,quantity:1,unit_price:price,subtotal:price,options:opts.map(o=>({menu_option_id:o.id,option_name:o.name,additional_price:Number(o.additional_price),quantity:1}))}];
   await as('service_role');return one('select * from create_order_with_stock(1,$1,null,$2,$3,$4,$5)',[randomUUID(),price,JSON.stringify(items),'[]','takeaway']);
  };
  const paid=await order(m,'เนื้อ','ไข่ดาว');
  await q("update orders set status='ready' where id=$1",[paid.id]);await q("select complete_order_payment($1,'cash')",[paid.id]);
  const active=await order(m,'ไก่','เพิ่มข้าว');
  const oldItems=await q('select * from order_items order by id');
  const oldOptions=await q('select * from order_item_options order by id');
  const oldUsages=await q('select * from order_ingredient_usages order by id');
  const newMigration=migration('20260915010000_admin_hard_delete_snapshots');
  await as('');await db.exec(newMigration);
  await t.test('transaction/timestamp and backfill preserve all original row values and charged prices',async()=>{
   assert.match(newMigration.trim(),/^begin;/);assert.match(newMigration.trim(),/commit;$/);
   const files=readdirSync('supabase/migrations');assert.equal(new Set(files.map(f=>f.slice(0,14))).size,files.length);
   for(const [table,old] of [['order_items',oldItems],['order_item_options',oldOptions],['order_ingredient_usages',oldUsages]]){
    const rows=await q(`select * from ${table} order by id`);assert.equal(rows.length,old.length);
    for(let i=0;i<old.length;i++)for(const [key,value] of Object.entries(old[i]))assert.deepEqual(rows[i][key],value);
   }
   assert.equal((await one('select menu_price_snapshot from order_items where order_id=$1',[paid.id])).menu_price_snapshot,'70');
  });
  await t.test('only trusted authenticated Admin; staff cannot self-promote, direct delete or RPC',async()=>{
   await as('authenticated',staffId);assert.equal((await one('select is_catalog_admin() value')).value,false);
   await assert.rejects(remove('menu',m.id,m.name));await assert.rejects(q("update profiles set role='admin' where id=$1",[staffId]));
   await assert.rejects(q('delete from menus where id=$1',[m.id]));
   await as('anon');await assert.rejects(remove('menu',m.id,m.name));
   await as('service_role');await assert.rejects(remove('menu',m.id,m.name));
   await as('authenticated',adminId);assert.equal((await one('select is_catalog_admin() value')).value,true);
   await assert.rejects(q('delete from menus where id=$1',[m.id]));
  });
  const chicken=await one("select * from ingredients where name='เนื้อไก่'");
  await t.test('active stock usage blocks ingredient deletion without modifying any row',async()=>{
   const before=await q('select * from ingredients order by id');
   const blocked=await remove('ingredient',chicken.id,chicken.name);assert.equal(blocked.status,'active_orders');assert.equal(blocked.orders[0].id,active.id);
   assert.deepEqual(await q('select * from ingredients order by id'),before);
   await as('service_role');await q("update orders set status='ready' where id=$1",[active.id]);
   await as('authenticated',adminId);assert.equal((await remove('ingredient',chicken.id,chicken.name)).status,'active_orders');
   await as('service_role');await q("update orders set status='confirmed' where id=$1",[active.id]);
   await as('authenticated',adminId);
  });
  await t.test('menu physically deleted with local recipes/options/links, history and central addons preserved',async()=>{
   const count=await one('select (select count(*) from orders) orders,(select count(*) from order_items) items,(select count(*) from order_item_options) options,(select count(*) from payments) payments');
   assert.equal((await remove('menu',m.id,'wrong')).status,'name_changed');
   assert.equal((await remove('menu',m.id,m.name)).status,'deleted');
   for(const table of ['menus','menu_ingredients','menu_option_groups','menu_options'])assert.equal((await one(`select count(*)::int n from ${table} where ${table==='menus'?'id':'menu_id'}=$1`,[m.id])).n,0);
   const item=await one('select * from order_items where order_id=$1',[paid.id]);assert.equal(item.menu_id,null);assert.equal(item.menu_name_snapshot,m.name);assert.equal(item.menu_price_snapshot,'70');assert.equal(item.unit_price,'70');
   const options=await q('select * from order_item_options where order_item_id=$1',[item.id]);assert.deepEqual(options.map(o=>o.option_name).sort(),['เนื้อ','ไข่ดาว'].sort());assert.ok(options.every(o=>o.menu_option_id===null&&o.menu_option_id_snapshot));
   assert.equal((await one('select count(*)::int n from addons')).n,4);
   assert.deepEqual(await one('select (select count(*) from orders) orders,(select count(*) from order_items) items,(select count(*) from order_item_options) options,(select count(*) from payments) payments'),count);
   assert.equal((await remove('menu',m.id,m.name)).status,'not_found');
   assert.equal((await remove('ingredient',chicken.id,chicken.name)).status,'active_orders');
  });
  await t.test('cancel still restores stock after menu deletion; ingredient becomes deletable after cancellation',async()=>{
   await as('service_role');await q("select cancel_order_and_restore_stock($1,'confirmed')",[active.id]);
   assert.equal((await one('select stock_quantity from ingredients where id=$1',[chicken.id])).stock_quantity,'10000');
   await assert.rejects(q("select cancel_order_and_restore_stock($1,'confirmed')",[active.id]));
   await as('authenticated',adminId);assert.equal((await remove('ingredient',chicken.id,chicken.name)).status,'deleted');
   const usage=await one('select * from order_ingredient_usages where order_id=$1 and ingredient_id_snapshot=$2',[active.id,chicken.id]);assert.equal(usage.ingredient_id,null);assert.equal(usage.ingredient_name_snapshot,'เนื้อไก่');assert.equal(usage.quantity_used,'150');
  });
  await t.test('completed ingredient usage preserved; remove every recipe edge and stop incomplete recipes selling',async()=>{
   const beef=await one("select * from ingredients where name='เนื้อวัว'");
   assert.equal((await remove('ingredient',beef.id,beef.name)).status,'deleted');
   assert.equal((await one('select count(*)::int n from ingredients where id=$1',[beef.id])).n,0);
   for(const table of ['menu_ingredients','menu_option_ingredients','addon_ingredients'])assert.equal((await one(`select count(*)::int n from ${table} where ingredient_id=$1`,[beef.id])).n,0);
   const usage=await one('select * from order_ingredient_usages where order_id=$1 and ingredient_id_snapshot=$2',[paid.id,beef.id]);assert.equal(usage.ingredient_id,null);assert.equal(usage.ingredient_name_snapshot,'เนื้อวัว');assert.equal(usage.ingredient_unit_snapshot,'กรัม');assert.equal(usage.quantity_used,'150');
   assert.equal((await one("select is_available from addons where name='เพิ่มเนื้อ'")).is_available,false);
  });
  await t.test('remaining menu can order seafood and restore exact remaining ingredient stock',async()=>{
   const before=await q('select id,stock_quantity from ingredients order by id');const next=await order(other,'ทะเล');
   const item=await one('select * from order_items where order_id=$1',[next.id]);assert.equal(item.menu_name_snapshot,other.name);assert.equal(item.menu_price_snapshot,'100');
   await as('');await q('update menus set name=$1 where id=$2',['renamed after sale',other.id]);
   await q('update order_items set menu_name_snapshot=$1,menu_price_snapshot=0 where id=$2',['forged',item.id]);
   const frozen=await one('select menu_name_snapshot,menu_price_snapshot from order_items where id=$1',[item.id]);
   assert.equal(frozen.menu_name_snapshot,other.name);assert.equal(frozen.menu_price_snapshot,'100');
   await as('service_role');
   await q("select cancel_order_and_restore_stock($1,'confirmed')",[next.id]);assert.deepEqual(await q('select id,stock_quantity from ingredients order by id'),before);
   await as('authenticated',adminId);const garlic=await one("select * from ingredients where name='กระเทียม'");assert.equal((await remove('ingredient',garlic.id,garlic.name)).status,'deleted');
   assert.equal((await one('select is_available from menus where id=$1',[other.id])).is_available,false);
   await as('');assert.equal((await one('select count(*)::int n from catalog_backup.hard_delete_events')).n,4);
  });
 }finally{await db.close();}
});
