import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
test('approved seafood conflict uses shared 15 baht / 30 grams without modifying stored recipes or options IDs',async()=>{
 const db=new PGlite();try{
 await db.exec(readFileSync('tests/fixtures/catalog-baseline.sql','utf8'));
 for(const f of ['20260902171000_restore_stock_from_usage_once','20260902170000_create_order_transaction','20260914170000_shared_addons'])await db.exec(readFileSync('supabase/migrations/'+f+'.sql','utf8'));
 await db.exec(`insert into ingredients(name,unit,stock_quantity,minimum_stock) values ('กุ้ง','กรัม',1000,0),('ปลาหมึก','กรัม',1000,0);
 insert into categories(name) values('TEST'); insert into menus(name,price,category_id,is_available) values('TEST',50,1,true);
 insert into menu_option_groups(menu_id,name,kind,selection_type,is_required,min_select,max_select,max_total_quantity,is_active) values(1,'meat','meat','single',true,1,1,1,true);
 insert into menu_options(menu_id,group_id,name,additional_price,max_quantity,is_available) values(1,1,'ทะเล',20,1,true);
 insert into menu_option_ingredients(menu_option_id,ingredient_id,quantity_required) values(1,1,80),(1,2,80);
 insert into addons(name,additional_price,is_available,max_quantity) values('ทะเล',15,true,3);
 insert into addon_ingredients values(1,1,30),(1,2,30);`);
 const before=await db.query('select * from menu_option_ingredients order by id');
 await db.exec(readFileSync('supabase/migrations/20260915093000_addon_categories.sql','utf8'));
 const o=(await db.query('select * from effective_menu_options')).rows[0];assert.equal(o.id,1);assert.equal(Number(o.additional_price),15);assert.equal(o.group_id,1);
 assert.deepEqual(await db.query('select * from menu_option_ingredients order by id'),before);
 assert.ok((await db.query('select quantity_required from effective_menu_option_ingredients')).rows.every(r=>Number(r.quantity_required)===30));
 }finally{await db.close();}
});
