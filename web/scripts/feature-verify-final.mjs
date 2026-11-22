// Offline comparison of the immutable post-apply and final read-only captures.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {privateRoot} from './feature-postgres-local.mjs';
const read=name=>JSON.parse(fs.readFileSync(path.join(privateRoot,name),'utf8'));
const baseline=process.argv[2]??'after-apply',final=process.argv[3]??'final';
assert.match(baseline,/^[a-z-]+$/);assert.match(final,/^[a-z-]+$/);
assert.deepEqual(read(`schema-${final}.private.json`),read(`schema-${baseline}.private.json`),'Hosted smoke changed schema/permissions');
const before=read(`data-${baseline}.private.json`),after=read(`data-${final}.private.json`);
assert.deepEqual(after.tables,before.tables,'Hosted smoke left test rows or changed original table values');
const sequenceChanges=Object.keys(before.sequences).filter(name=>JSON.stringify(before.sequences[name])!==JSON.stringify(after.sequences[name]));
const result={at:new Date().toISOString(),baseline,final,schemaAndPermissionsUnchangedAfterSmoke:true,allTablesRestoredToPostApplyState:true,tableCount:Object.keys(after.tables).length,sequenceChanges,sequencesNotReset:true};
fs.writeFileSync(path.join(privateRoot,'final-verification.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
