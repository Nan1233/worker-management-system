'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const guard=fs.readFileSync(path.resolve(__dirname,'../backend/scripts/e2e-db-guard.cjs'),'utf8');
const e2e=fs.readFileSync(path.resolve(__dirname,'../scripts/zero-cost/critical-e2e.cjs'),'utf8');
test('DB guard uses the same configurable port as E2E writer',()=>{
  assert.match(guard,/port:\s*Number\(process\.env\.DB_PORT\s*\|\|\s*3306\)/);
  assert.match(e2e,/port:Number\(process\.env\.DB_PORT\|\|3306\)/);
});
test('each E2E run uses a cryptographically unique cleanup marker',()=>{
  const match=e2e.match(/const runId=([^;]+);/);
  assert.ok(match);
  const crypto=require('node:crypto');
  const run=()=>vm.runInNewContext(match[1],{crypto,Date});
  const ids=new Set(Array.from({length:100},run));
  assert.equal(ids.size,100);
  for(const id of ids)assert.match(id,/^KTC_E2E_LOCAL_\d+_[a-f0-9]{32}$/);
});
