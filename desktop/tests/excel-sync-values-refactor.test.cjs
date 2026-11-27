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

test('monthly Excel detail mapping uses normalized totals rather than stale source aliases', () => {
  const { detailValue, detailMap } = require('../electron/monthlyWorkbookDetails.cjs');
  const { mergeDefects, normalizeDeductions } = require('../electron/reportDetailNormalizer.cjs');
  const defects=mergeDefects({tt_ng:7},[
    {defect_type_id:4,defect_code:'CAT01',defect_quantity:3},
    {defect_type_id:4,defect_code:'CAT01',defect_quantity:4}
  ],[]);
  assert.equal(defects.length,1);
  assert.equal(detailValue(defects[0],'defect'),7);
  assert.equal(detailMap(defects,'defect').get('id:4'),7);
  const deductions=normalizeDeductions([
    {deduction_type_id:8,deduction_code:'GIAO_CA',deduction_hours:0.25},
    {deduction_type_id:8,deduction_code:'GIAO_CA',deduction_hours:0.5}
  ],{deduction_time:0.75},[],[]);
  assert.equal(deductions.length,1);
  assert.equal(detailValue(deductions[0],'deduction'),0.75);
  assert.equal(detailMap(deductions,'deduction').get('id:8'),0.75);
  assert.equal(detailValue({quantity:0,defect_quantity:4},'defect'),0);
  assert.equal(detailValue({hours:0,deduction_hours:1},'deduction'),0);
  assert.equal(detailValue({defect_quantity:3},'defect'),3);
  assert.equal(detailValue({deduction_hours:0.5},'deduction'),0.5);
});

test('bulk manual Excel sync requires a single-use preview of unchanged files and the same session', async()=>{
  const os=require('node:os');
  const {createExcelDbSyncController}=require('../electron/excelDbSyncController.cjs');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ktc-preview-'));
  const file=path.join(dir,'book.xlsx');
  fs.writeFileSync(file,'fixture');
  let posts=0;
  const change={id:7,expected_updated_at:'2026-11-01T00:00:00.000Z',patch:{tt_ok:5}};
  const controller=createExcelDbSyncController({
    authenticatedFetch:async(_url,opts)=>{
      posts++;
      const row=JSON.parse(opts.body).changes[0];
      return {status:200,json:async()=>({success:true,total:1,succeeded:1,failed:0,results:[{success:true,id:7,operation_id:row.operation_id,updated_at:'2026-11-01T00:01:00.000Z'}]})};
    },
    API_BASE_URL:'https://invalid.example/api',listExcelFiles:async()=>[file],getExportRoot:()=>dir,
    readExcelChanges:async()=>({managed:true,yearMonth:'2026-11',generatedAt:'test',changes:[change]}),
    writeLog:async()=>{},normalizeError:e=>({message:e.message}),waitForUsableRendererToken:async()=> 'local-test',
    sendRenderer:()=>{},enqueueManualExcelSync:async()=>({success:true}),isQuitting:()=>false,isSyncRunning:()=>false
  });
  const apply=owner=>controller.syncEditedExcelFilesToDb({source:'manual-db-sync',yearMonth:'2026-11',previewOwner:owner});
  const preview=()=>controller.previewEditedExcelFilesToDb({yearMonth:'2026-11',previewOwner:'owner-a'});
  try{
    await assert.rejects(apply('owner-a'),{code:'KTC_EXCEL_PREVIEW_REQUIRED'});
    await preview();
    await assert.rejects(apply('owner-b'),{code:'KTC_EXCEL_PREVIEW_REQUIRED'});
    await preview();
    fs.appendFileSync(file,'new');
    await assert.rejects(apply('owner-a'),{code:'KTC_EXCEL_PREVIEW_REQUIRED'});
    assert.equal(posts,0);
    assert.equal((await preview()).detected,1);
    const result=await apply('owner-a');
    assert.equal(result.succeeded,1);
    assert.equal(posts,1);
    await assert.rejects(apply('owner-a'),{code:'KTC_EXCEL_PREVIEW_REQUIRED'});
    assert.equal(posts,1);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
