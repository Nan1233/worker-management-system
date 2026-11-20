'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const v = require('../electron/excelDbSyncValues.cjs');
const { _private: publicCompat } = require('../electron/excelDbSync.cjs');

test('Excel sync reader preserves its existing private normalization API', () => {
  for(const key of ['normalizeEditable','comparable','stableValue','same',
    'normalizeDetailList','mergeEditableDetails','fieldValue',
    'normalizeOperationMode','normalizeOperationType','excelDateToIso']) {
    assert.strictEqual(publicCompat[key],v[key],key);
  }
  const source=fs.readFileSync(path.join(__dirname,'../electron/excelDbSync.cjs'),'utf8');
  assert.match(source,/require\('\.\/excelDbSyncValues\.cjs'\)/);
  assert.match(source,/_KTC_SYNC/);
  assert.match(source,/expected_updated_at/);
  assert.match(source,/EXCEL_SYNC_ROW_IDENTITY_MISMATCH/);
  assert.match(source,/if \(!preview\.length\) continue/);
});

test('formula cache, date, localized operation and numeric formatting retain original behavior', () => {
  assert.equal(v.asText({result:{text:'  Máy  '}}),'Máy');
  assert.equal(v.asNumber({result:'12.5'}),12.5);
  assert.equal(v.asInteger({result:'1.5'}),2);
  assert.equal(v.asNumber('broken'),0);
  assert.equal(v.normalizeOperationMode(' máy '),'MACHINE');
  assert.equal(v.normalizeOperationMode('THỦ CÔNG'),'MANUAL');
  assert.equal(v.normalizeOperationType('cắt'),'CUT');
  assert.equal(v.normalizeOperationType('Lồng'),'NEST');
  assert.equal(v.normalizeOperationMode(''),null);
  assert.equal(v.excelDateToIso('20/11/2026'),'2026-11-20');
  assert.equal(v.excelDateToIso('2026-11-20 08:00'),'2026-11-20');
  assert.equal(v.excelDateToIso(new Date(2026,10,20)),'2026-11-20');
  assert.equal(v.excelDateToIso('not-a-date'),null);
});

test('DB details with no Excel column survive; mapped blanks and zero clear only that ID', () => {
  const originals=[{defect_type_id:7,quantity:4},{defect_type_id:2,quantity:10}];
  const columns=[{key:'defect:7',typeId:'7'}];
  const result=v.mergeEditableDetails({'defect:7':'0'},columns,'defect:',originals,'defect_type_id','quantity',true);
  assert.deepEqual(result,[{defect_type_id:2,quantity:10}]);
  assert.deepEqual(v.mergeEditableDetails({'defect:7':''},columns,'defect:',originals,'defect_type_id','quantity',true),result);
  assert.deepEqual(v.mergeEditableDetails({'defect:7':'5'},columns,'defect:',originals,'defect_type_id','quantity',true),
    [{defect_type_id:2,quantity:10},{defect_type_id:7,quantity:5}]);
  assert.deepEqual(originals,[{defect_type_id:7,quantity:4},{defect_type_id:2,quantity:10}]);
});
test('invalid NG and deduction cells fail closed without erasing saved DB detail', () => {
  const ngColumns=[{key:'defect:3',typeId:3}];
  for(const raw of ['abc','-1','1.5',Infinity]) {
    assert.throws(()=>v.mergeEditableDetails({'defect:3':raw},ngColumns,'defect:',[],
      'defect_type_id','quantity',true),error=>
        error.code==='EXCEL_SYNC_INVALID_DETAIL_VALUE'&&error.details.column==='defect:3');
  }
  const deductions=[{key:'deduction:11',typeId:11}];
  assert.deepEqual(v.mergeEditableDetails({'deduction:11':'0.5'},deductions,'deduction:',[],
    'deduction_type_id','hours',false),[{deduction_type_id:11,hours:0.5}]);
  assert.throws(()=>v.mergeEditableDetails({'deduction:11':'-0.1'},deductions,'deduction:',[],
    'deduction_type_id','hours',false),error=>error.code==='EXCEL_SYNC_INVALID_DETAIL_VALUE');
});

test('normalized edit detects machine-mode OK, time, NG and deduction changes too', () => {
  const current={workDate:'20/11/2026',shift:'B',operationType:'CẮT',operationMode:'MÁY',
    machine:'GC05',product:'SP01',training:0.8,actualTime:7.5,ok:'40',note:' ghi chú ',
    'defect:4':3,'deduction:7':0.5};
  const columns=[{key:'defect:4',typeId:4},{key:'deduction:7',typeId:7}];
  const value=v.normalizeEditable(current,columns,'MACHINE',{
    defects:[{defect_type_id:9,quantity:2}],deductions:[{deduction_type_id:11,hours:1}],
  });
  assert.equal(value.operation_mode,'MACHINE');
  assert.equal(value.operation_type,'CUT');
  assert.equal(value.training_percent,80);
  assert.equal(value.actual_time,7.5);
  assert.equal(value.tt_ok,40);
  assert.deepEqual(value.defects,[{defect_type_id:4,quantity:3},{defect_type_id:9,quantity:2}]);
  assert.deepEqual(value.deductions,[{deduction_type_id:7,hours:0.5},{deduction_type_id:11,hours:1}]);
  assert.equal(value.note,'ghi chú');
});

test('deep comparison ignores key order and reconciles type IDs in canonical sequence', () => {
  assert.equal(v.same({b:{d:2,c:1},a:7},{a:7,b:{c:1,d:2}}),true);
  assert.equal(v.same([{a:1},{b:2}],[{b:2},{a:1}]),false);
  assert.deepEqual(v.fieldValue('defects',[{defect_type_id:'7',quantity:'2'},{defect_type_id:3,quantity:1}]),
    [{defect_type_id:3,quantity:1},{defect_type_id:7,quantity:2}]);
  const first={note:'A',defects:[{defect_type_id:7,quantity:'2'},{defect_type_id:3,quantity:1}]};
  const second={defects:[{defect_type_id:3,quantity:1},{defect_type_id:7,quantity:2}],note:'A'};
  assert.equal(v.same(v.comparable(first),v.comparable(second)),true);
});
