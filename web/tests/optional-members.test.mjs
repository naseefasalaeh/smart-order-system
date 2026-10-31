import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash, randomUUID } from 'node:crypto';

test('optional members keep existing phone private and require staff approval for a new device', async () => {
  const db = new PGlite();
  const migration = n => readFileSync(`supabase/migrations/${n}.sql`, 'utf8');
  const q = async (sql, params = []) => (await db.query(sql, params)).rows;
  const hash = x => createHash('sha256').update(x).digest('hex');
  async function as(role, id='') {
    await db.exec('reset role');
    await q("select set_config('request.jwt.claim.role',$1,false),set_config('request.jwt.claim.sub',$2,false)",[role,id]);
    if (role) await db.exec(`set role ${role}`);
  }
  try {
    const setup = readFileSync('tests/active-accounts.test.mjs','utf8');
    await new Function('db','migration','readFileSync',`return (async () => {${setup.slice(setup.indexOf('  await db.exec(readFileSync'),setup.indexOf('  const as='))}})()`)(db,migration,readFileSync);
    for (const name of ['20260923100000_served_order_payment','20261005000000_isolate_operational_roles','20261025000000_kitchen_fcfs_plates','20261025010000_partial_plate_service','20261031000000_item_payments']) await db.exec(migration(name));
    await db.exec(migration('20261031010000_optional_members'));
    await db.exec(migration('20261101000000_member_recovery_lock_order'));
    await db.exec(readFileSync('supabase/rollback/20261101000000_member_recovery_lock_order.sql','utf8'));
    await db.exec(readFileSync('supabase/rollback/20261031010000_optional_members.sql','utf8'));
    await db.exec(migration('20261031010000_optional_members'));
    await db.exec(migration('20261101000000_member_recovery_lock_order'));
    const [menu]=await q("insert into menus(name,price,is_available) values('TEST membership',50,true) returning id");
    await q('insert into menu_ingredients(menu_id,ingredient_id,quantity_required) select $1,id,1 from ingredients order by id limit 1',[menu.id]);
    const enroll=(phone,gender,age,promotions,token)=>q('select enroll_member($1,$2,$3,$4,$5)',[phone,gender,age,promotions,hash(token)]);
    await as('service_role');
    await enroll('+66812345678','female','25-34',false,'first device');
    await enroll('+66812345678','male','55plus',true,'unknown device');
    const orderItems=JSON.stringify([{menu_id:menu.id,quantity:1,unit_price:50,subtotal:50,options:[]}]);
    const session=randomUUID();
    const create=async(token,requestId=randomUUID())=>(await q('select * from create_member_order(1,$1,null,50,$2::jsonb,\'[]\'::jsonb,\'dine_in\',$3,$4,$5)',[session,orderItems,requestId,'a'.repeat(64),hash(token)]))[0];
    const owned=await create('first device');
    const guestRequest=randomUUID(),guest=await create('unknown device',guestRequest);
    await as('');
    const [member]=await q('select * from members');
    assert.equal(member.gender,'female'); assert.equal(member.age_range,'25-34'); assert.equal(member.promotion_consent,false); assert.equal(member.phone_verified,false);
    assert.equal((await q('select member_id from orders where id=$1',[owned.id]))[0].member_id,member.id);
    assert.equal((await q('select member_id from orders where id=$1',[guest.id]))[0].member_id,null);
    assert.deepEqual((await q('select active from member_devices order by active')).map(x=>x.active),[false,true]);
    for (const role of ['anon','authenticated']) {
      await as(role);
      for (const table of ['members','member_devices']) await assert.rejects(q(`select * from ${table}`),/permission denied/);
      await assert.rejects(enroll('+66899999999','other','unspecified',false,'attacker'),/permission denied/);
      await assert.rejects(q('select review_member_device($1,$2)',[hash('unknown device'),'verification record']),/STAFF_ROLE_REQUIRED|permission denied/);
      await assert.rejects(q("select * from member_menu_statistics(now()-interval '1 day',now())"),/ADMIN_ROLE_REQUIRED|permission denied/);
    }
    await as('authenticated','00000000-0000-4000-8000-000000000092');
    await assert.rejects(q('select review_member_device($1,$2)',[hash('unknown device'),'phone']),/VERIFICATION_NOTE_REQUIRED/);
    await q('select review_member_device($1,$2)',[hash('unknown device'),'Verified additional evidence in person']);
    await as('');
    const [device]=await q('select * from member_devices where token_hash=$1',[hash('unknown device')]);
    assert.equal(device.active,true); assert.ok(device.reviewed_at); assert.equal(device.reviewed_by,'00000000-0000-4000-8000-000000000092');
    assert.equal((await q('select count(*)::int n from members'))[0].n,1);
    await assert.rejects(q("update members set phone_verified=true"),/check constraint/);
    await as('service_role');
    await create('unknown device',guestRequest);
    await as('');
    assert.equal((await q('select member_id from orders where id=$1',[guest.id]))[0].member_id,null,'retries never change guest ownership after staff approval');
    const ownersBefore=await q('select id,member_id from orders where id=any($1::uuid[]) order by id',[[owned.id,guest.id]]);
    await q("update order_items set completed_plates='{1}',served_plates='{1}' where order_id=any($1::uuid[])",[[owned.id,guest.id]]);
    await q("update orders set status='served' where id=any($1::uuid[])",[[owned.id,guest.id]]);
    const allocations=await q('select id as item_id,quantity from order_items where order_id=any($1::uuid[])',[[owned.id,guest.id]]);
    await as('authenticated','00000000-0000-4000-8000-000000000092');
    const [receipt]=await q("select collect_item_payment($1,'cash',$2::jsonb) result",[randomUUID(),JSON.stringify(allocations)]);
    assert.equal(receipt.result.amount_satang,10000);
    await as('');
    assert.deepEqual(await q('select id,member_id from orders where id=any($1::uuid[]) order by id',[[owned.id,guest.id]]),ownersBefore,'one payment never changes member or guest order ownership');
    await as('authenticated','00000000-0000-4000-8000-000000000091');
    const stats=await q("select * from member_menu_statistics(now()-interval '1 day',now()+interval '1 day') where menu_name='TEST membership'");
    assert.equal(stats.length,2,'guest and member demographics remain separate');
    assert.equal(stats.find(s=>s.customer_group==='member').gender,'female');
    await as('');
    await q("update member_devices set expires_at=now()-interval '1 second' where token_hash=$1",[hash('first device')]);
    await as('service_role');
    const expired=await create('first device');
    await as('');
    assert.equal((await q('select member_id from orders where id=$1',[expired.id]))[0].member_id,null,'expired device token cannot attach a member');
    await assert.rejects(db.exec(readFileSync('supabase/rollback/20261031010000_optional_members.sql','utf8')),/MEMBER_DATA_EXISTS/);
    await db.exec('rollback');
  } finally { await db.close(); }
});
