import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';

test('Thai cadence, durable reset cursor, refills, outstanding stock, stale forms and authorization', async () => {
  const db = new PGlite();
  const migration = n => readFileSync(`supabase/migrations/${n}.sql`, 'utf8');
  const query = async (sql,params=[]) => (await db.query(sql,params)).rows;
  const admin='00000000-0000-4000-8000-000000000091',staff='00000000-0000-4000-8000-000000000092';
  const as = async(id='') => {
    await db.exec('reset role'); await query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
    if(id) await db.exec('set role authenticated');
  };
  try {
    const setup=readFileSync('tests/active-accounts.test.mjs','utf8');
    await new Function('db','migration','readFileSync',`return (async () => {${setup.slice(setup.indexOf('  await db.exec(readFileSync'),setup.indexOf('  const as='))}})()`)(db,migration,readFileSync);
    const before=await query('select id,stock_quantity from ingredients order by id');
    await db.exec(migration('20261025020000_ingredient_stock_reset'));
    await db.exec(migration('20261025022000_ingredient_stock_version'));
    assert.deepEqual(await query('select id,stock_quantity from ingredients order by id'),before,'migration never resets existing ingredients');
    assert.equal((await query('select count(*)::int n from ingredients where reset_every_days is not null'))[0].n,0);
    for(const [after,expected] of [['2026-10-24T16:59:59Z','2026-10-24T17:00:00.000Z'],['2026-10-24T17:00:00Z','2026-10-25T17:00:00.000Z']]) {
      const [{next}]=await query("select next_ingredient_reset('2026-10-25','00:00',1,$1) next",[after]);
      assert.equal(next.toISOString(),expected);
    }
    await db.exec("set time zone 'America/New_York'");
    assert.equal((await query("select next_ingredient_reset('2026-10-25','23:30',3,'2026-10-28T16:30:00Z') next"))[0].next.toISOString(),'2026-10-31T16:30:00.000Z');
    await assert.rejects(query("select next_ingredient_reset('2026-10-25','00:00',0,now())"),/INVALID_RESET_SCHEDULE/);
    await as(admin);
    const values={name:'TEST reset rice',unit:'กรัม',category_id:null,stock_quantity:1000,minimum_stock:10,reset_every_days:null,reset_start_date:null,reset_time:null};
    const save=async(id,values,version=null)=>(await query('select save_ingredient($1,$2::jsonb,$3) id',[id,JSON.stringify(values),version]))[0].id;
    const id=await save(null,values);
    const read=async()=> (await query('select * from ingredients where id=$1',[id]))[0];
    let item=await read(); assert.equal(item.reset_next_at,null);
    await save(id,{...values,reset_every_days:2,reset_start_date:'2020-01-01',reset_time:'23:59'},item.updated_at);
    item=await read(); assert.ok(item.reset_next_at>new Date()); assert.equal(Number(item.stock_quantity),1000,'backdated config starts next future period');
    const version=item.updated_at;
    await as();
    await query("update ingredients set reset_next_at=now()-interval '7 days' where id=$1",[id]);
    // A no-browser cron run and another overlapping invocation consume one period.
    const runs=await Promise.all([query('select run_ingredient_stock_resets() n'),query('select run_ingredient_stock_resets() n')]);
    assert.equal(runs.reduce((sum,rows)=>sum+rows[0].n,0),1);
    item=await read(); assert.equal(Number(item.stock_quantity),0); assert.ok(item.reset_next_at>new Date()); assert.ok(item.reset_last_at);
    await as(admin);
    await assert.rejects(save(id,{...values,stock_quantity:500},version),/INGREDIENT_CHANGED/);
    item=await read();
    await save(id,{...values,stock_quantity:500,reset_every_days:2,reset_start_date:'2020-01-01',reset_time:'23:59'},item.updated_at);
    await as();
    await query('select run_ingredient_stock_resets()'); assert.equal(Number((await read()).stock_quantity),500,'retry cannot wipe refill');
    // Refill arriving after its due minute but before cron is also retained.
    await query("update ingredients set reset_next_at=now()-interval '1 minute' where id=$1",[id]);
    item=await read(); await as(admin);
    await save(id,{...values,stock_quantity:700,reset_every_days:2,reset_start_date:'2020-01-01',reset_time:'23:59'},item.updated_at);
    await as(); await query('select run_ingredient_stock_resets()'); assert.equal(Number((await read()).stock_quantity),700);
    // Unchanged stock fields in metadata-only forms must not resurrect old stock.
    await query("update ingredients set reset_next_at=now()-interval '1 minute' where id=$1",[id]);
    item=await read(); await as(admin);
    const metadata={...values,reset_every_days:2,reset_start_date:'2020-01-01',reset_time:'23:59'}; delete metadata.stock_quantity;
    await save(id,metadata,item.updated_at); assert.equal(Number((await read()).stock_quantity),0);
    await as();
    const [{id:orderId}]=await query("insert into orders(table_id,status,total_amount,stock_deducted) values(1,'confirmed',50,true) returning id");
    await query('insert into order_ingredient_usages(order_id,ingredient_id,quantity_used) values($1,$2,100)',[orderId,id]);
    await query('update ingredients set stock_quantity=900 where id=$1',[id]);
    const usage=await query('select * from order_ingredient_usages where order_id=$1',[orderId]);
    await query("update ingredients set reset_next_at=now()-interval '1 minute' where id=$1",[id]);
    await query('select run_ingredient_stock_resets()');
    assert.deepEqual(await query('select * from order_ingredient_usages where order_id=$1',[orderId]),usage);
    assert.deepEqual((await query('select status,stock_deducted from orders where id=$1',[orderId]))[0],{status:'confirmed',stock_deducted:true});
    await query("update orders set status='cancelled' where id=$1",[orderId]);
    assert.equal(Number((await read()).stock_quantity),100,'reserved stock restores once after reset');
    await query("update orders set status='cancelled' where id=$1",[orderId]);
    assert.equal(Number((await read()).stock_quantity),100);
    // Cancellation racing BEFORE cron keeps only the returned reservation.
    const [{id:order2}]=await query("insert into orders(table_id,status,total_amount,stock_deducted) values(1,'confirmed',50,true) returning id");
    await query('insert into order_ingredient_usages(order_id,ingredient_id,quantity_used) values($1,$2,60)',[order2,id]);
    await query('update ingredients set stock_quantity=900 where id=$1',[id]);
    await query("update ingredients set reset_next_at=now()-interval '1 minute' where id=$1",[id]);
    await assert.rejects(query('update ingredients set stock_quantity=stock_quantity-10 where id=$1',[id]),/INSUFFICIENT_STOCK/);
    await query("update orders set status='cancelled' where id=$1",[order2]);
    await query('select run_ingredient_stock_resets()'); assert.equal(Number((await read()).stock_quantity),60);
    await as(admin); item=await read();
    await save(id,{...values,stock_quantity:123},item.updated_at); item=await read();
    assert.equal(item.reset_next_at,null); assert.equal(item.reset_every_days,null);
    await assert.rejects(query('update ingredients set stock_quantity=0 where id=$1',[id]),/permission denied/);
    const beforeDeduction=item.updated_at;
    await as(); await query('update ingredients set stock_quantity=stock_quantity-10 where id=$1',[id]);
    await as(admin);
    await assert.rejects(save(id,{...values,stock_quantity:200},beforeDeduction),/INGREDIENT_CHANGED/);
    assert.equal(Number((await read()).stock_quantity),113,'a stale refill cannot overwrite an order deduction');
    await as(staff);
    await assert.rejects(save(id,values,item.updated_at),/ADMIN_REQUIRED/);
    await assert.rejects(query('select run_ingredient_stock_resets()'),/permission denied/);
    await as();
    await query("insert into profiles(id,role,is_active) values('00000000-0000-4000-8000-000000000099','admin',true)");
    await query('update profiles set is_active=false where id=$1',[admin]);
    await as(admin); await assert.rejects(save(id,values,item.updated_at),/ADMIN_REQUIRED/);
    await as(); await db.exec('set role anon');
    await assert.rejects(save(null,values),/permission denied/);
    await assert.rejects(query('select run_ingredient_stock_resets()'),/permission denied/);
    await as();
    // PGlite has no background worker extensions. Exercise the exact scheduling
    // migration against a small cron catalog stub; deployment verifies pg_cron.
    await db.exec(`create schema cron; create table cron.job(jobname text primary key,schedule text,command text,active boolean default true);
      create function cron.schedule(text,text,text) returns bigint language sql as $$
        insert into cron.job(jobname,schedule,command) values($1,$2,$3)
        on conflict(jobname) do update set schedule=excluded.schedule,command=excluded.command returning 1::bigint $$;`);
    const scheduling=migration('20261025021000_schedule_ingredient_stock_reset').replace('create extension if not exists pg_cron with schema pg_catalog;','');
    await db.exec(scheduling); await db.exec(scheduling);
    assert.deepEqual(await query('select jobname,schedule from cron.job'),[{jobname:'smart-order-ingredient-stock-reset',schedule:'* * * * *'}]);
  } finally { await db.close(); }
});
