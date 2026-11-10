'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../models/productionTempApprovalModel.js'),'utf8');
const start=source.indexOf('async function rollbackReviewTransaction(');
const end=source.indexOf('function createReviewTransitionConflictError(',start);
assert.ok(start>=0&&end>start);
function harness(rollbackResult){
 const calls=[],logs=[];
 const ctx={rollback:async connection=>{calls.push(connection);return rollbackResult;},console:{error:message=>logs.push(message)}};
 vm.runInNewContext(source.slice(start,end),ctx);
 return {run:vm.runInNewContext('rollbackReviewTransaction',ctx),calls,logs};
}
test('successful rollback preserves original error and does not log',async()=>{
 const h=harness({ok:true}),connection={},error=new Error('original');
 await h.run(connection,error);
 assert.deepEqual(h.calls,[connection]);assert.deepEqual(h.logs,[]);
 assert.equal(error.message,'original');assert.equal(error.rollbackError,undefined);
});
test('rollback failure attaches cause and logs message without replacing original error',async()=>{
 const rollbackError=new Error('connection lost'),h=harness({ok:false,error:rollbackError}),error=new Error('original');
 await h.run({},error);
 assert.strictEqual(error.rollbackError,rollbackError);
 assert.equal(error.message,'original');
 assert.deepEqual(h.logs,['[KTC][APPROVAL_ROLLBACK_FAILED] connection lost']);
});
test('rollback failure with non Error value preserves legacy fallback',async()=>{
 const h=harness({ok:false,error:'network unavailable'}),error=new Error('original');
 await h.run({},error);
 assert.equal(error.rollbackError,'network unavailable');
 assert.deepEqual(h.logs,['[KTC][APPROVAL_ROLLBACK_FAILED] network unavailable']);
});
test('rollback throwing preserves original error and attaches rollback cause',async()=>{
 const rollbackError=new Error('rollback rejected'),original=new Error('approval failed');
 const logs=[],connection={};
 const ctx={rollback:async c=>{assert.strictEqual(c,connection);throw rollbackError;},console:{error:x=>logs.push(x)}};
 vm.runInNewContext(source.slice(start,end),ctx);
 const run=vm.runInNewContext('rollbackReviewTransaction',ctx);
 await assert.doesNotReject(run(connection,original));
 assert.strictEqual(original.rollbackError,rollbackError);
 assert.equal(original.message,'approval failed');
 assert.deepEqual(logs,['[KTC][APPROVAL_ROLLBACK_FAILED] rollback rejected']);
});

test('both review paths call rollback helper, rethrow and release connection',()=>{
 for(const method of ['async approveSelected(','async rejectSelected(']){
  const start=source.indexOf(method),end=source.indexOf('async ',start+10);
  const flow=source.slice(start,end<0?undefined:end);
  assert.match(flow,/catch \(error\) \{\s*if \(ownsTransaction\) await rollbackReviewTransaction\(connection, error\);\s*throw error;\s*\} finally \{\s*if \(ownsTransaction\) connection\.release\(\)/);
 }
});
