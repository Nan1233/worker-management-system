const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { buildSplitMonthlyWorkbooksLocal, PROCESS_SHEETS, PROCESS_FILE_PREFIXES } = require('../electron/monthlyWorkbookLocal.cjs');
const { EXCEL_SYNC_CONTRACT_VERSION } = require('../../shared/excelSyncContract.cjs');

function pad2(value) {
  return String(value).padStart(2, '0');
}

function excelDateKey(value) {
  if (value === null || value === undefined || value === '') return '';

  if (value instanceof Date) {
    assert.ok(!Number.isNaN(value.getTime()), `Giá trị ngày Excel không hợp lệ: ${String(value)}`);
    return [
      value.getFullYear(),
      pad2(value.getMonth() + 1),
      pad2(value.getDate())
    ].join('-');
  }

  if (typeof value === 'object' && value !== null && Object.prototype.hasOwnProperty.call(value, 'result')) {
    return excelDateKey(value.result);
  }

  const text = String(value).trim();
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  const vietnameseMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (vietnameseMatch) {
    return [vietnameseMatch[3], pad2(vietnameseMatch[2]), pad2(vietnameseMatch[1])].join('-');
  }

  throw new Error(`Không thể chuẩn hóa ngày Excel: ${JSON.stringify(value)}`);
}

function report(overrides = {}) {
  return {
    id: 1, dataSource: 'production_reports', isApprovedDatabaseRecord: true,
    work_date: '2026-08-01', entry_date: '2026-08-02', created_at: '2026-08-02T08:00:00.000Z', approved_at: '2026-08-02T09:00:00.000Z',
    worker_code: '599', full_name: 'Nguyễn Văn Kiểm tra', shift: 'A', operation_type: 'NEST', operation_mode: 'MANUAL', machine_no: 'M-01', product_name: 'QC5-1657',
    training_percent: 100, standard_output: 617.1, total_time: 8, actual_time: 7.5, deduction_time: 0.5,
    tt_ok: 45, tt_ng: 2, actual_output: 47, exclude_kqd_from_tt: 1, status: 'approved', note: 'Smoke test',
    deductions: [{ deduction_type_id: 1, deduction_type_code: '5S', hours: 0.5 }],
    defects: [
      { defect_type_id: 1, defect_type_code: 'KQD', quantity: 1 },
      { defect_type_id: 2, defect_type_code: 'VO_CAO_SU', quantity: 1 }
    ],
    machineLines: [], ...overrides
  };
}

const gcReports = [
  report({ id: 2, worker_code: '600', approved_at: '2026-08-02T10:00:00.000Z' }),
  report({ id: 1, worker_code: '599', training_percent: 0, approved_at: '2026-08-02T09:00:00.000Z', shift: 'C' }),
  report({ id: 3, work_date: '2026-08-02', entry_date: '2026-08-03', worker_code: '601', approved_at: '2026-08-03T09:00:00.000Z' })
];
const processes = {};
for (const code of Object.keys(PROCESS_SHEETS)) {
  processes[code] = {
    processCode: code,
    processName: code,
    deductionTypes: [{ id: 1, code: '5S', name: '5S' }],
    defectTypes: [{ id: 1, code: 'KQD', name: 'KQD' }, { id: 2, code: 'VO_CAO_SU', name: 'Vỡ cao su' }],
    reports: code === 'GC' ? gcReports : []
  };
}
const payload = {
  dataSource: 'tidb.production_reports.approved', yearMonth: '2026-08', processes,
  formulaSettings: { GLOBAL: { apply_training_percent: 1, output_formula: 'ENTERED_X_TRAINING', output_per_hour_formula: 'ADJUSTED_OUTPUT_DIV_ACTUAL_TIME', achievement_formula: 'OUTPUT_PER_HOUR_DIV_STANDARD', ng_rate_formula: 'NG_DIV_OK_PLUS_NG', actual_time_formula: 'DATABASE_SNAPSHOT' } }
};

