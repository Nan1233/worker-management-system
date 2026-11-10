'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.resolve(__dirname,'../scripts/zero-cost/critical-e2e.cjs'),'utf8');
test('critical E2E direct TiDB connection requires certificate-verified TLS',()=>{
  const match=source.match(/const dbCfg=([^;]+);/);
  assert.ok(match,'DB config must be present');
  const dbCfg=vm.runInNewContext('('+match[1]+')',{process:{env:{DB_HOST:'localhost',DB_USER:'test',DB_PASSWORD:'test',DB_NAME:'worker_management_e2e'}}});
  assert.equal(dbCfg.ssl.rejectUnauthorized,true);
});
