'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {detailId,processDetailTypes}=require('../electron/monthlyWorkbookDetails.cjs');
const {syncOriginalPatch}=require('../electron/monthlyWorkbookSyncMetadata.cjs');
test('detail primary key never masquerades as master identity in an update snapshot',()=>{
  assert.equal(detailId({id:800,defect_type_id:7},'defect'),7);
  assert.equal(detailId({id:800},'defect'),null);
  assert.equal(detailId({id:7},'defect',{master:true}),7);
  const patch=syncOriginalPatch({defects:[{id:800,quantity:2},{id:801,defect_type_id:7,quantity:3}],deductions:[{id:900,hours:1}]});
  assert.deepEqual(patch.defects,[{defect_type_id:7,quantity:3}]);
  assert.deepEqual(patch.deductions,[]);
});
test('two explicit defect IDs with the same display label remain distinct',()=>{
  const types=processDetailTypes('GC',{defectTypes:[{id:7,code:'CAT10',name:'Khác'},{id:8,code:'LONG08',name:'Khác'}],reports:[]},'defectTypes','defects','defect');
  assert.ok(types.some(x=>x.aliases.includes('id:7')&&!x.aliases.includes('id:8')));
  assert.ok(types.some(x=>x.aliases.includes('id:8')&&!x.aliases.includes('id:7')));
});
