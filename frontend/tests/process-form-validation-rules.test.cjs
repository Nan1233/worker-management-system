'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.join(__dirname, '../src/pages/worker');
const cache = new Map();
function load(name) {
  if (cache.has(name)) return cache.get(name);
  const source = fs.readFileSync(path.join(root, name + '.ts'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020
  } }).outputText;
  const mod = { exports: {} };
  cache.set(name, mod.exports);
  new Function('module','exports','require',code)(mod,mod.exports,(id) => {
    if (!id.startsWith('./')) throw Error('Unexpected runtime dependency: ' + id);
    return load(id.slice(2));
  });
  return mod.exports;
}
const r = load('processFormValidationRules');
const { validateMachineLines } = load('processPageValidation');
const form = {
  workDate:'2026-11-20', shift:'A', machineNo:'', otherNgName:'',otherDeductionName:'',
  actualTime:'8', actualMinutes:'0', deductionTime:'1', totalTime:'9',
  standardOutput:'100', actualOutput:'13', ttOk:'10', ttNg:'3', cat01:'3',
};
const options = [{key:'cat01', code:'CAT01'}];
const output = (f) => Number(f.ttOk || 0) + Number(f.cat01 || 0);
const line = {
  machineCode:'M01',productCode:'P01',hours:'8',minutes:'0',okQuantity:'10',
  ngQuantity:'3',defects:{cat01:'3'},selectedDefects:['cat01'],
  deductions:{giaoCa:'60'},selectedDeductions:['giaoCa'],
  otherNgName:'',otherDeductionName:''
};

