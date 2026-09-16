// Read-only remote backup. Secrets and customer data never go to console or Git.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
process.loadEnvFile('.env.local');
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const root = `.test-artifacts/catalog-backup-${new Date().toISOString().replace(/[:.]/g, '-')}`;
mkdirSync(root, { recursive: true });
const tables = ['categories','ingredient_categories','menus','ingredients','menu_ingredients','menu_option_groups','menu_options','menu_option_ingredients','addons','addon_ingredients','orders','order_items','order_item_options','order_ingredient_usages','payments','restaurant_tables','dining_sessions','profiles','reviews'];
const manifest = {};
for (const table of tables) {
  const rows = [];
  for (let offset = 0;; offset += 1000) {
    let q = db.from(table).select('*').order(table === 'menu_ingredients' ? 'menu_id' : table === 'addon_ingredients' ? 'addon_id' : 'id');
    if (table === 'menu_ingredients' || table === 'addon_ingredients') q = q.order('ingredient_id');
    const { data, error } = await q.range(offset, offset + 999);
    if (error) throw new Error(`${table}: ${error.code}`);
    rows.push(...data);
    if (data.length < 1000) break;
  }
  const json = JSON.stringify(rows, null, 2);
  writeFileSync(`${root}/${table}.json`, json);
  manifest[table] = { count: rows.length, sha256: createHash('sha256').update(json).digest('hex') };
}
const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, { headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` } });
if (!response.ok) throw new Error(`Schema read: ${response.status}`);
writeFileSync(`${root}/openapi.json`, JSON.stringify(await response.json(), null, 2));
writeFileSync(`${root}/manifest.json`, JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ backup: root, tables: Object.fromEntries(Object.entries(manifest).map(([k,v]) => [k,v.count])) }, null, 2));
