const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { buildWorkerProcessWorkbook, PROCESS_FILE_PREFIXES, TEMPLATE_NAME } = require('../electron/workerReportTemplateLocal.cjs');

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
    deductions: [{ deduction_type_id: 1, deduction_type_code: '5S', deduction_code: '5S', deduction_name: '5S', hours: 0.5 }],
    defects: [
      { defect_type_id: 1, defect_type_code: 'KQD', defect_code: 'KQD', defect_name: 'KQD', quantity: 1 },
      { defect_type_id: 2, defect_type_code: 'VO_CAO_SU', defect_code: 'VO_CAO_SU', defect_name: 'Vỡ cao su', quantity: 1 }
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
      deductionTypes: [{ id: 1, code: '5S', deduction_code: '5S', name: '5S', deduction_name: '5S', sort_order: 1 }],
      defectTypes: [
        { id: 1, code: 'KQD', defect_code: 'KQD', name: 'KQD', defect_name: 'KQD', sort_order: 1 },
        { id: 2, code: 'VO_CAO_SU', defect_code: 'VO_CAO_SU', name: 'Vỡ cao su', defect_name: 'Vỡ cao su', sort_order: 2 }
      ],
      reports: [
        report({ id: 1, worker_code: '599' }),
        report({ id: 2, worker_code: '600', work_date: '2026-08-02', actual_output: 0, training_percent: 0 })
      ]
    };

    const built = await buildWorkerProcessWorkbook({
      appPath: path.resolve(__dirname, '..'),
      processCode: 'GC',
      processName: 'Gia công',
      date: '2026-08-01',
      processData
    });

    assert.equal(built.fileName, `${PROCESS_FILE_PREFIXES.GC}_08-2026.xlsx`);
    assert.equal(built.templateFile, TEMPLATE_NAME);
    assert.equal(built.reportCount, 2);

    const filePath = path.join(temp, built.fileName);
    await fs.writeFile(filePath, built.buffer);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    assert.ok(workbook.worksheets.length >= 1, 'Template phải có worksheet');

    const sheet = workbook.worksheets.find((item) => item.state !== 'hidden') || workbook.worksheets[0];
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
    assert.ok(rowValues.includes('599'), 'Mã NV không được đổ vào template');
    assert.ok(rowValues.includes('Nguyễn Văn Kiểm tra'), 'Tên NV không được đổ vào template');
    assert.ok(rowValues.some((value) => value === '0.5' || value === '0.50'), 'Chi tiết Trừ H không được đổ từ DB');
    assert.ok(rowValues.some((value) => value === '1'), 'Chi tiết NG không được đổ từ DB');

    console.log('[PASS] Worker Excel smoke test: canonical template + STT + Trừ H + NG');
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
