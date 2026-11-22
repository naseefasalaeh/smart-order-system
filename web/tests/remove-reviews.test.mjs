import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const remove = readFileSync('supabase/migrations/20261025160000_remove_unused_reviews.sql', 'utf8');
const restore = readFileSync('supabase/rollback/20261025160000_restore_reviews.sql', 'utf8');

test('reviews removal is reversible and refuses data or database dependencies', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table public.orders(id uuid primary key);
      insert into public.orders values ('00000000-0000-4000-8000-000000000001');
    `);
    await db.exec(restore);
    const snapshot = async () => (await db.query(`
      select column_name, data_type, is_nullable, column_default
      from information_schema.columns where table_name='reviews' order by ordinal_position
    `)).rows;
    const before = await snapshot();
    await db.exec(remove);
    assert.equal((await db.query("select to_regclass('public.reviews') name")).rows[0].name, null);
    await db.exec(restore);
    assert.deepEqual(await snapshot(), before);
    const grants = (await db.query(`
      select grantee, privilege_type from information_schema.role_table_grants
      where table_schema='public' and table_name='reviews'
        and grantee in ('anon','authenticated','service_role')
      order by grantee, privilege_type
    `)).rows;
    const expectedGrants = ['anon', 'authenticated', 'service_role'].flatMap(grantee =>
      ['DELETE', 'INSERT', 'REFERENCES', 'SELECT', 'TRIGGER', 'TRUNCATE', 'UPDATE']
        .map(privilege_type => ({ grantee, privilege_type })));
    assert.deepEqual(grants, expectedGrants);
    assert.equal((await db.query("select relrowsecurity from pg_class where oid='public.reviews'::regclass")).rows[0].relrowsecurity, true);
    assert.equal((await db.query('select count(*)::int n from orders')).rows[0].n, 1);

    async function refuses(setup, pattern, cleanup) {
      await db.exec(setup);
      await assert.rejects(db.exec(remove), pattern);
      await db.exec('rollback');
      assert.ok((await db.query("select to_regclass('public.reviews') name")).rows[0].name);
      await db.exec(cleanup);
    }
    await refuses(
      "insert into reviews(order_id,rating) values ('00000000-0000-4000-8000-000000000001',5)",
      /REVIEWS_NOT_EMPTY/,
      'delete from reviews',
    );
    await refuses(
      'create view review_report as select * from reviews',
      /depend/,
      'drop view review_report',
    );
    await refuses(
      'create table review_links(review_id uuid references reviews(id))',
      /depend/,
      'drop table review_links',
    );
    await refuses(
      'create function review_count() returns bigint language plpgsql as $$ begin return (select count(*) from public.reviews); end $$',
      /REVIEWS_FUNCTION_REFERENCE/,
      'drop function review_count()',
    );
    await refuses(
      'create policy review_read on reviews for select to authenticated using (true)',
      /REVIEWS_CONFIGURATION_CHANGED/,
      'drop policy review_read on reviews',
    );
  } finally {
    await db.close();
  }
});
