// Offline recovery rehearsal. Never connects to or modifies hosted Supabase.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const [backupDir, schemaFile] = process.argv.slice(2);
assert.ok(backupDir?.startsWith('.test-artifacts/'));
assert.ok(schemaFile?.startsWith('.test-artifacts/'));
const schema = JSON.parse(readFileSync(schemaFile, 'utf8'));
const manifest = JSON.parse(readFileSync(`${backupDir}/manifest.json`, 'utf8'));
const quote = name => `"${name.replaceAll('"', '""')}"`;
const hash = value => createHash('sha256').update(value).digest('hex');
const sql = name => readFileSync(name, 'utf8');
const db = new PGlite();
const rows = {};
const proof = { backupDir, started: new Date().toISOString(), filesVerified: [], tablesRestored: {}, rollbackVerified: false };
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const tableHash = (name, records) => hash(JSON.stringify(records.map(record => {
  const normalized = { ...record };
  for (const column of schema.columns.filter(column => column.table_name === name)) {
    const value = normalized[column.column_name];
    if (value != null && column.data_type === 'timestamp with time zone') normalized[column.column_name] = new Date(value).toISOString();
  }
  return JSON.stringify(canonical(normalized));
}).sort()));

try {
  for (const [name, entry] of Object.entries(manifest)) {
    const bytes = readFileSync(`${backupDir}/${name}.json`);
    assert.equal(hash(bytes), entry.sha256, `${name}: backup checksum`);
    rows[name] = JSON.parse(bytes);
    assert.equal(rows[name].length, entry.count);
    proof.filesVerified.push(name);
  }
  await db.exec('create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key);');
  // Only ID placeholders for the public profiles FK. Auth itself is not restored.
  for (const row of rows.profiles) await db.query('insert into auth.users values ($1)', [row.id]);
  const tables = schema.rls.map(table => table.table);
  for (const name of tables) {
    const columns = schema.columns.filter(column => column.table_name === name).sort((a, b) => a.ordinal_position - b.ordinal_position);
    const fields = columns.map(column => `${quote(column.column_name)} ${column.data_type === 'ARRAY' ? 'integer[]' : column.data_type}${column.is_nullable === 'NO' ? ' not null' : ''}`);
    await db.exec(`create table public.${quote(name)} (${fields.join(',')})`);
    await db.query(`insert into public.${quote(name)} select * from jsonb_populate_recordset(null::public.${quote(name)},$1::jsonb)`, [JSON.stringify(rows[name])]);
  }
  const functionNames = ['valid_plate_numbers(integer[],integer)', 'deduct_ingredient_stock(jsonb)', 'process_order_stock(uuid,jsonb)'];
  for (const name of functionNames) {
    const definition = schema.functions.find(fn => fn.name === name)?.definition;
    assert.ok(definition, `Missing backed-up function: ${name}`);
    await db.exec(`${definition};`);
  }
  // Add unique keys first, then checks and FKs, validating the backed-up data.
  const constraints = [...schema.constraints].sort((a, b) =>
    Number(!/^(PRIMARY KEY|UNIQUE)/.test(a.definition)) - Number(!/^(PRIMARY KEY|UNIQUE)/.test(b.definition)));
  for (const constraint of constraints) await db.exec(`alter table public.${quote(constraint.table)} add constraint ${quote(constraint.name)} ${constraint.definition}`);
  const pendingViews = [...schema.views];
  while (pendingViews.length) {
    let restored = false;
    for (const view of [...pendingViews]) {
      try {
        await db.exec(`create view public.${quote(view.viewname)} as ${view.definition}`);
        pendingViews.splice(pendingViews.indexOf(view), 1);
        restored = true;
      } catch (error) {
        if (pendingViews.length === 1) throw error;
      }
    }
    assert.ok(restored, 'Backed-up view definitions must resolve dependencies');
  }
  for (const column of schema.columns.filter(column => column.table_name === 'reviews' && column.column_default)) {
    await db.exec(`alter table reviews alter column ${quote(column.column_name)} set default ${column.column_default}`);
  }
  await db.exec('alter table public.reviews enable row level security');
  const restoreReviews = 'supabase/rollback/20261025160000_restore_reviews.sql';
  const restoreFunctions = 'supabase/rollback/20261025161000_restore_legacy_stock_rpcs.sql';
  const snapshot = async () => ({
    columns: (await db.query("select column_name,data_type,is_nullable,column_default from information_schema.columns where table_schema='public' and table_name='reviews' order by ordinal_position")).rows,
    functions: (await db.query("select proname,pg_get_functiondef(oid) definition from pg_proc where pronamespace='public'::regnamespace and proname in ('deduct_ingredient_stock','process_order_stock') order by proname")).rows,
  });
  const before = await snapshot();
  await db.exec(sql('supabase/migrations/20261025160000_remove_unused_reviews.sql'));
  await db.exec(sql('supabase/migrations/20261025161000_remove_legacy_stock_rpcs.sql'));
  await db.exec(sql(restoreReviews));
  await db.exec(sql(restoreFunctions));
  assert.deepEqual(await snapshot(), before, 'Rollback restores backed-up columns/defaults and actual function definitions');
  const restoredGrants = (await db.query("select grantee,privilege_type,is_grantable from information_schema.role_table_grants where table_schema='public' and table_name='reviews' order by grantee,privilege_type")).rows;
  const backedUpGrants = schema.grants.filter(grant => grant.table_name === 'reviews')
    .map(({ grantee, privilege_type, is_grantable }) => ({ grantee, privilege_type, is_grantable }))
    .sort((a, b) => a.grantee.localeCompare(b.grantee) || a.privilege_type.localeCompare(b.privilege_type));
  assert.deepEqual(restoredGrants, backedUpGrants, 'Restored reviews grants match live backup');
  for (const fn of schema.functions.filter(fn => /^(deduct_ingredient_stock|process_order_stock)\(/.test(fn.name))) {
    const acl = (await db.query('select proacl::text[] acl from pg_proc where oid=$1::regprocedure', [fn.name])).rows[0].acl;
    assert.deepEqual([...acl].sort(), [...fn.acl].sort(), `${fn.name}: exact EXECUTE grants`);
  }
  assert.equal((await db.query("select relrowsecurity from pg_class where oid='reviews'::regclass")).rows[0].relrowsecurity, true);
  for (const name of [...tables, ...schema.views.map(view => view.viewname)]) {
    const restored = (await db.query(`select to_jsonb(t) as row from public.${quote(name)} t`)).rows.map(result => result.row);
    assert.equal(tableHash(name, restored), tableHash(name, rows[name]), `${name}: restored contents`);
    proof.tablesRestored[name] = { count: restored.length, normalizedSha256: tableHash(name, restored) };
  }
  proof.rollbackVerified = true;
  proof.constraintsValidated = constraints.length;
  proof.completed = new Date().toISOString();
  writeFileSync('.test-artifacts/clean-code-recovery-proof.json', JSON.stringify(proof, null, 2));
  console.log(`PASS: ${proof.filesVerified.length} backup checksums, ${tables.length} public tables and ${schema.views.length} views restored, ${constraints.length} constraints, exact targeted rollback definitions/grants/RLS`);
} finally {
  await db.close();
}