test('shift validation accepts A/B/C/D, case/space and rejects missing or unknown codes', () => {
  for(const shift of ['A','B','C','D',' c ','d'])assert.equal(r.validateWorkerShift(shift),'');
  for(const shift of ['','E','0'])assert.equal(r.validateWorkerShift(shift),'Ca làm việc phải thuộc A, B, C hoặc D');
});
test('custom NG/deduction names preserve priority and per-machine indexing', () => {
  assert.equal(r.validateCustomReasonNames(form,[],[],[line]),'');
  assert.equal(r.validateCustomReasonNames(form,['__otherNg'],['__otherDeduction'],[line]),
    'Vui lòng nhập tên NG khác trước khi nhập số lượng');
  assert.equal(r.validateCustomReasonNames({...form,otherNgName:'NG đặc biệt'},[],['__otherDeduction'],[line]),
    'Vui lòng nhập lý do trừ giờ khác trước khi nhập số phút');
  assert.equal(r.validateCustomReasonNames({...form,otherNgName:'NG đặc biệt',otherDeductionName:'Chờ vật tư'},['__otherNg'],['__otherDeduction'],[line]),'');
  assert.equal(r.validateCustomReasonNames(form,[],[],[line,{...line,selectedDefects:['__otherNg']}]),
    'Dòng máy 2: vui lòng nhập tên NG khác');
  assert.equal(r.validateCustomReasonNames(form,[],[],[{...line,selectedDeductions:['__otherDeduction']}]),
    'Dòng máy 1: vui lòng nhập lý do trừ giờ khác');
});
test('manual-only processes reject any machine identifier without changing machine-capable forms', () => {
  assert.equal(r.validateManualMachineData(form,[line],true),'Công đoạn làm tay không được chứa dữ liệu máy');
  assert.equal(r.validateManualMachineData(form,[line],false),'');
  assert.equal(r.validateManualMachineData({...form,machineNo:'M1'},[{...line,machineCode:''}],true),
    'Công đoạn làm tay không được chứa dữ liệu máy');
  assert.equal(r.validateManualMachineData(form,[{...line,machineCode:''}],true),'');
});
test('parent time validation preserves the current exact 12-hour thresholds and error order', () => {
  assert.equal(r.validateReportTime(form,false),'');
  assert.equal(r.validateReportTime({...form,actualTime:'0'},false),'Thời gian làm việc thực tế phải là số hợp lệ lớn hơn 0');
  assert.equal(r.validateReportTime({...form,actualTime:'abc'},false),'Thời gian làm việc thực tế phải là số hợp lệ lớn hơn 0');
  assert.equal(r.validateReportTime({...form,actualMinutes:'60'},false),'Số phút làm thực tế phải từ 0 đến 59');
  assert.equal(r.validateReportTime({...form,deductionTime:'garbled'},false),'Thời gian trừ không hợp lệ');
  assert.equal(r.validateReportTime({...form,actualTime:'11',deductionTime:'1'},false),'');
  assert.equal(r.validateReportTime({...form,actualTime:'11.1',deductionTime:'1'},false),'Thời gian thực tế + thời gian trừ không được vượt quá 12 giờ');
  assert.equal(r.validateReportTime({...form,totalTime:'13'},false),'Tổng thời gian phải từ 0 đến 12 giờ');
  assert.equal(r.validateReportTime({...form,actualTime:'0',totalTime:'13'},true),'');
});
test('NG/KQD and actual-output parity keep snapshots and machine-line exception', () => {
  assert.equal(r.validateReportTotals(form,options,false,false,output),'');
  assert.equal(r.validateReportTotals({...form,standardOutput:'0'},options,false,false,output),'Định mức phải lớn hơn 0');
  assert.equal(r.validateReportTotals({...form,standardOutput:'0'},options,true,false,output),'');
  assert.equal(r.validateReportTotals({...form,actualOutput:'-1'},options,false,false,output),'Sản lượng thực tế không hợp lệ');
  assert.equal(r.validateReportTotals({...form,ttNg:'2'},options,false,false,output),'TT NG phải bằng tổng số lượng các lỗi NG');
  assert.equal(r.validateReportTotals({...form,actualOutput:'50'},options,false,false,output),'Thực tế phải bằng TT OK cộng TT NG');
  assert.equal(r.validateReportTotals({...form,actualOutput:'50'},options,false,true,output),'');
  assert.equal(r.validateReportTotals({...form,ttNg:'2',actualOutput:'50'},options,false,true,output),'TT NG phải bằng tổng số lượng các lỗi NG');
});
test('required process-specific fields reject only blank required values', () => {
  const fields=[{key:'lot',label:'Số lô',required:true},{key:'note',label:'Ghi chú',required:false}];
  assert.equal(r.validateRequiredExtraFields(fields,{lot:'A-1'}),'');
  assert.equal(r.validateRequiredExtraFields(fields,{lot:'    '}),'Vui lòng nhập Số lô');
  assert.equal(r.validateRequiredExtraFields(fields,{}),'Vui lòng nhập Số lô');
});
test('shared-machine validator still checks per-line time, defects, and count without changing physical output', () => {
  const validate=(lines,overrides={})=>validateMachineLines({
    processCode:'GC',machineLines:lines,maxMachines:4,
    isMachineValid:()=>true,isProductValid:()=>true,...overrides
  });
  assert.equal(validate([line]),null);
  assert.equal(validate([line,{...line,machineCode:'M02'}]),null);
  assert.equal(validate([{...line,ngQuantity:'2'}]),'Máy M01: tổng chi tiết lỗi (3) phải bằng NG (2)');
  assert.equal(validate([{...line,hours:'12'}]),'Máy M01: thời gian thực tế cộng trừ giờ không được quá 12 giờ');
  assert.equal(validate([{...line,minutes:'60'}]),'Máy M01: giờ phải không âm và phút phải từ 0 đến 59');
  assert.equal(validate([line,line,line,line,line]),'Tối đa 4 máy');
});
test('ProcessPage continues to check date, shared reports and machine options before pure final rules', () => {
  const s=fs.readFileSync(path.join(root,'ProcessPage.tsx'),'utf8');
  const matches=[
    'validateWorkerWorkDate(', 'validateWorkerShift(', 'validateSharedReportNumbers(',
    'validateCustomReasonNames(', 'validateMachineLines(', 'validateManualMachineData(',
    'validateReportTime(', 'validateReportTotals(', 'validateRequiredExtraFields('
  ].map(t=>({t,pos:s.indexOf(t)}));
  assert.ok(matches.every(x=>x.pos>=0),JSON.stringify(matches));
  for(let i=1;i<matches.length;i++)assert.ok(matches[i].pos>matches[i-1].pos,
    'Validation order changed: '+matches[i].t);
  assert.match(s,/buildProductionReportPayloads\(\{/);
});
