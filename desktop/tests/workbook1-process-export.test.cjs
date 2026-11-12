'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const ExcelJS = require('exceljs');
const { buildProcessWorkbookLocal } = require('../electron/monthlyWorkbookLocal.cjs');
const { WORKBOOK1_FORMS } = require('../electron/originalProcessExcelTemplate.cjs');

const source = path.resolve(__dirname,'../../backend/templates/Workbook1.xlsx');
const cases = Object.entries(WORKBOOK1_FORMS);
const cellText = (cell) => {
  const value=cell.value;
  return String(value && typeof value === 'object' ? value.result ?? value.text ?? '' : value ?? '').trim();
};
test('Workbook1.xlsx is the one approved source for all six process sheets', async () => {
  assert.ok(fs.existsSync(source),'The six-sheet workbook must be checked into backend/templates');
  const original = new ExcelJS.Workbook();
  await original.xlsx.readFile(source);
  for (const [code,form] of cases) {
    assert.equal(form.file,'Workbook1.xlsx',code);
    const sheet = original.getWorksheet(form.sheet);
    assert.ok(sheet,'Missing source sheet for '+code);
    assert.ok(cellText(sheet.getCell(form.header,1)).toUpperCase()==='STT',code+' header');
  }
});
for (const [code,form] of cases) {
  test(code+' export preserves only its matching Workbook1 sheet and no sample data',async () => {
    const built = await buildProcessWorkbookLocal({
      date:'2026-11-01',processCode:code,
      payload:{yearMonth:'2026-11',dataSource:'tidb.production_reports.approved',processes:{}}
    });
    assert.equal(built.templateKind,'workbook1-sheet');
    const exported = new ExcelJS.Workbook();
    await exported.xlsx.load(built.buffer);
    const visible = exported.worksheets.filter(s=>!s.name.startsWith('_KTC_'));
    assert.deepEqual(visible.map(s=>s.name),code === 'GC' ? [form.sheet,'TAY MÁY CẮT LỒNG'] : [form.sheet]);
    const sheet = exported.getWorksheet(form.sheet);
    assert.equal(String(sheet.getCell(form.header,1).value).trim().toUpperCase(),'STT');
    assert.equal(sheet.getCell(form.first,3).value,null,'Sample employee data must be removed');
    assert.equal(built.processCode,code);
  });
}

const defectCodes = { GC:'CAT01', MAI:'MAI_NG_01', DO:'DO_NG_01', XLBV:'XLBV01', EP:'EP01', CAN:'CAN01' };
const firstNgColumns = { GC:'AI', MAI:'AP', DO:'AL', XLBV:'W', EP:'Q', CAN:'Q' };
test('Workbook1 maps approved report rows and each process-specific coded NG column', async () => {
  for (const [code,form] of cases) {
    const defectCode = defectCodes[code];
    const report = {
      id:101, work_date:'2026-11-10', created_at:'2026-11-10T10:30:00',
      worker_code:'49-001', full_name:'Nhân viên kiểm thử', shift:'A',
      machine_no:'TEST-01', product_code:'P01', status:'approved',
      dataSource:'production_reports', isApprovedDatabaseRecord:true,
      calculationSnapshot: {
        trainingFactor:1, standard:500, workingTime:12, actualTime:10,
        deductionTime:2, ok:99, allNg:1, countedNg:1, enteredOutput:100,
        adjustedOutput:100, outputPerHour:10, achievement:0.2, ngRate:0.01
      },
      defects:[{defect_type_code:defectCode, defect_type_name:defectCode, defect_quantity:1}],
      deductions:[]
    };
    const built = await buildProcessWorkbookLocal({
      date:'2026-11-01', processCode:code,
      payload:{yearMonth:'2026-11',dataSource:'tidb.production_reports.approved',
        processes:{[code]:{reports:[report]}}}
    });
    const exported = new ExcelJS.Workbook();
    await exported.xlsx.load(built.buffer);
    const sheet = exported.getWorksheet(form.sheet);
    const dataRow = form.first;
    const original = new ExcelJS.Workbook();
    await original.xlsx.readFile(source);
    const originalPink = original.getWorksheet(form.sheet).getCell('B'+(form.first-1)).fill;
    assert.deepEqual(sheet.getCell('B'+(form.first-1)).fill,originalPink,code+' pink date row keeps source fill');
    assert.equal(sheet.getCell('C'+dataRow).value,'49-001',code+' employee');
    assert.equal(sheet.getCell(firstNgColumns[code]+dataRow).value,1,code+' coded NG');
    assert.equal(sheet.getCell('A'+(form.first-1)).value,'10/11/2026',code+' date separator');
    assert.equal(sheet.getColumn(2).hidden,true,code+' submission-time column hidden');
    const dateCol = Object.entries(form.fields).find(([,key])=>key==='date')?.[0];
    assert.ok(dateCol,code+' must have the work-date column');
    assert.equal(sheet.getCell(dateCol+dataRow).value?.toISOString().slice(0,10),'2026-11-10',code+' work date has no timezone shift');
  }
});
