'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.resolve(__dirname,'../scripts/performanceLargeData.cjs'),'utf8');
test('performance load test refuses to run without isolated DB guard',()=>{
 assert.match(source,/spawnSync\(process\.execPath/);
 assert.match(source,/e2e-db-guard\.cjs/);
 assert.match(source,/guard\.error\|\|guard\.status!==0/);
 assert.ok(source.indexOf('guard=spawnSync')<source.indexOf('mysql.createConnection'));
});
test('performance connection requires TLS and verifies active E2E database',()=>{
 assert.match(source,/ssl:\{rejectUnauthorized:true\}/);
 assert.match(source,/port:Number\(process\.env\.DB_PORT\|\|3306\)/);
 assert.match(source,/SELECT DATABASE\(\) AS database_name/);
 assert.match(source,/worker_management_e2e/);
 assert.ok(source.indexOf('SELECT DATABASE() AS database_name')<source.indexOf('for(const [name,sql]'));
});
