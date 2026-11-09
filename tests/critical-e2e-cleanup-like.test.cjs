'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.resolve(__dirname,'../scripts/zero-cost/critical-e2e.cjs'),'utf8');
const start=source.indexOf('async function cleanupRun(db)');
const end=source.indexOf('async function verifyWriterDatabaseSession(db)',start);
assert.ok(start>=0&&end>start);
test('cleanup escapes SQL LIKE wildcards in run marker and uses explicit escape clause',async()=>{
 const runId='KTC_E2E_LOCAL_%!_a';
 const context={process:{env:{}},runId,console:{warn(){},error(){}}};
 vm.runInNewContext(source.slice(start,end)+';this.cleanup=cleanupRun;',context);
 const seen=[];
 const db={async query(sql,args){if(sql.includes('information_schema.tables'))return [[{n:1}]];seen.push({sql,args});return [{affectedRows:0}];}};
 await context.cleanup(db);
 assert.equal(seen.length,3);
 for(const {sql,args} of seen){
   assert.match(sql,/LIKE \? ESCAPE '!'/);
   assert.equal(args[0],'%KTC!_E2E!_LOCAL!_!%!!!_a%');
 }
});
