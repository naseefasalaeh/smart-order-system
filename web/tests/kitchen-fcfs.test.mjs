import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';

test('FCFS, persistent per-plate completion, duplicate requests and authorization', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated;
      create function public.current_shop_role() returns text language sql as $$
        select current_setting('test.shop_role', true) $$;
      create table orders(id uuid primary key, status text, created_at timestamptz default now(),
        order_number bigint, updated_at timestamptz);
      create table order_items(id bigint primary key, order_id uuid, quantity integer);
      insert into orders(id,status,order_number) values
        ('00000000-0000-0000-0000-000000000001','confirmed',1),
        ('00000000-0000-0000-0000-000000000002','confirmed',2);
      insert into order_items values(1,'00000000-0000-0000-0000-000000000001',3),
        (2,'00000000-0000-0000-0000-000000000002',1);`);
    await db.exec(readFileSync('supabase/migrations/20261025000000_kitchen_fcfs_plates.sql', 'utf8'));
    const advance = (id, from, to) => db.query('select advance_order_status($1,$2,$3)',
      [`00000000-0000-0000-0000-00000000000${id}`, from, to]);
    await assert.rejects(advance(1,'confirmed','preparing'), /KITCHEN_ROLE_REQUIRED/);
    await db.exec("set test.shop_role='kitchen_staff'");
    await assert.rejects(advance(2,'confirmed','preparing'), /WAIT_PREVIOUS_ORDER/);
    await advance(1,'confirmed','preparing');
    await assert.rejects(advance(2,'confirmed','preparing'), /WAIT_PREVIOUS_ORDER/);
    await assert.rejects(advance(1,'preparing','ready'), /PLATES_INCOMPLETE/);
    await assert.rejects(db.query('select set_kitchen_plate(1,4,true)'), /INVALID_PLATE/);
    await db.exec('select set_kitchen_plate(1,1,true); select set_kitchen_plate(1,1,true)');
    assert.deepEqual((await db.query('select completed_plates from order_items where id=1')).rows[0].completed_plates,[1]);
    await db.exec('select set_kitchen_plate(1,2,true); select set_kitchen_plate(1,3,true); select set_kitchen_plate(1,2,false)');
    await assert.rejects(advance(1,'preparing','ready'), /PLATES_INCOMPLETE/);
    await db.exec('select set_kitchen_plate(1,2,true)');
    await advance(1,'preparing','ready');
    await assert.rejects(db.query('select set_kitchen_plate(1,1,false)'), /ORDER_NOT_PREPARING/);
    await advance(2,'confirmed','preparing');
    await db.exec("set test.shop_role='staff'");
    await assert.rejects(db.query('select set_kitchen_plate(2,1,true)'), /KITCHEN_ROLE_REQUIRED/);
    await db.exec('set role authenticated');
    await assert.rejects(db.query("update order_items set completed_plates='{1}' where id=2"), /permission denied/);
  } finally { await db.close(); }
});
