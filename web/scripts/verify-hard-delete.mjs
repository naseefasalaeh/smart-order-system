// Read-only comparison against the pre-migration backup. New snapshots are checked separately.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
process.loadEnvFile('.env.local');
const root=process.argv[2];assert.ok(root,'Provide pre-migration backup directory');
const manifest=JSON.parse(readFileSync(`${root}/manifest.json`,'utf8'));
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))):item);
let checked=0;
for(const [table,entry] of Object.entries(manifest)){
  const content=readFileSync(`${root}/${table}.json`,'utf8');assert.equal(createHash('sha256').update(content).digest('hex'),entry.sha256,'Backup fingerprint mismatch');
  const before=JSON.parse(content);const rows=[];
  for(let offset=0;;offset+=1000){
    let q=db.from(table).select('*').order(table==='menu_ingredients'?'menu_id':table==='addon_ingredients'?'addon_id':'id');
    if(table==='menu_ingredients'||table==='addon_ingredients')q=q.order('ingredient_id');
    const {data,error}=await q.range(offset,offset+999);assert.ifError(error);rows.push(...data);if(data.length<1000)break;
  }
  assert.equal(rows.length,before.length,`${table}: count changed`);
  const columns=Object.keys(before[0]??{});
  const projected=rows.map(r=>Object.fromEntries(columns.map(c=>[c,r[c]])));
  assert.deepEqual(projected.map(canonical).sort(),before.map(canonical).sort(),`${table}: pre-existing data changed`);
  for(const row of rows){
    if(table==='order_items'){assert.ok(row.menu_name_snapshot);assert.equal(Number(row.menu_price_snapshot),Number(row.unit_price));assert.equal(row.menu_id_snapshot,row.menu_id);}
    if(table==='order_ingredient_usages'){assert.ok(row.ingredient_name_snapshot&&row.ingredient_unit_snapshot);assert.equal(row.ingredient_id_snapshot,row.ingredient_id);}
    if(table==='order_item_options')assert.equal(row.menu_option_id_snapshot,row.menu_option_id);
  }
  checked++;
}
console.log(`PASS ${checked} pre-migration table fingerprints/rows preserved; menu, option and ingredient snapshots complete`);
