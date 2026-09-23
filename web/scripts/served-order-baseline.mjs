import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { readFileSync,writeFileSync,readdirSync,mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
process.loadEnvFile('.env.local');
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const hash=x=>createHash('sha256').update(JSON.stringify(canonical(x))).digest('hex');
const checked=async p=>{const r=await p;if(r.error)throw Error(r.error.message);return r.data;};
export async function capture(reference, exclude = () => false) {
 const response=await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`,{headers:{apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`}});
 assert.ok(response.ok);const schema=await response.json();
 const result={at:new Date().toISOString(),tables:{},authUsers:null,migrations:{}};
 for(const table of Object.keys(schema.paths).filter(p=>/^\/\w+$/.test(p)).map(p=>p.slice(1)).sort()){
  const props=schema.definitions[table].properties;
  const columns=reference?.tables[table]?.columns??Object.keys(props);
  const pk=Object.entries(props).filter(([,v])=>v.description?.includes('<pk/>')).map(([k])=>k);
  const keys=pk.length?pk:Object.entries(props).filter(([,v])=>['integer','number','string','boolean'].includes(v.type)).map(([k])=>k);
  assert.ok(keys.length);const rows=[];
  for(let offset=0;;offset+=500){let q=db.from(table).select(columns.join(','));for(const k of keys)q=q.order(k);const page=await checked(q.range(offset,offset+499));rows.push(...page);if(page.length<500)break;}
  const retained=rows.filter(row=>!exclude(table,row));
  result.tables[table]={columns,count:retained.length,sha256:hash(retained.map(canonical).map(x=>JSON.stringify(x)).sort()),rows:retained};
 }
 const users=[];for(let page=1;;page++){const data=await checked(db.auth.admin.listUsers({page,perPage:500}));users.push(...data.users);if(data.users.length<500)break;}
 const retainedUsers=users.filter(user=>!exclude('authUsers',user));
 result.authUsers={count:retainedUsers.length,sha256:hash(retainedUsers.sort((a,b)=>a.id.localeCompare(b.id))),ids:retainedUsers.map(u=>u.id)};
 for(const file of readdirSync('supabase/migrations').sort())result.migrations[file]=hash(readFileSync(`supabase/migrations/${file}`,'utf8'));
 return result;
}
export function compare(before,after){
 const changes=Object.keys(before.tables).filter(t=>before.tables[t].sha256!==after.tables[t]?.sha256);
 if(before.authUsers.sha256!==after.authUsers.sha256)changes.push('authUsers');
 if(JSON.stringify(before.migrations)!==JSON.stringify(after.migrations))changes.push('localMigrationFiles');
 assert.deepEqual(changes,[],'STOP: existing data or migration file changed; no automatic repair');
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/served-order-baseline.mjs')){
 const dir='.test-artifacts/served-orders/live';mkdirSync(dir,{recursive:true});
 const mode=process.argv[2]??'before';assert.match(mode,/^[a-z-]+$/);
 const before=mode==='before'?null:JSON.parse(readFileSync(`${dir}/before.json`,'utf8'));
 const after=await capture(before);writeFileSync(`${dir}/${mode}.json`,JSON.stringify(after,null,2));
 if(before)compare(before,after);
 console.log(JSON.stringify({mode,tables:Object.keys(after.tables).length,orders:after.tables.orders.count,authUsers:after.authUsers.count,match:before?true:null}));
}
