import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';

test('serve then pay: role enforcement, audit preservation, retries and both dining types', async () => {
  const db = new PGlite();
  const migration = n => readFileSync(`supabase/migrations/${n}.sql`, 'utf8');
  const query = async (sql, params = []) => (await db.query(sql, params)).rows;
  const admin = '00000000-0000-4000-8000-000000000091';
  const staff = '00000000-0000-4000-8000-000000000092';
  const kitchen = '00000000-0000-4000-8000-000000000093';
  const as = async (id = '') => {
    await db.exec('reset role');
    await query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    if (id) await db.exec('set role authenticated');
  };
  try {
    // Reuse the established baseline and migration setup, stopping before its assertions.
    const setup = readFileSync('tests/active-accounts.test.mjs', 'utf8');
    const start = setup.indexOf("  await db.exec(readFileSync");
    const end = setup.indexOf('  const as=');
    await new Function('db', 'migration', 'readFileSync', `return (async () => {${setup.slice(start, end)}})()`)(db, migration, readFileSync);
    const before = await query('select * from orders order by id');
    await db.exec(migration('20260923100000_served_order_payment'));
    const after = await query('select * from orders order by id');
    assert.deepEqual(after.map(({ served_at, served_by, ...old }) => old), before);
    await query("insert into profiles(id,role,is_active) values($1,'kitchen_staff',true)", [kitchen]);
    for (const diningType of ['dine_in', 'takeaway']) {
      await as();
      const [{ id }] = await query("insert into orders(table_id,status,total_amount,stock_deducted,dining_type) values(1,'confirmed',50,true,$1) returning id", [diningType]);
      await as(staff);
      await assert.rejects(query("select advance_order_status($1,'confirmed','preparing')", [id]), /KITCHEN_ROLE_REQUIRED/);
      await assert.rejects(query('select serve_order($1)', [id]), /ORDER_NOT_READY/);
      await as(kitchen);
      await query("select advance_order_status($1,'confirmed','preparing')", [id]);
      await query("select advance_order_status($1,'preparing','ready')", [id]);
      await assert.rejects(query('select serve_order($1)', [id]), /STAFF_ROLE_REQUIRED/);
      await assert.rejects(query("select complete_order_payment($1,'cash')", [id]), /STAFF_ROLE_REQUIRED/);
      await assert.rejects(query("select advance_order_status($1,'ready','served')", [id]), /INVALID_TRANSITION/);
      await assert.rejects(query("update orders set status='completed' where id=$1", [id]));
      const actor = diningType === 'dine_in' ? staff : admin;
      await as(actor);
      await assert.rejects(query("select complete_order_payment($1,'cash')", [id]), /ORDER_NOT_SERVED/);
      await Promise.all([query('select serve_order($1)', [id]), query('select serve_order($1)', [id])]);
      const [served] = await query('select status,served_at,served_by from orders where id=$1', [id]);
      assert.equal(served.status, 'served'); assert.equal(served.served_by, actor); assert.ok(served.served_at);
      await as(actor === staff ? admin : staff);
      await query('select serve_order($1)', [id]);
      assert.deepEqual((await query('select status,served_at,served_by from orders where id=$1', [id]))[0], served);
      await assert.rejects(query('select complete_order_payment($1,null)', [id]), /INVALID_PAYMENT_METHOD/);
      const outcomes = await Promise.allSettled([query('select complete_order_payment($1,$2)', [id, diningType === 'dine_in' ? 'cash' : 'qr_code']), query("select complete_order_payment($1,'cash')", [id])]);
      assert.equal(outcomes.filter(r => r.status === 'fulfilled').length, 1);
      assert.equal((await query('select * from payments where order_id=$1', [id])).length, 1);
      assert.equal((await query('select status from orders where id=$1', [id]))[0].status, 'completed');
      await query('select serve_order($1)', [id]);
      assert.equal((await query('select served_by from orders where id=$1', [id]))[0].served_by, actor);
    }
    await as(); await query('update profiles set is_active=false where id=$1', [staff]);
    await as(staff);
    await assert.rejects(query('select serve_order($1)', [admin]), /STAFF_ROLE_REQUIRED/);
    await as('00000000-0000-4000-8000-000000000099');
    await assert.rejects(query('select serve_order($1)', [admin]), /STAFF_ROLE_REQUIRED/);
    await as(); await db.exec('set role anon');
    await assert.rejects(query('select serve_order($1)', [admin]), /permission denied/);
  } finally { await db.close(); }
});
