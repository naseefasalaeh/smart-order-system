import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const remove = readFileSync('supabase/migrations/20261025161000_remove_legacy_stock_rpcs.sql', 'utf8');
const restore = readFileSync('supabase/rollback/20261025161000_restore_legacy_stock_rpcs.sql', 'utf8');

test('unused stock RPCs restore exact definitions/grants and reject new callers', async () => {
  const db = new PGlite();
  const query = async sql => (await db.query(sql)).rows;
  try {
    await db.exec(readFileSync('tests/fixtures/catalog-baseline.sql', 'utf8'));
    await db.exec(restore);
    const snapshot = () => query(`
      select proname, pg_get_functiondef(oid) definition, proacl::text acl
      from pg_proc where pronamespace='public'::regnamespace
        and proname in ('deduct_ingredient_stock','process_order_stock') order by proname
    `);
    const before = await snapshot();
    await db.exec(remove);
    assert.deepEqual(await snapshot(), []);
    await db.exec(restore);
    assert.deepEqual(await snapshot(), before);
    await db.exec(`
      create function legacy_caller() returns void language plpgsql as
      $$ begin perform public.deduct_ingredient_stock('[]'::jsonb); end $$;
    `);
    await assert.rejects(db.exec(remove), /LEGACY_STOCK_FUNCTION_REFERENCE/);
    await db.exec('rollback; drop function legacy_caller(); create schema cron; create table cron.job(command text);');
    await db.exec("insert into cron.job values ('select public.process_order_stock(null, null)')");
    await assert.rejects(db.exec(remove), /LEGACY_STOCK_CRON_REFERENCE/);
    await db.exec('rollback');
    assert.deepEqual(await snapshot(), before);
  } finally {
    await db.close();
  }
});
