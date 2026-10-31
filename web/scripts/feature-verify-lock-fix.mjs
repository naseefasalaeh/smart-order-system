import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {privateRoot,native} from './feature-postgres-local.mjs';
import {remoteConnection} from './feature-remote-connection.mjs';
const read=name=>JSON.parse(fs.readFileSync(path.join(privateRoot,name),'utf8'));
const before=read('schema-final.private.json'),after=read('schema-after-lock-fix.private.json');
for(const key of Object.keys(before))if(key!=='functions')assert.deepEqual(after[key],before[key],`Unexpected schema change: ${key}`);
for(const fn of before.functions){
 const expected=/^(public\.)?review_member_device\(/.test(fn.name)?{...fn,definition:fn.definition.replace('where id=v_member for update;','where id=v_member for no key update;')}:fn;
 assert.deepEqual(after.functions.find(row=>row.name===fn.name),expected,'Only recovery row lock may change');
}
const dataBefore=read('data-final.private.json'),dataAfter=read('data-after-lock-fix.private.json');
assert.deepEqual(dataAfter.sequences,dataBefore.sequences);
for(const [table,entry]of Object.entries(dataBefore.tables))if(table!=='supabase_migrations.schema_migrations')assert.deepEqual(dataAfter.tables[table],entry,`Unexpected data change: ${table}`);
assert.equal(dataAfter.tables['supabase_migrations.schema_migrations'].count,31);
const output=await native('psql',['-X','-qAt','-v','ON_ERROR_STOP=1','-c',`set role postgres;set timezone='UTC';select md5(coalesce(string_agg(to_jsonb(t)::text,E'\\n' order by to_jsonb(t)::text collate "C"),'')) from supabase_migrations.schema_migrations t where version<>'20261101000000'`],{env:await remoteConnection()});
assert.equal(output.stdout.trim(),dataBefore.tables['supabase_migrations.schema_migrations'].md5);
const result={at:new Date().toISOString(),onlyRecoveryLockDefinitionChanged:true,permissionsAndOtherSchemaUnchanged:true,allOriginalDataAndSequencesPreserved:true,migrationHistoryCount:31};
fs.writeFileSync(path.join(privateRoot,'lock-fix-verification.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
