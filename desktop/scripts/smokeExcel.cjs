const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
require('../electron/excelExportContractPatch.v6.cjs');
const { buildWorkerProcessWorkbook, PROCESS_FILE_PREFIXES, TEMPLATE_NAME } = require('../electron/workerReportTemplateLocal.v2.cjs');

function report(overrides = {}) {
  return {
    id: 1,
    dataSource: 'production_reports',
    isApprovedDatabaseRecord: true,
    work_date: '2026-08-01',
    entry_date: '2026-08-02',
    created_at: '2026-08-02T08:00:00.000Z',
    approved_at: '2026-08-02T09:00:00.000Z',
    worker_code: '599',
    full_name: 'Nguyễn Văn Kiểm tra',
    shift: 'A',
    operation_type: 'CUT',
    operation_mode: 'MANUAL',
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
    status: 'approved',
    note: 'Smoke test',
    deductions: [{ deduction_type_id: 1, deduction_type_code: 'DED_5S_DB', deduction_code: 'DED_5S_DB', deduction_name: '5S database name', hours: 0.5 }],
    defects: [
      { defect_type_id: 1, defect_type_code: 'DEF_KQD_DB', defect_code: 'DEF_KQD_DB', defect_name: 'KQD database name', quantity: 1 },
      { defect_type_id: 2, defect_type_code: 'DEF_VCS_DB', defect_code: 'DEF_VCS_DB', defect_name: 'Vỡ cao su database name', quantity: 1 }
    ],
    ...overrides
  };
}

(async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'ktc-worker-template-smoke-'));
  try {
    const processData = {
      processCode: 'GC',
      processName: 'Gia công',
      deductionTypes: [{ id: 1, code: 'DED_5S_DB', deduction_code: 'DED_5S_DB', name: '5S database name', deduction_name: '5S database name', sort_order: 1 }],
      defectTypes: [
        { id: 1, code: 'DEF_KQD_DB', defect_code: 'DEF_KQD_DB', name: 'KQD database name', defect_name: 'KQD database name', sort_order: 1 },
        { id: 2, code: 'DEF_VCS_DB', defect_code: 'DEF_VCS_DB', name: 'Vỡ cao su database name', defect_name: 'Vỡ cao su database name', sort_order: 2 }
      ],
      reports: [report({ id: 1, worker_code: '599' }), report({ id: 2, worker_code: '600', work_date: '2026-08-02', actual_output: 0, training_percent: 0 })]
    };

    const built = await buildWorkerProcessWorkbook({ appPath: path.resolve(__dirname, '..'), processCode: 'GC', processName: 'Gia công', date: '2026-08-01', processData });
    assert.equal(built.fileName, `${PROCESS_FILE_PREFIXES.GC}_08-2026.xlsx`);
    assert.equal(built.templateFile, TEMPLATE_NAME);
    assert.equal(built.reportCount, 2);

    const filePath = path.join(temp, built.fileName);
    await fs.writeFile(filePath, built.buffer);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const sheet = workbook.worksheets.find((item) => item.state !== 'hidden') || workbook.worksheets[0];
    assert.ok(sheet, 'Template phải có worksheet');

    const values = [];
    for (let r = 1; r <= Math.min(sheet.rowCount, 80); r += 1) {
      for (let c = 1; c <= sheet.columnCount; c += 1) values.push(String(sheet.getRow(r).getCell(c).value ?? '').trim());
    }
    assert.ok(values.includes('STT') || values.some((v) => /STT/i.test(v)), 'Template phải giữ cột STT');

    let workerRow = null;
    for (let r = built.dataStartRow; r < built.dataStartRow + 2; r += 1) {
      const rowText = Array.from({ length: sheet.columnCount }, (_, i) => String(sheet.getRow(r).getCell(i + 1).value ?? '')).join('|');
      if (rowText.includes('599')) { workerRow = r; break; }
    }
    assert.ok(workerRow, 'Không tìm thấy dữ liệu công nhân sau khi đổ template');

    const rowValues = Array.from({ length: sheet.columnCount }, (_, i) => String(sheet.getRow(workerRow).getCell(i + 1).value ?? ''));
    // "Loại thao tác" / "Chế độ" are only asserted when the canonical template
    // actually has those columns; the current worker template does not.
    const headerText = values.map((v) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase()).join('|');
    const expectedFields = ['599', 'Nguyễn Văn Kiểm tra', 'M-01', 'QC5-1657', '0.5', '45', '2', '47'];
    if (headerText.includes('loai thao tac')) expectedFields.push('CUT');
    if (headerText.includes('che do')) expectedFields.push('MANUAL');
    for (const expected of expectedFields) {
      assert.ok(rowValues.includes(expected), `Không đổ đủ trường worker report: ${expected}`);
    }
    assert.ok(rowValues.some((value) => value === '0.5' || value === '0.50'), 'Chi tiết Trừ H không được đổ từ DB khi tên/code DB khác tên template');
    assert.ok(rowValues.some((value) => value === '1'), 'Chi tiết NG không được đổ từ DB khi tên/code DB khác tên template');

    console.log('[PASS] Worker Excel smoke test: canonical template + STT + complete fields + DB detail alias mapping + Trừ H + NG');
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});