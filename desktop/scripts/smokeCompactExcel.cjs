const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');

const monthly = require('../electron/monthlyWorkbookLocal.cjs');
require('../electron/compactGcExcelPatch.cjs');

const payload = {
  dataSource: 'tidb.production_reports.approved',
  yearMonth: '2026-08',
  processes: {
    GC: {
      processCode: 'GC',
      processName: 'Gia công',
      deductionTypes: [{ id: 1, code: '5S', name: '5S', sort_order: 1 }],
      defectTypes: [
        { id: 1, code: 'KQD', name: 'KQD', sort_order: 1 },
        { id: 2, code: 'VO_CAO_SU', name: 'Vỡ cao su', sort_order: 2 }
      ],
      reports: [{
        id: 1,
        isApprovedDatabaseRecord: true,
        work_date: '2026-08-02',
        worker_code: '599',
        full_name: 'Nguyễn Văn Kiểm tra',
        shift: 'C',
        machine_no: 'M-01',
        product_name: 'QC5-1657',
        training_percent: 100,
        standard_output: 617.1,
        total_time: 8,
        actual_time: 7.5,
        deduction_time: 0.5,
        tt_ok: 45,
        tt_ng: 2,
        actual_output: 47,
        deductions: [{ deduction_type_id: 1, deduction_type_code: '5S', hours: 0.5 }],
        defects: [
          { defect_type_id: 1, defect_type_code: 'KQD', quantity: 1 },
          { defect_type_id: 2, defect_type_code: 'VO_CAO_SU', quantity: 1 }
        ]
      }]
    }
  }
};

(async () => {
  const built = await monthly.buildProcessWorkbookLocal({
    appPath: path.resolve(__dirname, '..'),
    date: '2026-08-01',
    processCode: 'GC',
    payload
  });

  assert.equal(built.templateKind, 'COMPACT_WORKER_PRODUCTION');
  assert.deepEqual(built.targetSheets, ['Báo cáo sản xuất']);

  const tmp = path.join(require('node:os').tmpdir(), `ktc-compact-smoke-${Date.now()}.xlsx`);
  try {
    fs.writeFileSync(tmp, built.buffer);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(tmp);
    assert.deepEqual(wb.worksheets.map((s) => s.name), ['Báo cáo sản xuất']);

    const sheet = wb.worksheets[0];
    assert.equal(sheet.getCell('B2').value, '08/2026');
    assert.equal(sheet.getCell('K4').value, '5S');
    assert.equal(sheet.getCell('AI4').value, 'KQD');
    assert.equal(sheet.getCell('AJ4').value, 'Vỡ cao su');

    assert.equal(sheet.getCell('A5').value, 1);
    assert.equal(sheet.getCell('B5').value, '599');
    assert.equal(sheet.getCell('C5').value, 'Nguyễn Văn Kiểm tra');
    assert.equal(sheet.getCell('D5').value, 'M-01');
    assert.equal(sheet.getCell('E5').value, 'C');
    assert.equal(sheet.getCell('J5').value, 0.5);
    assert.equal(sheet.getCell('K5').value, 0.5);
    assert.equal(sheet.getCell('AA5').value, 'QC5-1657');
    assert.equal(sheet.getCell('AB5').value, 617.1 * 7.5);
    assert.equal(sheet.getCell('AC5').value, 47);
    assert.ok(sheet.getCell('AD5').value instanceof Date);
    assert.equal(sheet.getCell('AE5').value, 45);
    assert.equal(sheet.getCell('AF5').value, 47 / (617.1 * 7.5));
    assert.equal(sheet.getCell('AG5').value, 47 / 7.5);
    assert.equal(sheet.getCell('AH5').value, 2);
    assert.equal(sheet.getCell('AI5').value, 1);
    assert.equal(sheet.getCell('AJ5').value, 1);
    assert.equal(sheet.pageSetup.fitToWidth, 1);
    assert.equal(sheet.pageSetup.fitToHeight, 0);
    assert.equal(sheet.views[0].showGridLines, false);

    console.log('[PASS] Compact Excel smoke test: one-sheet template + DB values preserved');
  } finally {
    try { fs.unlinkSync(tmp); } catch (_) {}
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});