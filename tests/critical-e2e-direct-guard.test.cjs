'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const script=path.resolve(__dirname,'../scripts/zero-cost/critical-e2e.cjs');
function run(url,dbName='production') {
  return spawnSync(process.execPath,[script],{
    encoding:'utf8',
    env:{...process.env,LOCAL_BACKEND_URL:url,DB_NAME:dbName,KTC_ZERO_COST_FIXTURE:'/does/not/exist.json'},
  });
}
test('direct critical E2E refuses non-local API before fixture or DB access',()=>{
  for(const url of ['https://ktc-be-test.nan978971.workers.dev','https://ktc-be.nan978971.workers.dev','https://example.org','invalid']){
    const r=run(url);
    assert.equal(r.status,2,url);
    assert.match(r.stderr,/KTC_CRITICAL_E2E_BLOCKED/,url);
    assert.doesNotMatch(r.stderr,/ENOENT/,url);
  }
});
test('direct critical E2E refuses wrong DB before fixture access',()=>{
  const r=run('http://127.0.0.1:19080','production');
  assert.equal(r.status,2);
  assert.match(r.stderr,/E2E REFUSED/);
  assert.doesNotMatch(r.stderr,/ENOENT/);
});
