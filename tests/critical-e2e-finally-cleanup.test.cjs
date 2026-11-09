'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.resolve(__dirname,'../scripts/zero-cost/critical-e2e.cjs'),'utf8');
const start=source.indexOf('async function cleanupRun(db)');
const end=source.indexOf('async function main()',start);
assert.ok(start>=0&&end>start);
function makeCleanup(env={}){
  const context={process:{env},runId:'KTC_E2E_LOCAL_TEST',console:{warn(){},error(){}}};
  vm.runInNewContext(source.slice(start,end)+';this.cleanup=cleanupRun;',context);
  return context.cleanup;
}
test('cleanup attempts all tables and rejects when one DELETE fails',async()=>{
  const tables=[];
  const db={async query(sql,args){
    if(sql.includes('information_schema.tables'))return [[{n:1}]];
    tables.push(sql);
    if(sql.includes('production_reports_temp'))throw Error('injected failure');
    return [{affectedRows:1}];
  }};
  await assert.rejects(makeCleanup()(db),/cleanup failed for 1 table/);
  assert.equal(tables.length,3);
});
test('cleanup explicitly retained only with KEEP_DATA flag',async()=>{
  let called=0;
  await makeCleanup({KTC_E2E_KEEP_DATA:'1'})({async query(){called++;}});
  assert.equal(called,0);
});
test('main finally closes connection, writes partial artifacts and fails closed',()=>{
  const main=source.slice(end);
  assert.match(main,/finally\s*\{/);
  assert.match(main,/try\s*\{\s*await cleanupRun\(db\)/);
  assert.match(main,/try\s*\{\s*await db\.end\(\)/);
  assert.match(main,/executionError:executionError\?\.message/);
  assert.match(main,/new AggregateError/);
  assert.match(main,/rows\.length===24/);
});
