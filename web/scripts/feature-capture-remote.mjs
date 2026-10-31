// Read-only inventory and data fingerprints. Never prints definitions or rows.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {native,privateRoot} from './feature-postgres-local.mjs';
import {remoteConnection} from './feature-remote-connection.mjs';
const phase=process.argv[2];
if(!/^[a-z-]+$/.test(phase??''))throw Error('A named capture phase is required');
const env=await remoteConnection();
const saved=[];
for(const [name,file] of [['schema','supabase/feature-schema-audit.sql'],['data','supabase/feature-data-fingerprint.sql']]) {
  const target=path.join(privateRoot,`${name}-${phase}.private.json`);
  if(fs.existsSync(target))throw Error('Refusing to overwrite earlier audit');
  const {stdout}=await native('psql',['-X','-qAt','-v','ON_ERROR_STOP=1','-c','set role postgres','-f',file],{env});
  const json=JSON.parse(stdout.trim());
  fs.writeFileSync(target,JSON.stringify(json,null,2));
  saved.push({file:path.basename(target),sha256:createHash('sha256').update(fs.readFileSync(target)).digest('hex')});
}
const summary={phase,at:new Date().toISOString(),files:saved};
fs.writeFileSync(path.join(privateRoot,`capture-${phase}.json`),JSON.stringify(summary,null,2));
console.log(JSON.stringify(summary));
