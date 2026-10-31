// Explicit, guarded remote application. Default mode is read-only preflight.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { native,privateRoot } from './feature-postgres-local.mjs';
import { remoteConnection } from './feature-remote-connection.mjs';
const mode=process.argv[2]??'preflight';
assert.ok(['preflight','apply'].includes(mode));
const read=name=>JSON.parse(fs.readFileSync(path.join(privateRoot,name),'utf8'));
const checksum=bytes=>createHash('sha256').update(bytes).digest('hex');
const names=['20261031000000_item_payments','20261031010000_optional_members'];
const proof=read('postgres-concurrency.json');
assert.ok(proof.allPassed&&proof.lockWaitObserved&&proof.backendPids.length>=2);
assert.ok(proof.checks.includes('legacy-full-payment-rpc-response-compatible'));
assert.ok(proof.checks.includes('rollback-refuses-new-transaction-history'));
assert.ok(read('restore-verification.json').dataAndSequencesMatch);
assert.ok(read('migration-rehearsal.json').rollbackSchemaAndFunctions);
for(const [file,entry] of Object.entries(read('manifest.json').files)) assert.equal(checksum(fs.readFileSync(path.join(privateRoot,file))),entry.sha256,'Backup checksum mismatch');
const migrations=names.map(name=>{
  const bytes=fs.readFileSync(`supabase/migrations/${name}.sql`);
  assert.equal(checksum(bytes),proof.testedMigrationSha256[name],`Untested migration changes: ${name}`);
  return {name,version:name.slice(0,14),source:bytes.toString('utf8')};
});
const env=await remoteConnection();
async function remoteFile(file) {
  return JSON.parse((await native('psql',['-X','-qAt','-v','ON_ERROR_STOP=1','-c','set role postgres','-f',file],{env})).stdout.trim());
}
assert.deepEqual(await remoteFile('supabase/feature-data-fingerprint.sql'),read('data-before.private.json'),'Remote data/sequences changed since backup verification; make and rehearse a fresh backup');
assert.deepEqual(await remoteFile('supabase/feature-schema-audit.sql'),read('schema-before.private.json'),'Remote schema changed since rehearsal');
const history=JSON.parse((await native('psql',['-X','-qAt','-v','ON_ERROR_STOP=1','-c',"set role postgres;select jsonb_agg(version order by version) from supabase_migrations.schema_migrations"],{env})).stdout.trim());
const localVersions=fs.readdirSync('supabase/migrations').filter(name=>name.endsWith('.sql')).map(name=>name.slice(0,14)).sort();
assert.deepEqual(history,localVersions.filter(version=>!migrations.some(m=>m.version===version)),'Unexpected migration history');
const result={at:new Date().toISOString(),mode,migrations:names,backupChecksumsVerified:true,backupDataAndSchemaStillCurrent:true,historyBefore:history.length};
if(mode==='apply') {
  const quote=value=>`'${value.replaceAll("'","''")}'`;
  const statements=['set role postgres;','begin;','set local lock_timeout=\'5s\';',
    'lock table public.orders,public.order_items,public.payments in access exclusive mode;'];
  for(const migration of migrations) {
    statements.push(migration.source.replace(/^\uFEFF?begin;\s*/i,'').replace(/^begin;\s*/i,'').replace(/commit;\s*$/i,''));
    statements.push(`insert into supabase_migrations.schema_migrations(version,name,statements) values(${quote(migration.version)},${quote(migration.name.slice(15))},array[${quote(migration.source)}]::text[]);`);
  }
  statements.push("notify pgrst, 'reload schema';",'commit;');
  const file=path.join(privateRoot,'apply.private.sql');
  fs.writeFileSync(file,statements.join('\n'));
  try {
    await native('psql',['-X','-q','-v','ON_ERROR_STOP=1','-f',file],{env});
  } catch(error) {
    fs.writeFileSync(path.join(privateRoot,'apply-error.private.log'),error.stderr??error.message);
    throw Error('Remote application failed; inspect private log and re-read schema/history before retrying');
  }
  result.appliedAtomicallyWithHistory=true;
}
fs.writeFileSync(path.join(privateRoot,`remote-${mode}.json`),JSON.stringify(result,null,2));
console.log(JSON.stringify(result));
