// Read-only remote backup. Secrets and customer data never go to console or Git.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
process.loadEnvFile('.env.local');
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const root = `.test-artifacts/catalog-backup-${new Date().toISOString().replace(/[:.]/g, '-')}`;
mkdirSync(root, { recursive: true });
const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, { headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` } });
if (!response.ok) throw new Error(`Schema read: ${response.status}`);
const schema = await response.json();
// Discover exposed tables/views so new tables are included and retired ones
// disappear naturally. RPC paths are excluded; this script never calls them.
const tables = Object.keys(schema.paths)
  .filter(path => /^\/\w+$/.test(path))
  .map(path => path.slice(1))
  .sort();
const manifest = {};
for (const table of tables) {
  const columns = Object.entries(schema.definitions[table].properties);
  const primaryKeys = columns.filter(([, column]) => column.description?.includes('<pk/>'));
  const sortColumns = primaryKeys.length ? primaryKeys : columns.filter(([, column]) =>
    ['integer', 'number', 'string', 'boolean'].includes(column.type));
  if (!sortColumns.length) throw new Error(`${table}: no stable pagination columns`);
  const rows = [];
  for (let offset = 0;; offset += 1000) {
    let q = db.from(table).select('*');
    for (const [column] of sortColumns) q = q.order(column);
    const { data, error } = await q.range(offset, offset + 999);
    if (error) throw new Error(`${table}: ${error.code}`);
    rows.push(...data);
    if (data.length < 1000) break;
  }
  const json = JSON.stringify(rows, null, 2);
  writeFileSync(`${root}/${table}.json`, json);
  manifest[table] = { count: rows.length, sha256: createHash('sha256').update(json).digest('hex') };
}
writeFileSync(`${root}/openapi.json`, JSON.stringify(schema, null, 2));
writeFileSync(`${root}/manifest.json`, JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ backup: root, tables: Object.fromEntries(Object.entries(manifest).map(([k,v]) => [k,v.count])) }, null, 2));
