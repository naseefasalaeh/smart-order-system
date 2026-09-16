// Run only for an explicitly authorized account. Uses server credentials, not user metadata.
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
process.loadEnvFile('.env.local');
const email=process.argv[2];
assert.ok(email&&email.includes('@'),'Provide the authorized email');
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const matches=[];
for(let page=1;;page++){
  const {data,error}=await db.auth.admin.listUsers({page,perPage:100});assert.ifError(error);
  matches.push(...data.users.filter(u=>u.email?.toLowerCase()===email.toLowerCase()));
  if(data.users.length<100)break;
}
assert.equal(matches.length,1,'Expected exactly one existing account; no account will be created');
const {data:before,error:readError}=await db.from('profiles').select('id,role').eq('id',matches[0].id).single();assert.ifError(readError);
const {data:after,error}=await db.from('profiles').update({role:'admin'}).eq('id',before.id).eq('role',before.role).select('role').single();assert.ifError(error);assert.equal(after.role,'admin');
console.log(JSON.stringify({email,previousRole:before.role,role:after.role}));
