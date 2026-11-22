import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { native, privateRoot, state } from './feature-postgres-local.mjs';
import { remoteConnection } from './feature-remote-connection.mjs';
const fingerprint = path.resolve('supabase/feature-data-fingerprint.sql');
const label=process.argv[2];
if(label&&!/^[a-z0-9-]+$/.test(label))throw Error('Invalid verification label');
const proofRoot=path.join(privateRoot,label??'.');
const remoteEnv = await remoteConnection();
const args = ['-X','-qAt','-v','ON_ERROR_STOP=1','-c','set role postgres','-f',fingerprint];
const [remote, local] = await Promise.all([
  native('psql', args, { env: remoteEnv }),
  native('psql', [...args,'-d',state().database]),
]);
const before=JSON.parse(remote.stdout.trim()),restored=JSON.parse(local.stdout.trim());
fs.writeFileSync(path.join(proofRoot,'remote-fingerprint-before.private.json'),JSON.stringify(before,null,2));
fs.writeFileSync(path.join(proofRoot,'restored-fingerprint.private.json'),JSON.stringify(restored,null,2));
assert.deepEqual(restored,before,'Restored table/sequence fingerprints differ from current remote; do not apply migrations');
const result={at:new Date().toISOString(),tables:Object.keys(before.tables).length,sequences:Object.keys(before.sequences).length,dataAndSequencesMatch:true};
fs.writeFileSync(path.join(proofRoot,'restore-verification.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify(result));
