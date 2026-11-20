import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash, randomUUID } from 'node:crypto';

test('member management system migration, customer flows, and admin analytics', async () => {
  const db = new PGlite();
  const migration = (n) => readFileSync(`supabase/migrations/${n}.sql`, 'utf8');
  const rollback = (n) => readFileSync(`supabase/rollback/${n}.sql`, 'utf8');
  const q = async (sql, params = []) => (await db.query(sql, params)).rows;
  const hash = (x) => createHash('sha256').update(x).digest('hex');

  async function as(role, id = '') {
    await db.exec('reset role');
    await q("select set_config('request.jwt.claim.role',$1,false),set_config('request.jwt.claim.sub',$2,false)", [role, id]);
    if (role) await db.exec(`set role ${role}`);
  }

  try {
    const setup = readFileSync('tests/active-accounts.test.mjs', 'utf8');
    await new Function('db', 'migration', 'readFileSync', `return (async () => {${setup.slice(setup.indexOf('  await db.exec(readFileSync'), setup.indexOf('  const as='))}})()`)(db, migration, readFileSync);
    for (const name of [
      '20260923100000_served_order_payment',
      '20261005000000_isolate_operational_roles',
      '20261025000000_kitchen_fcfs_plates',
      '20261025010000_partial_plate_service',
      '20261031000000_item_payments',
      '20261031010000_optional_members',
      '20261101000000_member_recovery_lock_order',
    ]) {
      await db.exec(migration(name));
    }

    // 1. Run new migration
    await db.exec(migration('20261108000000_member_management_system'));

    // 2. Test rollback & re-apply
    await db.exec(rollback('20261108000000_member_management_system'));
    await db.exec(migration('20261108000000_member_management_system'));
    await db.exec(migration('20261109000000_member_password_reset'));
    await db.exec(rollback('20261109000000_member_password_reset'));
    await db.exec(migration('20261109000000_member_password_reset'));

    // 3. Test Customer Registration (Phone, Password Hash, Gender, Age Range for Marketing)
    await as('service_role');
    const tokenA = 'token_device_a_' + randomUUID();
    const hashA = hash(tokenA);
    const initialPasswordHash = 'salt123:hashabc456';

    const [enrolled] = await q(
      'select * from enroll_member_request($1,$2,$3,$4,$5,$6)',
      ['+66811112222', 'female', '25-34', true, hashA, initialPasswordHash]
    );
    assert.ok(enrolled);
    assert.match(enrolled.member_code, /^MEM-\d{5}$/, 'Member code should format as MEM-XXXXX');
    assert.equal(enrolled.is_active, false, 'Initial registration is pending admin approval');

    // 4. Test Admin 1-Click Approval
    // Authenticated admin user id '00000000-0000-4000-8000-000000000091'
    await as('authenticated', '00000000-0000-4000-8000-000000000091');

    // Check pending list
    const pendingList = await q('select * from admin_list_pending_members()');
    assert.equal(pendingList.length, 1);
    assert.equal(pendingList[0].phone, '+66811112222');
    assert.equal(pendingList[0].gender, 'female');
    assert.equal(pendingList[0].age_range, '25-34');

    // 1-Click approve
    await q('select admin_approve_member($1)', [hashA]);

    // Pending list now empty
    const pendingAfter = await q('select * from admin_list_pending_members()');
    assert.equal(pendingAfter.length, 0);

    // 5. Test Customer active profile after admin approval
    await as('service_role');
    const [memberA] = await q('select * from get_member_profile($1)', [hashA]);
    assert.ok(memberA, 'Member profile is now active');
    assert.equal(memberA.member_code, enrolled.member_code);
    assert.equal(memberA.phone, '+66811112222');
    assert.equal(memberA.gender, 'female');
    assert.equal(memberA.age_range, '25-34');
    assert.equal(memberA.promotion_consent, true);

    // 6. Test Returning Member Login on new device
    const tokenB = 'token_device_b_' + randomUUID();
    const hashB = hash(tokenB);
    const [loginResult] = await q('select * from member_login($1,$2)', ['+66811112222', hashB]);
    assert.equal(loginResult.member_code, memberA.member_code);
    assert.equal(loginResult.is_active, true, 'Previously approved member logs in active immediately');

    // 7. Test Customer Profile Update
    const [updatedMember] = await q(
      'select * from update_member_profile($1,$2,$3,$4)',
      [hashB, 'other', '35-44', false]
    );
    assert.equal(updatedMember.gender, 'other');
    assert.equal(updatedMember.age_range, '35-44');
    assert.equal(updatedMember.promotion_consent, false);

    // 8. Test Ordering and Member Linking
    const [menu] = await q("insert into menus(name,price,is_available) values('ข้าวกะเพรา',60,true) returning id");
    await q('insert into menu_ingredients(menu_id,ingredient_id,quantity_required) select $1,id,1 from ingredients order by id limit 1', [menu.id]);

    const orderItems = JSON.stringify([{ menu_id: menu.id, quantity: 2, unit_price: 60, subtotal: 120, options: [] }]);
    const sessionToken = randomUUID();
    const requestId = randomUUID();

    // Create member order
    const [orderRow] = await q(
      "select * from create_member_order(1,$1,null,120,$2::jsonb,'[]'::jsonb,'dine_in',$3,$4,$5)",
      [sessionToken, orderItems, requestId, hash('request_fingerprint'), hashB]
    );
    assert.ok(orderRow.id);

    // Verify order.member_id matches memberA.id
    const [dbOrder] = await q('select member_id, status from orders where id=$1', [orderRow.id]);
    assert.equal(dbOrder.member_id, memberA.id);

    // Customer order history & detail
    const customerOrders = await q('select * from get_member_orders($1)', [hashB]);
    assert.equal(customerOrders.length, 1);
    assert.equal(customerOrders[0].id, orderRow.id);

    const orderDetailJson = (await q('select get_member_order_detail($1,$2) as d', [hashB, orderRow.id]))[0].d;
    assert.equal(orderDetailJson.id, orderRow.id);
    assert.equal(orderDetailJson.items.length, 1);
    assert.equal(orderDetailJson.items[0].menu_name, 'ข้าวกะเพรา');

    // 9. Test Admin Directory, Detail, Orders, and Marketing Analytics
    await as('authenticated', '00000000-0000-4000-8000-000000000091');

    const memberList = await q('select * from admin_list_members()');
    assert.ok(memberList.length >= 1);
    const found = memberList.find((m) => m.member_code === memberA.member_code);
    assert.ok(found);
    assert.equal(found.order_count, 1);

    const memberDetail = (await q('select admin_get_member_detail($1) as d', [memberA.id]))[0].d;
    assert.equal(memberDetail.member_code, memberA.member_code);
    assert.equal(memberDetail.order_count, 1);

    // Marketing demographics in Analytics
    const analytics = (await q('select admin_member_analytics() as a'))[0].a;
    assert.ok(analytics.total_members >= 1);
    assert.ok(Array.isArray(analytics.gender_distribution));
    assert.ok(Array.isArray(analytics.age_distribution));
    assert.ok(analytics.gender_distribution.some((g) => g.count > 0));
    assert.ok(analytics.age_distribution.some((a) => a.count > 0));

    // 10. Test Duplicate Phone Registration Protection
    await as('service_role');
    await assert.rejects(
      q('select * from enroll_member_request($1,$2,$3,$4,$5)', [
        '+66811112222',
        'male',
        '18-24',
        false,
        hash('duplicate_device_token'),
      ]),
      /PHONE_ALREADY_EXISTS/,
      'Must reject customer registration if phone number already exists in system'
    );

    // 11. Test Admin CRUD: Add, Update, and Delete Member
    await as('authenticated', '00000000-0000-4000-8000-000000000091');

    // 11.1 Admin Add Member
    const addedMember = (await q('select admin_add_member($1,$2,$3,$4) as m', ['+66899990000', 'male', '45-54', true]))[0].m;
    assert.ok(addedMember.id);
    assert.match(addedMember.member_code, /^MEM-\d{5}$/);
    assert.equal(addedMember.phone, '+66899990000');

    // Duplicate phone check for admin add
    await assert.rejects(
      q('select admin_add_member($1,$2,$3,$4)', ['+66899990000', 'female', '25-34', false]),
      /PHONE_ALREADY_EXISTS/
    );

    // 11.2 Admin Update Member
    const updatedByAdmin = (
      await q('select admin_update_member($1,$2,$3,$4,$5) as m', [
        addedMember.id,
        '+66899998888',
        'other',
        '55plus',
        false,
      ])
    )[0].m;
    assert.equal(updatedByAdmin.phone, '+66899998888');
    assert.equal(updatedByAdmin.gender, 'other');
    assert.equal(updatedByAdmin.age_range, '55plus');

    // Update with phone of another member must fail
    await assert.rejects(
      q('select admin_update_member($1,$2,$3,$4,$5)', [
        addedMember.id,
        '+66811112222',
        'other',
        '55plus',
        false,
      ]),
      /PHONE_ALREADY_EXISTS/
    );

    // 11.3 Admin Reset Member Password (Forgot Password Support)
    const newPasswordHash = 'newsalt:newhash789';
    const resetOk = (await q('select admin_reset_member_password($1,$2) as ok', [memberA.id, newPasswordHash]))[0].ok;
    assert.equal(resetOk, true);

    await as('service_role');
    const [checkedMember] = await q('select password_hash from members where id=$1', [memberA.id]);
    assert.equal(checkedMember.password_hash, newPasswordHash);
    await as('authenticated', '00000000-0000-4000-8000-000000000091');

    // 11.4 Admin Delete Member (Preserves Order History & Revenue Records)
    await q('select admin_delete_member($1)', [memberA.id]);
    await as('service_role');
    const afterDelete = await q('select * from members where id=$1', [memberA.id]);
    assert.equal(afterDelete.length, 0, 'Member row must be deleted');

    const [preservedOrder] = await q('select id, member_id, total_amount from orders where id=$1', [orderRow.id]);
    assert.ok(preservedOrder, 'Order must still exist for financial auditing');
    assert.equal(preservedOrder.member_id, null, 'orders.member_id must be nullified without deleting the order');
    assert.equal(Number(preservedOrder.total_amount), 120);

    // 12. Anon permission check
    await as('anon');
    await assert.rejects(q('select * from admin_list_members()'), /permission denied/);
    await assert.rejects(q('select admin_member_analytics()'), /permission denied/);
    await assert.rejects(q('select * from admin_list_pending_members()'), /permission denied/);
    await assert.rejects(q('select admin_add_member($1)', ['+66800001111']), /permission denied/);
    await assert.rejects(q('select admin_delete_member($1)', [addedMember.id]), /permission denied/);

    await db.exec('rollback');
  } finally {
    await db.close();
  }
});
