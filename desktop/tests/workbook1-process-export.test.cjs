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
test('Workbook1.xlsx is the one approved source for all six process sheets', async () => {
  assert.ok(fs.existsSync(source),'The six-sheet workbook must be checked into backend/templates');
  const original = new ExcelJS.Workbook();
  await original.xlsx.readFile(source);
  for (const [code,form] of cases) {
    assert.equal(form.file,'Workbook1.xlsx',code);
    const sheet = original.getWorksheet(form.sheet);
    assert.ok(sheet,'Missing source sheet for '+code);
    assert.ok(String(sheet.getCell(form.header,1).value).trim().toUpperCase()==='STT',code+' header');
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
    assert.deepEqual(visible.map(s=>s.name),[form.sheet]);
    const sheet = visible[0];
    assert.equal(String(sheet.getCell(form.header,1).value).trim().toUpperCase(),'STT');
    assert.equal(sheet.getCell(form.first,3).value,null,'Sample employee data must be removed');
    assert.equal(built.processCode,code);
  });
}
