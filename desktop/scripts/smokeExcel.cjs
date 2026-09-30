const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const {
  buildSplitMonthlyWorkbooksLocal,
  PROCESS_SHEETS,
  PROCESS_FILE_PREFIXES
} = require('../electron/monthlyWorkbookLocal.cjs');
const { EXCEL_SYNC_CONTRACT_VERSION } = require('../../shared/excelSyncContract.cjs');

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
    operation_type: 'NEST',
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
    exclude_kqd_from_tt: 1,
    status: 'approved',
    note: 'Smoke test',
    deductions: [{ deduction_type_id: 1, deduction_type_code: '5S', hours: 0.5 }],
    defects: [
      { defect_type_id: 1, defect_type_code: 'KQD', quantity: 1 },
      { defect_type_id: 2, defect_type_code: 'VO_CAO_SU', quantity: 1 }
    ],
    machineLines: [],
    ...overrides
  };
}

const gcReports = [
  report({ id: 2, worker_code: '600', approved_at: '2026-08-02T10:00:00.000Z' }),
  // DB snapshot: 0% học việc đã được lưu actual_output=0.
  // Excel phải giữ nguyên giá trị DB, không tự tính lại thành 47.
  report({
    id: 1,
    worker_code: '599',
    training_percent: 0,
    actual_output: 0,
    approved_at: '2026-08-02T09:00:00.000Z',
    shift: 'C'
  }),
  report({
    id: 3,
    work_date: '2026-08-02',
    entry_date: '2026-08-03',
    worker_code: '601',
    approved_at: '2026-08-03T09:00:00.000Z'
  })
];

const processes = {};
for (const code of Object.keys(PROCESS_SHEETS)) {
  processes[code] = {
    processCode: code,
    processName: code,
    deductionTypes: [{ id: 1, code: '5S', name: '5S' }],
    defectTypes: [
      { id: 1, code: 'KQD', name: 'KQD' },
      { id: 2, code: 'VO_CAO_SU', name: 'Vỡ cao su' }
    ],
    reports: code === 'GC' ? gcReports : []
  };
}

const payload = {
  dataSource: 'tidb.production_reports.approved',
  yearMonth: '2026-08',
  processes,
  formulaSettings: {
    GLOBAL: {
      apply_training_percent: 1,
      output_formula: 'ENTERED_X_TRAINING',
      output_per_hour_formula: 'ADJUSTED_OUTPUT_DIV_ACTUAL_TIME',
      achievement_formula: 'OUTPUT_PER_HOUR_DIV_STANDARD',
      ng_rate_formula: 'NG_DIV_OK_PLUS_NG',
      actual_time_formula: 'DATABASE_SNAPSHOT'
    }
  }
};

(async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'ktc-excel-smoke-'));
  try {
    const built = await buildSplitMonthlyWorkbooksLocal({ date: '2026-08-01', payload });

    assert.equal(built.processes.length, 9, 'Phải tạo đủ 9 file công đoạn');
    assert.equal(built.summary.fileName, '00_TONG_HOP_SAN_XUAT_08-2026.xlsx');

    for (const item of built.processes) {
      const expected = `${PROCESS_FILE_PREFIXES[item.processCode]}_08-2026.xlsx`;
      assert.equal(item.fileName, expected, `${item.processCode}: sai tên file`);
      const filePath = path.join(temp, item.fileName);
      await fs.writeFile(filePath, item.buffer);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(filePath);
      const syncSheet = workbook.getWorksheet('_KTC_SYNC');
      assert.ok(syncSheet, `${item.processCode}: thiếu _KTC_SYNC`);
      assert.equal(syncSheet.state, 'veryHidden', `${item.processCode}: _KTC_SYNC phải veryHidden`);
      const syncConfig = JSON.parse(String(syncSheet.getCell('A1').value || '{}'));
      assert.equal(syncConfig.version, EXCEL_SYNC_CONTRACT_VERSION, `${item.processCode}: sai contract version`);
    }

    const gcItem = built.processes.find((item) => item.processCode === 'GC');
    assert.ok(gcItem, 'Thiếu file GC');
    const gcPath = path.join(temp, gcItem.fileName);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(gcPath);
    const sheet = workbook.getWorksheet(PROCESS_SHEETS.GC.sheet);
    assert.ok(sheet, 'Thiếu sheet GC');

    const header = sheet.getRow(5).values;
    const trainingCol = header.indexOf('% học việc');
    const outputCol = header.indexOf('Tổng SP quy đổi');
    const ngRateCol = header.indexOf('Tỷ lệ NG');
    const standardCol = header.indexOf('Định mức');
    const defectCol = header.indexOf('Vỡ cao su');
    assert.ok(trainingCol > 0 && outputCol > 0 && ngRateCol > 0 && standardCol > 0, 'Thiếu cột Excel bắt buộc');

    // Dòng DB snapshot 0% học việc phải giữ nguyên 0, không bị tính lại từ 47.
    assert.equal(sheet.getCell(7, trainingCol).value, 0, '0% học việc bị thay đổi');
    assert.equal(sheet.getCell(7, outputCol).value, 0, 'SP quy đổi không khớp actual_output trong DB');
    assert.equal(sheet.getCell(7, standardCol).value, 617.1, 'Định mức phải giữ numeric value từ DB');
    assert.equal(
      Number(sheet.getCell(7, ngRateCol).value.toFixed(8)),
      Number((2 / 47).toFixed(8)),
      'Tỷ lệ NG phải là Tổng NG/(OK+NG)'
    );
    assert.equal(sheet.getCell(7, defectCol).value, 1, 'Chi tiết NG phải lấy từ DB');

    const summaryPath = path.join(temp, built.summary.fileName);
    await fs.writeFile(summaryPath, built.summary.buffer);
    const summaryWorkbook = new ExcelJS.Workbook();
    await summaryWorkbook.xlsx.readFile(summaryPath);
    assert.deepEqual(
      summaryWorkbook.worksheets.map((worksheet) => worksheet.name),
      ['BÌA', 'TỔNG HỢP THÁNG', 'ĐỐI CHIẾU DỮ LIỆU']
    );

    console.log('[PASS] Excel smoke test: DB snapshot values preserved');
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