(async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'ktc-excel-smoke-'));
  try {
    const splitBuilt = await buildSplitMonthlyWorkbooksLocal({ date: '2026-08-01', payload });
    assert.equal(splitBuilt.processes.length, 9, 'Phải tạo đúng 9 file công đoạn');
    assert.equal(splitBuilt.summary.fileName, '00_TONG_HOP_SAN_XUAT_08-2026.xlsx');

    const expectedProcessFiles = Object.keys(PROCESS_SHEETS).map(
      (code) => `${PROCESS_FILE_PREFIXES[code]}_08-2026.xlsx`
    );
    assert.deepEqual(splitBuilt.processes.map((item) => item.fileName), expectedProcessFiles);

    // Ghi đủ 10 file ra thư mục tạm để mô phỏng đúng cách Desktop cập nhật tháng.
    const summaryPath = path.join(temp, splitBuilt.summary.fileName);
    await fs.writeFile(summaryPath, splitBuilt.summary.buffer);
    const processPaths = new Map();
    for (const item of splitBuilt.processes) {
      const filePath = path.join(temp, item.fileName);
      await fs.writeFile(filePath, item.buffer);
      processPaths.set(item.processCode, filePath);
    }
    const generatedXlsx = (await fs.readdir(temp)).filter((name) => name.toLowerCase().endsWith('.xlsx')).sort();
    assert.equal(generatedXlsx.length, 10, 'Desktop phải tạo đúng 10 file Excel tháng');

    // Mỗi file công đoạn chỉ chứa một sheet tương ứng, tránh workbook quá nặng/rộng.
    for (const [code, config] of Object.entries(PROCESS_SHEETS)) {
      const processWorkbook = new ExcelJS.Workbook();
      await processWorkbook.xlsx.readFile(processPaths.get(code));
      const visibleSheetNames = processWorkbook.worksheets
        .filter((worksheet) => worksheet.state !== 'hidden' && worksheet.state !== 'veryHidden')
        .map((worksheet) => worksheet.name);
      assert.deepEqual(
        visibleSheetNames,
        code === 'GC' ? [config.sheet, 'TAY MÁY CẮT LỒNG'] : [config.sheet],
        code + ' phải có đúng các sheet hiển thị theo cấu hình công đoạn'
      );
      const syncSheet = processWorkbook.getWorksheet('_KTC_SYNC');
      assert.ok(syncSheet, code + ' phải có sheet metadata _KTC_SYNC');
      assert.equal(syncSheet.state, 'veryHidden', code + ': _KTC_SYNC phải ở trạng thái veryHidden');
      const syncConfig = JSON.parse(String(syncSheet.getCell('A1').value || '{}'));
      assert.equal(syncConfig.version, EXCEL_SYNC_CONTRACT_VERSION, code + ': workbook phải dùng đúng Excel sync contract version');
      if (code === 'GC') {
        const helper = processWorkbook.getWorksheet('TAY MÁY CẮT LỒNG');
        for (let row = 4; row <= helper.rowCount; row += 1) {
          const sourceRow = Number(helper.getCell(row, 1).value);
          if (!Number.isFinite(sourceRow) || sourceRow <= 0) continue;
          assert.ok(Number.isInteger(sourceRow), 'Helper GC chỉ được chứa dòng nguồn dữ liệu thật');
          assert.notEqual(String(helper.getCell(row, 3).value || '').trim().toUpperCase(), 'TỔNG CỘNG', 'Helper GC không được kéo dòng TỔNG CỘNG');
        }
      }
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(processPaths.get('GC'));
    const sheet = workbook.getWorksheet(PROCESS_SHEETS.GC.sheet);
    assert.equal(sheet.views[0].xSplit, 4, 'Freeze phải dừng ở Tên NV');
    assert.equal(sheet.views[0].topLeftCell, 'E6');

    // Mỗi ngày có đúng một hàng phân cách: ô A ghi work_date.
    // Dòng 7,8 là dữ liệu ngày 01/08; dòng 9 là hàng ngày 02/08; dòng 10 là dữ liệu ngày 02/08.
    assert.equal(sheet.getCell('A6').value, '01/08/2026', 'Ô A của hàng phân cách phải là ngày báo cáo trên form, dạng text để không hiện ###');
    assert.equal(sheet.getCell('A6').isMerged, true, 'Hàng ngày phải gộp A:D');
    assert.equal(sheet.getCell('A7').value, 1);
    assert.equal(sheet.getCell('A8').value, 2);
    assert.equal(sheet.getCell('A9').value, '02/08/2026', 'Ngày mới phải nằm tại ô A của hàng phân cách kế tiếp');
    assert.equal(sheet.getCell('D9').isMerged, true, 'Hàng ngày kế tiếp cũng phải gộp A:D');
    assert.equal(sheet.getCell('A10').value, 1, 'STT phải reset theo ngày');
    assert.equal(sheet.getCell('C7').value, '599', 'Phải sort theo thời gian duyệt trước mã NV');
    assert.equal(sheet.getCell('B7').value.getTime(), new Date('2026-08-02T08:00:00.000Z').getTime(), 'Thời gian nhập phải lấy từ created_at');

    const headerRow = sheet.getRow(5).values;
    assert.equal(headerRow.indexOf('Ngày báo cáo'), -1, 'Không được lặp ngày báo cáo trên từng dòng dữ liệu');
    assert.ok(headerRow.indexOf('Thời gian nhập') > 0, 'Phải có cột Thời gian nhập');

    const operationTypeCol = headerRow.indexOf('Loại thao tác');
    const operationModeCol = headerRow.indexOf('Chế độ');
    const trainingCol = headerRow.indexOf('% học việc');
    const standardCol = headerRow.indexOf('Định mức');
    const totalTimeCol = headerRow.indexOf('Tổng thời gian');
    const deductionTimeCol = headerRow.indexOf('Tổng thời gian trừ');
    const okCol = headerRow.indexOf('OK');
    const totalNgCol = headerRow.indexOf('Tổng NG');
    const defectCol = headerRow.indexOf('Vỡ cao su');
    const enteredOutputCol = headerRow.indexOf('SP công nhân nhập');
    const outputCol = headerRow.indexOf('Tổng SP quy đổi');
    const outputPerHourCol = headerRow.indexOf('SP/giờ');
    const ngRateCol = headerRow.indexOf('Tỷ lệ NG');

    assert.equal(sheet.getCell(7, operationTypeCol).value, 'LỒNG', 'Excel phải hiển thị Loại thao tác bằng tiếng Việt');
    assert.equal(sheet.getCell(7, operationModeCol).value, 'TAY', 'Excel phải hiển thị Chế độ bằng tiếng Việt');
    assert.equal(sheet.getCell(7, trainingCol).value, 0, '0% học việc không được đổi thành 100%');
    assert.equal(sheet.getCell(7, outputCol).value, 0, 'SP quy đổi phải dùng cùng quy tắc học việc');
    assert.equal(Number(sheet.getCell(7, ngRateCol).value.toFixed(8)), Number((2 / 47).toFixed(8)), 'Tỷ lệ NG phải là Tổng NG/(OK+NG), KQD vẫn thuộc tổng NG chất lượng');

    // Tổng SP quy đổi phải cộng toàn bộ dòng dữ liệu trong kỳ.
    // GC có 0 + 47 + 47 nên tổng phải là 94; không được lấy giá trị dòng cuối.
    assert.equal(sheet.getCell(11, outputCol).value, 94, 'TỔNG CỘNG - Tổng SP quy đổi phải cộng toàn bộ dòng');

    // File 00 giữ phần tổng hợp và đối chiếu chung; không nhét lại 9 sheet công đoạn.
    const summaryWorkbook = new ExcelJS.Workbook();
    await summaryWorkbook.xlsx.readFile(summaryPath);
    assert.deepEqual(
      summaryWorkbook.worksheets.map((worksheet) => worksheet.name),
      ['BÌA', 'TỔNG HỢP THÁNG', 'ĐỐI CHIẾU DỮ LIỆU']
    );
    const monthlySummary = summaryWorkbook.getWorksheet('TỔNG HỢP THÁNG');
    let gcSummaryRow = null;
    for (let row = 5; row <= monthlySummary.rowCount; row += 1) {
      if (String(monthlySummary.getCell(row, 1).value || '').trim() === PROCESS_SHEETS.GC.title) {
        gcSummaryRow = row;
        break;
      }
    }
    assert.ok(gcSummaryRow, 'TỔNG HỢP THÁNG phải có dòng công đoạn CẮT/LỒNG');
    assert.equal(monthlySummary.getCell(gcSummaryRow, 9).value, 94, 'TỔNG HỢP THÁNG - Tổng SP quy đổi phải cộng toàn bộ dòng');

    const integerFormat = '#,##0;-#,##0;0';
    const decimalFormat = '#,##0.##;-#,##0.##;0';

    assert.equal(sheet.getCell(7, 1).numFmt, integerFormat, 'STT phải hiển thị số nguyên');
    assert.equal(sheet.getCell(7, okCol).numFmt, integerFormat, 'OK phải hiển thị số nguyên');
    assert.equal(sheet.getCell(7, totalNgCol).numFmt, integerFormat, 'Tổng NG phải hiển thị số nguyên');
    assert.equal(sheet.getCell(7, defectCol).numFmt, integerFormat, 'NG chi tiết phải hiển thị số nguyên');
    assert.equal(sheet.getCell(7, enteredOutputCol).numFmt, integerFormat, 'SP công nhân nhập phải hiển thị số nguyên');
    assert.equal(sheet.getCell(7, outputCol).numFmt, integerFormat, 'SP quy đổi phải hiển thị số nguyên');

    assert.equal(sheet.getCell(7, totalTimeCol).numFmt, integerFormat, 'Thời gian nguyên phải hiển thị không có dấu chấm');
    assert.equal(sheet.getCell(7, deductionTimeCol).numFmt, decimalFormat, 'Trừ giờ có phần lẻ phải giữ tối đa 2 số thập phân');
    assert.equal(sheet.getCell(7, standardCol).value, 617.1, 'Định mức decimal phải giữ underlying numeric value');
    assert.equal(sheet.getCell(7, standardCol).numFmt, decimalFormat, 'Định mức decimal phải giữ tối đa 2 số thập phân');
    assert.equal(sheet.getCell(7, outputPerHourCol).numFmt, integerFormat, 'Năng suất bằng số nguyên phải hiển thị không có dấu chấm');

    for (let col = 5; col <= sheet.columnCount; col += 1) {
      assert.equal(sheet.getCell(9, col).value, null, 'Ngoài vùng A:D, hàng phân cách ngày phải để trống');
    }

    const reconciliation = summaryWorkbook.getWorksheet('ĐỐI CHIẾU DỮ LIỆU');
    assert.ok(reconciliation, 'File tổng hợp phải giữ sheet đối chiếu dữ liệu');
    assert.equal(excelDateKey(reconciliation.getCell('C4').value), '2026-08-01');
    console.log('[KTC] Excel integration smoke OK');
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
