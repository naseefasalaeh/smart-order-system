import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { test } from 'node:test';

test('item payments preserve history, serialize retries, separate sessions and roles', async () => {
  const db = new PGlite();
  const migration = n => readFileSync(`supabase/migrations/${n}.sql`, 'utf8');
  const query = async (sql, params = []) => (await db.query(sql, params)).rows;
  const as = async role => {
    await db.exec('reset role');
    await query("select set_config('request.jwt.claim.sub',$1,false)", [role === 'staff' ? '00000000-0000-4000-8000-000000000092' : role === 'admin' ? '00000000-0000-4000-8000-000000000091' : '']);
    if (role) await db.exec(`set role ${role === 'anon' ? 'anon' : 'authenticated'}`);
  };
  try {
    const setup = readFileSync('tests/active-accounts.test.mjs','utf8');
    await new Function('db','migration','readFileSync',`return (async () => {${setup.slice(setup.indexOf('  await db.exec(readFileSync'),setup.indexOf('  const as='))}})()`)(db,migration,readFileSync);
    for (const n of ['20260923100000_served_order_payment','20261005000000_isolate_operational_roles','20261025000000_kitchen_fcfs_plates','20261025010000_partial_plate_service']) await db.exec(migration(n));
    // Fixtures contain legacy rows unrelated to this scenario.
    await db.exec("delete from payments");
    const create = async session => {
      const [o] = await query("insert into orders(table_id,session_id,status,total_amount,stock_deducted,dining_type) values(1,$1,'served',121,true,'dine_in') returning id",[session]);
      const [i] = await query('insert into order_items(order_id,menu_id,quantity,unit_price,subtotal) select $1,id,2,60.50,121 from menus order by id limit 1 returning id',[o.id]);
      return {order:o.id,item:i.id};
    };
    const [s] = await query("insert into dining_sessions(table_id,access_token) values(1,gen_random_uuid()) returning id");
    const old = await create(s.id);
    await as('staff');
    await query("select complete_order_payment($1,'cash')",[old.order]);
    await as();
    const before = await query('select * from payments');
    await db.exec(migration('20261031000000_item_payments'));
    assert.equal((await query('select * from payment_allocations')).length,1);
    assert.equal((await query('select id from payments'))[0].id,before[0].id);
    await db.exec(readFileSync('supabase/rollback/20261031000000_item_payments.sql','utf8'));
    assert.equal((await query('select id from payments'))[0].id,before[0].id);
    await db.exec(migration('20261031000000_item_payments'));
    const first=await create(s.id),second=await create(s.id),other=await create(null);
    const pay=(id,items,method='cash')=>query('select collect_item_payment($1,$2,$3::jsonb) result',[id,method,JSON.stringify(items)]);
    await as('staff');
    const id=randomUUID(),items=[{item_id:first.item,quantity:1},{item_id:second.item,quantity:1}];
    const receipts=await Promise.all([pay(id,items),pay(id,items)]);
    assert.deepEqual(receipts[0],receipts[1]);
    assert.equal(receipts[0][0].result.amount_satang,12100);
    await assert.rejects(pay(id,items,'qr_code'),/IDEMPOTENCY_CONFLICT/);
    assert.equal((await query('select status from orders where id=$1',[first.order]))[0].status,'served');
    await assert.rejects(pay(randomUUID(),[{item_id:first.item,quantity:1},{item_id:other.item,quantity:1}]),/DIFFERENT_DINING_SESSION/);
    const races=await Promise.allSettled([pay(randomUUID(),[{item_id:first.item,quantity:1}]),pay(randomUUID(),[{item_id:first.item,quantity:1}])]);
    assert.equal(races.filter(r=>r.status==='fulfilled').length,1);
    await assert.rejects(pay(randomUUID(),[{item_id:second.item,quantity:2}]),/ITEM_ALREADY_PAID/);
    await query("select complete_order_payment($1,'qr_code')",[second.order]);
    const [sum]=await query("select sum(amount_satang)::int total from payments where status='paid'");
    assert.equal(sum.total,36300);
    await assert.rejects(query('delete from payment_allocations'),/permission denied/);
    for (const role of ['admin','anon']) {
      await as(role);
      await assert.rejects(pay(randomUUID(),[{item_id:other.item,quantity:1}]),/STAFF_ROLE_REQUIRED|permission denied/);
    }
    await as();
    await assert.rejects(db.exec(readFileSync('supabase/rollback/20261031000000_item_payments.sql','utf8')),/NEW_PAYMENTS_EXIST/);
    await db.exec('rollback');
  } finally { await db.close(); }
});
