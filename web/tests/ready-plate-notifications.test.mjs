import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import vm from 'node:vm';
function module(path, imports={}) {
  const exports={};
  vm.runInNewContext(ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:name=>imports[name]});
  return exports;
}
const progress=module('src/lib/plate-progress.ts');
const {collectNewReadyPlates:collect}=module('src/lib/ready-plate-notifications.ts',{'./plate-progress':progress});
test('ready plate baselines, batching, repeated polls, serving and reconnects',()=>{
  const seen=new Set();
  const orders=(completed,served=[])=>[{id:'order',order_items:[{id:1,quantity:3,completed_plates:completed,served_plates:served}]}];
  assert.equal(collect(orders([1]),seen,true).length,0);
  assert.equal(collect(orders([1]),seen,false).length,0);
  assert.equal(collect(orders([1,2,3]),seen,false).length,2);
  assert.equal(collect(orders([1,2,3]),seen,false).length,0);
  collect([],seen,false);
  assert.equal(collect(orders([1,2,3],[1]),seen,false).length,0);
  assert.equal(collect(orders([1,2,3]),seen,false).length,0);
  const newTab=new Set();
  assert.equal(collect(orders([1,2,3]),newTab,true).length,0);
});
test('phone normalization rejects malformed and non-mobile numbers',()=>{
  const {normalizePhone}=module('src/lib/member-input.ts');
  assert.equal(normalizePhone('081-234-5678'),'+66812345678');
  assert.equal(normalizePhone('+66 81 234 5678'),'+66812345678');
  for (const input of ['021234567','08123456789','081abc2345678','+1 1234567890',null,123]) assert.equal(normalizePhone(input),null);
});
