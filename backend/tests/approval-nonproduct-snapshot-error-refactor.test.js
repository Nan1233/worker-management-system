'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../models/productionTempApprovalModel.js'),'utf8');
const start=source.indexOf('function hasNonProductSnapshotMismatch(');
const end=source.indexOf('// Keep standard resolver warm-up input',start);
assert.ok(start>=0&&end>start);
const ctx={};
vm.runInNewContext(source.slice(start,end),ctx);
const create=vm.runInNewContext('createNonProductSnapshotMismatchError',ctx);
const assertSnapshot=vm.runInNewContext('assertNonProductWorkSnapshot',ctx);
test('shared nonproduct mismatch error retains 422 public contract',()=>{
 const error=create('custom');
 assert.equal(error.message,'custom');
 assert.equal(error.status,422);
 assert.equal(error.code,'NON_PRODUCT_WORK_SNAPSHOT_MISMATCH');
 assert.equal(error.isPublic,true);
});
test('parent nonproduct mismatch retains original localized error',()=>{
 assert.throws(()=>assertSnapshot({standard_output:1}),e=>e.message==='Ảnh chụp công việc khác trong công đoạn không hợp lệ; cần kiểm tra lại báo cáo'&&e.status===422&&e.code==='NON_PRODUCT_WORK_SNAPSHOT_MISMATCH');
});
test('zero standard fields remain valid for parent nonproduct work',()=>{
 assert.doesNotThrow(()=>assertSnapshot({standard_output:0,standard_version_id:null,machine_standard_id:0}));
});
test('resolved nonproduct branch preserves separate localized message and shared error helper',()=>{
 const flow=source.slice(source.indexOf('async function validateApprovalSnapshot('),source.indexOf('// Keep the approved v1 legacy snapshot payload'));
 assert.match(flow,/createNonProductSnapshotMismatchError\("Ảnh chụp công việc khác không hợp lệ; cần kiểm tra lại báo cáo"\)/);
 assert.match(flow,/if \(hasNonProductSnapshotMismatch\(item\)\)/);
 assert.match(flow,/assertStandardSnapshotConsistency\(buildStandardSnapshotConsistencyInput\(item, resolved\)\)/);
});
