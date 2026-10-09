const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
require('../electron/excelReportDateSubmissionPatch.cjs');
require('../electron/excelExportContractPatch.v6.cjs');
const { buildWorkerProcessWorkbook, PROCESS_FILE_PREFIXES, TEMPLATE_NAME } = require('../electron/workerReportTemplateLocal.v2.cjs');

function report(overrides = {}) {
  return {
    id: 1,
    dataSource: 'production_reports',
    isApprovedDatabaseRecord: true,
    work_date: '2026-08-01',
    entry_date: '2026-08-02',
    submitted_at: '2026-08-02 08:00:00',
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
        { id: 2, code: 'DEF_VCS_DB', defect_code: 'DEF_VCS_DB', name: 'Vỡ cao su database name', defect_name: 'Vỡ cao su database name', sort_order: 2 },
        { id: 11, code: 'CAT01', defect_code: 'CAT01', name: 'Cao su không đứt', defect_name: 'Cao su không đứt', sort_order: 11 },
        { id: 12, code: 'CAT02', defect_code: 'CAT02', name: 'Cắt lẹm', defect_name: 'Cắt lẹm', sort_order: 12 },
        { id: 13, code: 'CAT03', defect_code: 'CAT03', name: 'Cắt phạm', defect_name: 'Cắt phạm', sort_order: 13 },
        { id: 14, code: 'CAT04', defect_code: 'CAT04', name: 'Cao su ngắn', defect_name: 'Cao su ngắn', sort_order: 14 },
        { id: 15, code: 'CAT05', defect_code: 'CAT05', name: 'Cao su dài', defect_name: 'Cao su dài', sort_order: 15 },
        { id: 16, code: 'CAT06', defect_code: 'CAT06', name: 'Bavia cao su', defect_name: 'Bavia cao su', sort_order: 16 },
        { id: 17, code: 'CAT07', defect_code: 'CAT07', name: 'Phế phẩm chỉnh máy', defect_name: 'Phế phẩm chỉnh máy', sort_order: 17 },
        { id: 18, code: 'CAT08', defect_code: 'CAT08', name: 'Lỗi cao su ( NCC )', defect_name: 'Lỗi cao su ( NCC )', sort_order: 18 },
        { id: 19, code: 'CAT09', defect_code: 'CAT09', name: 'Lẫn cao su', defect_name: 'Lẫn cao su', sort_order: 19 },
        { id: 20, code: 'CAT10', defect_code: 'CAT10', name: 'Khác', defect_name: 'Khác', sort_order: 20 },
        { id: 21, code: 'LONG01', defect_code: 'LONG01', name: 'Không qua dưỡng', defect_name: 'Không qua dưỡng', sort_order: 21 },
        { id: 22, code: 'LONG02', defect_code: 'LONG02', name: 'Cao su vỡ', defect_name: 'Cao su vỡ', sort_order: 22 },
        { id: 23, code: 'LONG03', defect_code: 'LONG03', name: 'Trục xước', defect_name: 'Trục xước', sort_order: 23 },
        { id: 24, code: 'LONG04', defect_code: 'LONG04', name: 'Trục gãy, cong', defect_name: 'Trục gãy, cong', sort_order: 24 },
        { id: 25, code: 'LONG05', defect_code: 'LONG05', name: 'Thiếu cao su', defect_name: 'Thiếu cao su', sort_order: 25 },
        { id: 26, code: 'LONG06', defect_code: 'LONG06', name: 'Lẫn trục', defect_name: 'Lẫn trục', sort_order: 26 },
        { id: 27, code: 'LONG07', defect_code: 'LONG07', name: 'Lẫn cao su', defect_name: 'Lẫn cao su', sort_order: 27 },
        { id: 28, code: 'LONG08', defect_code: 'LONG08', name: 'Khác', defect_name: 'Khác', sort_order: 28 }
      ],
      reports: [
        report({ id: 1, worker_code: '599' }),
        report({ id: 2, worker_code: '600', work_date: '2026-08-02', actual_output: 0, training_percent: 0 }),
        report({
          id: 3, worker_code: '601', work_date: '2026-08-03', tt_ng: 18, actual_output: 63,
          machine_no: '', machineLines: [{ machine_code: 'CUT-10', product_code: 'GC-PROD' }],
          defects: [
            { defect_type_id: 11, defect_type_code: 'CAT01', defect_code: 'CAT01', defect_name: 'Cao su không đứt', quantity: 1 },
            { defect_type_id: 12, defect_type_code: 'CAT02', defect_code: 'CAT02', defect_name: 'Cắt lẹm', quantity: 1 },
            { defect_type_id: 13, defect_type_code: 'CAT03', defect_code: 'CAT03', defect_name: 'Cắt phạm', quantity: 1 },
            { defect_type_id: 14, defect_type_code: 'CAT04', defect_code: 'CAT04', defect_name: 'Cao su ngắn', quantity: 1 },
            { defect_type_id: 15, defect_type_code: 'CAT05', defect_code: 'CAT05', defect_name: 'Cao su dài', quantity: 1 },
            { defect_type_id: 16, defect_type_code: 'CAT06', defect_code: 'CAT06', defect_name: 'Bavia cao su', quantity: 1 },
            { defect_type_id: 17, defect_type_code: 'CAT07', defect_code: 'CAT07', defect_name: 'Phế phẩm chỉnh máy', quantity: 1 },
            { defect_type_id: 18, defect_type_code: 'CAT08', defect_code: 'CAT08', defect_name: 'Lỗi cao su ( NCC )', quantity: 1 },
            { defect_type_id: 19, defect_type_code: 'CAT09', defect_code: 'CAT09', defect_name: 'Lẫn cao su', quantity: 1 },
            { defect_type_id: 20, defect_type_code: 'CAT10', defect_code: 'CAT10', defect_name: 'Khác', quantity: 1 },
            { defect_type_id: 21, defect_type_code: 'LONG01', defect_code: 'LONG01', defect_name: 'Không qua dưỡng', quantity: 1 },
            { defect_type_id: 22, defect_type_code: 'LONG02', defect_code: 'LONG02', defect_name: 'Cao su vỡ', quantity: 1 },
            { defect_type_id: 23, defect_type_code: 'LONG03', defect_code: 'LONG03', defect_name: 'Trục xước', quantity: 1 },
            { defect_type_id: 24, defect_type_code: 'LONG04', defect_code: 'LONG04', defect_name: 'Trục gãy, cong', quantity: 1 },
            { defect_type_id: 25, defect_type_code: 'LONG05', defect_code: 'LONG05', defect_name: 'Thiếu cao su', quantity: 1 },
            { defect_type_id: 26, defect_type_code: 'LONG06', defect_code: 'LONG06', defect_name: 'Lẫn trục', quantity: 1 },
            { defect_type_id: 27, defect_type_code: 'LONG07', defect_code: 'LONG07', defect_name: 'Lẫn cao su', quantity: 1 },
            { defect_type_id: 28, defect_type_code: 'LONG08', defect_code: 'LONG08', defect_name: 'Khác', quantity: 1 }
          ]
        })
      ]
    };

    const built = await buildWorkerProcessWorkbook({ appPath: path.resolve(__dirname, '..'), processCode: 'GC', processName: 'Gia công', date: '2026-08-01', processData });
    assert.equal(built.fileName, `${PROCESS_FILE_PREFIXES.GC}_08-2026.xlsx`);
    assert.equal(built.templateFile, TEMPLATE_NAME);
    assert.equal(built.reportCount, 3);

    const filePath = path.join(temp, built.fileName);
    await fs.writeFile(filePath, built.buffer);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const sheet = workbook.worksheets.find((item) => item.state !== 'hidden') || workbook.worksheets[0];
    assert.ok(sheet, 'Template phải có worksheet');
    assert.equal(sheet.getColumn(2).hidden, true, 'Cột B phải hidden');
    assert.equal(String(sheet.getRow(built.headerRow).getCell(2).value), 'Thời gian nộp báo cáo');

    const values = [];
    for (let r = 1; r <= Math.min(sheet.rowCount, 80); r += 1) {
      for (let c = 1; c <= sheet.columnCount; c += 1) values.push(String(sheet.getRow(r).getCell(c).value ?? '').trim());
    }
    assert.ok(values.includes('STT') || values.some((v) => /STT/i.test(v)), 'Template phải giữ cột STT');

    let dateRow = null;
    for (let r = 1; r <= sheet.rowCount; r += 1) {
      const value = sheet.getRow(r).getCell(1).value;
      if (value instanceof Date && value.getUTCDate() === 1 && value.getUTCMonth() === 7) { dateRow = r; break; }
    }
    assert.ok(dateRow, 'Date row phải lấy work_date');

    let workerRow = null;
    for (let r = built.dataStartRow; r < built.dataStartRow + 2; r += 1) {
      const rowText = Array.from({ length: sheet.columnCount }, (_, i) => String(sheet.getRow(r).getCell(i + 1).value ?? '')).join('|');
      if (rowText.includes('599')) { workerRow = r; break; }
    }
    assert.ok(workerRow, 'Không tìm thấy dữ liệu công nhân sau khi đổ template');
    assert.equal(String(sheet.getRow(workerRow).getCell(3).value), '599', 'C phải là Mã NV');
    const submission = sheet.getRow(workerRow).getCell(2).value;
    assert.ok(submission instanceof Date, 'Cột B phải chứa submission timestamp');
    assert.equal(submission.getUTCDate(), 2);
    assert.equal(submission.getUTCHours(), 8);

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

    const encodedRow = (() => {
      for (let r = built.dataStartRow; r <= sheet.rowCount; r += 1) {
        if (String(sheet.getRow(r).getCell(3).value ?? '') === '601') return r;
      }
      return null;
    })();
    assert.ok(encodedRow, 'Không tìm thấy báo cáo thử mã NG CAT/LONG');
    const headerRow = sheet.getRow(built.headerRow);
    const headerColumn = (expected) => {
      const target = expected.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase();
      for (let c = 1; c <= sheet.columnCount; c += 1) {
        const value = String(headerRow.getCell(c).value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase();
        if (value === target) return c;
      }
      return null;
    };
    const machineColumn = headerColumn('Máy');
    assert.ok(machineColumn, 'Template phải có cột Máy');
    assert.equal(String(sheet.getRow(encodedRow).getCell(machineColumn).value), 'CUT-10', 'Máy phải fallback từ machineLines khi machine_no trống');
    const encodedHeaders = [["CAT01","Cắt không đứt"],["CAT02","Cắt lẹm"],["CAT03","NG: Cắt phạm (CAT03)"],["CAT04","NG: Cao su ngắn (CAT04)"],["CAT05","NG: Cao su dài (CAT05)"],["CAT06","bavia"],["CAT07","ppcm"],["CAT08","LCS"],["CAT09","lẫn cs"],["CAT10","NG: Khác (CAT10)"],["LONG01","KQD"],["LONG02","Vỡ cao su"],["LONG03","NG: Trục xước (LONG03)"],["LONG04","NG: Trục gãy, cong (LONG04)"],["LONG05","thiếu cao su"],["LONG06","NG: Lẫn trục (LONG06)"],["LONG07","NG: Lẫn cao su (LONG07)"],["LONG08","NG: Khác (LONG08)"]];
    for (const [code, label] of encodedHeaders) {
      const column = headerColumn(label);
      assert.ok(column, `Thiếu cột NG cho mã form ${code}: ${label}`);
      assert.equal(Number(sheet.getRow(encodedRow).getCell(column).value), 1, `Sai số NG ở cột mã form ${code}`);
    }
    const cat10Column = headerColumn('NG: Khác (CAT10)');
    const long08Column = headerColumn('NG: Khác (LONG08)');
    assert.ok(cat10Column && long08Column && cat10Column !== long08Column, 'CAT10 và LONG08 đều là Khác nhưng phải giữ riêng theo mã form');
    assert.ok(String(sheet.pageSetup.printArea).endsWith(String(sheet.rowCount)), 'Vùng in phải kết thúc tại dòng dữ liệu cuối');
    assert.ok(!String(sheet.pageSetup.printArea).endsWith('2366'), 'Vùng in không được giữ dòng mẫu 2366');

    console.log('[PASS] Worker Excel smoke test: submission timestamp + encoded CAT/LONG NG mapping + unmatched NG columns + print area + Trừ H');
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});