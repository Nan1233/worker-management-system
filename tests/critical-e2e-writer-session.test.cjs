'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.resolve(__dirname,'../scripts/zero-cost/critical-e2e.cjs'),'utf8');
const begin=source.indexOf('async function verifyWriterDatabaseSession(db)');
const end=source.indexOf('async function main()',begin);
assert.ok(begin>=0&&end>begin);
const context={};
vm.runInNewContext(source.slice(begin,end)+';this.verify=verifyWriterDatabaseSession;',context);
const verify=context.verify;
test('writer connection rejects wrong actual database even when separate guard passed',async()=>{
  await assert.rejects(verify({query:async()=>[[{database_name:'worker_management'}]]}),/KTC_E2E_WRITER_BLOCKED/);
  await assert.rejects(verify({query:async()=>[[{database_name:''}]]}),/KTC_E2E_WRITER_BLOCKED/);
});
test('writer connection accepts isolated database',async()=>{
  let query;
  await verify({query:async(sql)=>{query=sql;return [[{database_name:'worker_management_e2e'}]];}});
  assert.equal(query,'SELECT DATABASE() AS database_name');
});
test('writer verification happens before any scenario and closes connection if blocked',()=>{
  const main=source.slice(end);
  const verifyAt=main.indexOf('await verifyWriterDatabaseSession(db)');
  const scenarioAt=main.indexOf('await tc(1,');
  assert.ok(verifyAt>=0&&scenarioAt>verifyAt);
  assert.match(main.slice(0,scenarioAt),/await db\.end\(\)/);
});
