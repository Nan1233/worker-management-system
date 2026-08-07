const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { buildMonthlyWorkbookLocal, buildReconciliationWorkbook, PROCESS_SHEETS } = require('../electron/monthlyWorkbookLocal.cjs');

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
    worker_code: '599', full_name: 'Nguyễn Văn Kiểm tra', shift: 'A', machine_no: 'M-01', product_name: 'QC5-1657',
    training_percent: 100, standard_output: 10, total_time: 8, actual_time: 7.5, deduction_time: 0.5,
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
    const reportBuilt = await buildMonthlyWorkbookLocal({ date: '2026-08-01', payload });
    const dataBuilt = await buildReconciliationWorkbook({ date: '2026-08-01', payload });
    const reportPath = path.join(temp, 'report.xlsx');
    const dataPath = path.join(temp, 'data.xlsx');
    await fs.writeFile(reportPath, reportBuilt.buffer);
    await fs.writeFile(dataPath, dataBuilt.buffer);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(reportPath);
    const expectedSheets = ['BÌA', 'TỔNG HỢP THÁNG', ...Object.values(PROCESS_SHEETS).map((x) => x.sheet), 'ĐỐI CHIẾU DỮ LIỆU'];
    assert.deepEqual(workbook.worksheets.map((s) => s.name), expectedSheets);

    const sheet = workbook.getWorksheet('CẮT LỒNG');
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

    assert.equal(sheet.getCell(7, trainingCol).value, 0, '0% học việc không được đổi thành 100%');
    assert.equal(sheet.getCell(7, outputCol).value, 0, 'SP quy đổi phải dùng cùng quy tắc học việc');
    assert.equal(Number(sheet.getCell(7, ngRateCol).value.toFixed(8)), Number((2 / 47).toFixed(8)), 'Tỷ lệ NG phải là Tổng NG/(OK+NG), KQD vẫn thuộc tổng NG chất lượng');

    // Tổng SP không được cộng dồn các báo cáo. Chỉ lấy kết quả SP quy đổi cuối cùng
    // hợp lệ theo đúng thứ tự báo cáo đã render. GC có 0 + 47 + 47, kết quả phải là 47, không phải 94.
    assert.equal(sheet.getCell(11, outputCol).value, 47, 'TỔNG CỘNG - Tổng SP phải lấy đúng kết quả cuối cùng, không cộng dồn');
    const monthlySummary = workbook.getWorksheet('TỔNG HỢP THÁNG');
    assert.equal(monthlySummary.getCell(5, 9).value, 47, 'TỔNG HỢP THÁNG - Tổng SP phải lấy đúng kết quả cuối cùng, không cộng dồn');

    const integerFormat = '#,##0;-#,##0;0';
    const decimalFormat = '#,##0.##;-#,##0.##;0';

    assert.equal(sheet.getCell(7, 1).numFmt, integerFormat, 'STT phải hiển thị số nguyên');
    assert.equal(sheet.getCell(7, okCol).numFmt, integerFormat, 'OK phải hiển thị số nguyên');
    assert.equal(sheet.getCell(7, totalNgCol).numFmt, integerFormat, 'Tổng NG phải hiển thị số nguyên');
    assert.equal(sheet.getCell(7, defectCol).numFmt, integerFormat, 'NG chi tiết phải hiển thị số nguyên');
    assert.equal(sheet.getCell(7, enteredOutputCol).numFmt, integerFormat, 'SP công nhân nhập phải hiển thị số nguyên');
    assert.equal(sheet.getCell(7, outputCol).numFmt, integerFormat, 'SP quy đổi phải hiển thị số nguyên');

    // Renderer chọn format theo chính giá trị: số nguyên không có dấu chấm,
    // giá trị thật sự có phần lẻ mới dùng tối đa hai chữ số thập phân.
    assert.equal(sheet.getCell(7, totalTimeCol).numFmt, integerFormat, 'Thời gian nguyên phải hiển thị không có dấu chấm');
    assert.equal(sheet.getCell(7, deductionTimeCol).numFmt, decimalFormat, 'Trừ giờ có phần lẻ phải giữ tối đa 2 số thập phân');
    assert.equal(sheet.getCell(7, standardCol).numFmt, integerFormat, 'Định mức nguyên phải hiển thị không có dấu chấm');
    assert.equal(sheet.getCell(7, outputPerHourCol).numFmt, integerFormat, 'Năng suất bằng số nguyên phải hiển thị không có dấu chấm');

    for (let col = 5; col <= sheet.columnCount; col += 1) {
      assert.equal(sheet.getCell(9, col).value, null, 'Ngoài vùng A:D, hàng phân cách ngày phải để trống');
    }

    const dataWorkbook = new ExcelJS.Workbook();
    await dataWorkbook.xlsx.readFile(dataPath);
    assert.equal(excelDateKey(dataWorkbook.getWorksheet('DATA_DB').getCell('C2').value), '2026-08-01');
    assert.equal(excelDateKey(dataWorkbook.getWorksheet('DATA_DB').getCell('D2').value), '2026-08-02');
    console.log('[KTC] Excel integration smoke OK');
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
