const path = require('node:path');
const fs = require('node:fs/promises');
const ExcelJS = require('exceljs');
const db = require('../config/db');
const { loadProcessMonthReports, normalizeYearMonth } = require('./processExcelExportService');
const { buildLayoutResolvers, writeDetailColumns } = require('./excelColumnMapping');
const { writeGcWorkerSheet } = require('./gcWorkerReportExcel');
const { buildLayoutResolvers, writeDetailColumns } = require('./excelColumnMapping');
const { writeGcWorkerSheet } = require('./gcWorkerReportExcel');
const { calculateCountedNg } = require('../utils/outputCalculation');
const { normalizeTrainingPercent, trainingFactor } = require('../utils/trainingPercent');

const { assertReportVolume } = require('./excelExportGuards');
const { removeQuietly, cleanupOldExports } = require('./exportFileMaintenance');

const query = (sql, params = []) => new Promise((resolve, reject) => {

const query = (sql, params = []) => new Promise((resolve, reject) => {
  db.query(sql, params, (error, rows) => error ? reject(error) : resolve(rows));
});

const TEMPLATE_DIR = path.join(__dirname, '../templates');
const GROUPS = Object.freeze({
  GIA_CONG: {
    code: 'GIA_CONG',
    title: 'Gia công',
    processCodes: ['GC'],
    // 04_CAT_LONG_09-2026 is the source of truth for the GC output: flat sheet,
    // one row per machine line (see gcWorkerReportExcel.js).
    template: path.join(TEMPLATE_DIR, '04_CAT_LONG_template.xlsx'),
    // 04_CAT_LONG_09-2026 is the source of truth for the GC output: flat sheet,
    // one row per machine line (see gcWorkerReportExcel.js).
    template: path.join(TEMPLATE_DIR, '04_CAT_LONG_template.xlsx'),
    fileName: ({ month, year }) => `A+B GIA CÔNG THÁNG ${month}-${year}.xlsx`,
    sheets: [{ processCodes: ['GC'], sheetName: 'Báo cáo công nhân', layout: 'GIA_CONG_04', mode: 'WORKER_DAILY' }]
    sheets: [{ processCodes: ['GC'], sheetName: 'Báo cáo công nhân', layout: 'GIA_CONG_04', mode: 'WORKER_DAILY' }]
  },
  MAI_DO: {
    code: 'MAI_DO',
    title: 'Mài - Đo',
    processCodes: ['MAI', 'DO'],
    template: path.join(TEMPLATE_DIR, 'bao-cao-mai-do-export.xlsx'),
    fileName: ({ month, year }) => `A+B MÀI - ĐO THÁNG ${month}-${year}.xlsx`,
    sheets: [
      { processCodes: ['MAI'], sheetName: 'TT Mài', layout: 'MAI' },
      { processCodes: ['DO'], sheetName: 'TT Đo', layout: 'DO' }
    ]
  }
});


// Chặn nhiều request cùng tạo một workbook lớn trong cùng tiến trình Node.
// Render gói nhỏ chỉ có khoảng 256 MB heap; chạy chồng ExcelJS sẽ gây OOM.
const runningBuilds = new Map();
const completedFiles = new Map();
const CACHE_TTL_MS = Math.max(30_000, Number(process.env.EXCEL_COMPANY_CACHE_TTL_MS) || 120_000);

const buildKey = (yearMonth, groupCode) => `${yearMonth}:${String(groupCode || '').toUpperCase()}`;

const { LAYOUTS } = require('../config/excelLayouts');
const { LAYOUTS } = require('../config/excelLayouts');

const toNumber = (value) => {
  const number = Number(String(value ?? 0).replace(/,/g, '').trim());
  return Number.isFinite(number) ? number : 0;
};

const normalizeDateKey = (value) => {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const toExcelDate = (value) => {
  const key = normalizeDateKey(value);
  if (!key) return null;
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));

const copyRowStyle = (sheet, sourceRowNumber, targetRowNumber, lastColumn) => {
  const source = sheet.getRow(sourceRowNumber);
  const target = sheet.getRow(targetRowNumber);
  target.height = source.height;
  for (let column = 1; column <= lastColumn; column += 1) {
    const from = source.getCell(column);
    const to = target.getCell(column);
    to.style = clone(from.style);
    if (from.numFmt) to.numFmt = from.numFmt;
  }
};

const findDateBlocks = (sheet, layout) => {
  const headers = [];
  for (let rowNumber = 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const text = String(sheet.getRow(rowNumber).getCell(layout.headerSearchColumn).text || '').trim();
    if (layout.headerPattern.test(text)) headers.push(rowNumber);
  }
  if (!headers.length) throw new Error(`Không tìm thấy các khối ngày trong sheet ${sheet.name}`);
  return headers.map((headerRow, index) => ({
    headerRow,
    startRow: headerRow + 1,
    endRow: (headers[index + 1] || (sheet.rowCount + 2)) - 2
  }));
};

const clearInputColumns = (sheet, block, columns) => {
  for (let rowNumber = block.startRow; rowNumber <= block.endRow; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    columns.forEach((column) => { row.getCell(column).value = null; });
  }
};

const detailValue = (items, typeId, valueKey, typeKey) => (items || [])
  .filter((item) => Number(item[typeKey]) === Number(typeId))
  .reduce((sum, item) => sum + toNumber(item[valueKey]), 0);

const getReportMetrics = (report) => {
  const ok = toNumber(report.tt_ok);
  const allNg = (report.defects || []).reduce((sum, item) => sum + toNumber(item.quantity), 0);
  const machineMetrics = report.machinePerformance;
  const actualOutput = machineMetrics?.machine_count > 0
    ? toNumber(machineMetrics.counted_output)
    : Number(report.actual_output ?? (ok + calculateCountedNg(report.defects || [], Boolean(Number(report.exclude_kqd_from_tt_snapshot ?? report.exclude_kqd_from_tt ?? 0)))));
  const standard = machineMetrics?.machine_count > 0 ? 0 : toNumber(report.standard_output);
  const isGiaCongMachine = String(report.process_code || '').trim().toUpperCase() === 'GC'
    && String(report.operation_mode || '').trim().toUpperCase() === 'MACHINE';
  const machineAccounting = isGiaCongMachine ? report.machineAccounting : null;
  const totalTime = machineAccounting ? toNumber(machineAccounting.grossHours) : toNumber(report.total_time);
  const actualTime = machineAccounting ? toNumber(machineAccounting.netHours) : toNumber(report.actual_time);
  const isGiaCongMachine = String(report.process_code || '').trim().toUpperCase() === 'GC'
    && String(report.operation_mode || '').trim().toUpperCase() === 'MACHINE';
  const machineAccounting = isGiaCongMachine ? report.machineAccounting : null;
  const totalTime = machineAccounting ? toNumber(machineAccounting.grossHours) : toNumber(report.total_time);
  const actualTime = machineAccounting ? toNumber(machineAccounting.netHours) : toNumber(report.actual_time);
  const plannedOutput = machineMetrics?.machine_count > 0
    ? toNumber(machineMetrics.maximum_output)
    : standard * actualTime * trainingFactor(report.training_percent);
  const outputPerHour = actualTime > 0 ? actualOutput / actualTime : 0;
  return {
    ok, allNg, actualOutput, standard, totalTime, actualTime, plannedOutput, outputPerHour,
    ok, allNg, actualOutput, standard, totalTime, actualTime, plannedOutput, outputPerHour,
    achievement: plannedOutput > 0 ? actualOutput / plannedOutput : 0,
    ngRate: (ok + allNg) > 0 ? allNg / (ok + allNg) : 0
  };
};

const setCell = (row, column, value, numFmt = null) => {
  if (!column) return;
  const cell = row.getCell(column);
  cell.value = value;
  if (numFmt) cell.numFmt = numFmt;
};

const normalizeWorkerCode = (value) => {
  const cleaned = String(value ?? '')
    .replace(/\u00A0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim();

  if (!cleaned) return '';

  // Mã nhân viên lấy từ DB có thể là 599, "599", "599.0" hoặc chứa
  // khoảng trắng ẩn. Với mã chỉ gồm chữ số, chuẩn hóa về cùng một khóa để
  // khớp với mã đang có trong sheet TỔNG ĐIỂM.
  if (/^[+-]?\d+(?:\.0+)?$/.test(cleaned)) {
    const numeric = Number(cleaned);
    if (Number.isSafeInteger(numeric)) return String(numeric);
  }

  return cleaned.toUpperCase();
};

const buildWorkerLookup = (workbook) => {
  const totalSheet = workbook.getWorksheet('TỔNG ĐIỂM');
  if (!totalSheet) throw new Error('Thiếu sheet TỔNG ĐIỂM trong file mẫu');

  const firstRow = 4;
  // File công ty hiện dành vùng danh mục nhân viên B4:C503. Không quét toàn
  // sheet vì phía dưới còn dữ liệu tổng hợp khác, có thể bị hiểu nhầm là mã NV.
  const configuredLastRow = Math.max(
    firstRow,
    Number(process.env.EXCEL_WORKER_LOOKUP_LAST_ROW) || 503
  );
  const lastRow = Math.min(configuredLastRow, Math.max(totalSheet.rowCount, configuredLastRow));
  const valuesByCode = new Map();

  for (let rowNumber = firstRow; rowNumber <= lastRow; rowNumber += 1) {
    const codeCell = totalSheet.getRow(rowNumber).getCell(2);
    const nameCell = totalSheet.getRow(rowNumber).getCell(3);
    const rawCode = codeCell.value && typeof codeCell.value === 'object'
      ? (codeCell.value.result ?? codeCell.text)
      : codeCell.value;
    const rawName = nameCell.value && typeof nameCell.value === 'object'
      ? (nameCell.value.result ?? nameCell.text)
      : nameCell.value;
    const normalizedCode = normalizeWorkerCode(rawCode);
    const normalizedName = normalizeWorkerCode(rawName);

    if (normalizedCode && normalizedName && !valuesByCode.has(normalizedCode)) {
      // Lưu cả mã gốc và tên đã có trong TỔNG ĐIỂM. Tên được dùng làm
      // cached result của công thức để file hiển thị đúng ngay cả trước khi
      // Excel thực hiện full recalculation.
      valuesByCode.set(normalizedCode, {
        value: rawCode,
        name: normalizedName,
        numFmt: codeCell.numFmt || 'General'
      });
    }
  }

  return { totalSheet, firstRow, lastRow, valuesByCode };
};

const findWorkerLookupEntry = (value, lookup) => {
  const normalized = normalizeWorkerCode(value);
  if (!normalized) return null;
  return lookup.valuesByCode.get(normalized) || null;
};

const workerCodeForExcel = (value, lookup) => {
  const normalized = normalizeWorkerCode(value);
  if (!normalized) return '';
  const entry = findWorkerLookupEntry(value, lookup);
  return entry ? entry.value : normalized;
};

const workerNameForExcel = (value, lookup) => {
  const entry = findWorkerLookupEntry(value, lookup);
  return entry ? entry.name : '';
};

const workerNameFormula = (rowNumber, lookup) => {
  const range = `'TỔNG ĐIỂM'!$B$${lookup.firstRow}:$C$${lookup.lastRow}`;
  const codeCell = `B${rowNumber}`;

  // Thử khớp theo giá trị gốc, theo text và cuối cùng theo number. Cách này
  // xử lý được trường hợp một sheet lưu mã 599 dạng số còn sheet kia lưu
  // "599" dạng text. IFERROR(VALUE(...), ...) tránh lỗi với mã có chữ.
  return `IF(${codeCell}="","",IFERROR(` +
    `VLOOKUP(${codeCell},${range},2,FALSE),` +
    `IFERROR(VLOOKUP(${codeCell}&"",${range},2,FALSE),` +
    `IFERROR(VLOOKUP(IFERROR(VALUE(${codeCell}),${codeCell}),${range},2,FALSE),""))))`;
};

const ensureWorkerNameFormulas = (sheet, blocks, layout, lookup) => {
  const workerNameColumn = layout.fixed.workerName;
  if (!workerNameColumn) return;

  blocks.forEach((block) => {
    for (let rowNumber = block.startRow; rowNumber <= block.endRow; rowNumber += 1) {
      const cell = sheet.getRow(rowNumber).getCell(workerNameColumn);
      const workerCode = sheet.getRow(rowNumber).getCell(layout.fixed.workerCode).value;
      cell.value = {
        formula: workerNameFormula(rowNumber, lookup),
        result: workerNameForExcel(workerCode, lookup)
      };
    }
  });
};

const getInputColumns = (layout) => {
  const fixed = layout.fixed;
  const columns = [
    fixed.workerCode,
    fixed.machine,
    fixed.shift,
    fixed.training,
    fixed.totalTime,
    fixed.product,
    fixed.ok
  ];
  const [deductionStart, deductionEnd] = layout.deductions;
  const [defectStart, defectEnd] = layout.defects;
  for (let column = deductionStart; column <= deductionEnd; column += 1) columns.push(column);
  for (let column = defectStart; column <= defectEnd; column += 1) columns.push(column);
  return [...new Set(columns.filter(Boolean))];
};

const writeReportRow = (sheet, rowNumber, report, layout, mapping, workerLookup) => {
const writeReportRow = (sheet, rowNumber, report, layout, mapping, workerLookup) => {
  const row = sheet.getRow(rowNumber);
  const fixed = layout.fixed;
  const metrics = getReportMetrics(report);

  // Chỉ ghi đúng các ô đầu vào của từng mẫu. Không dùng cột Gia công cho Mài/Đo.
  // Mọi ô công thức và sheet tổng hợp của workbook công ty được giữ nguyên.
  const workerEntry = findWorkerLookupEntry(report.worker_code, workerLookup);
  setCell(row, fixed.workerCode, workerCodeForExcel(report.worker_code, workerLookup));
  if (fixed.workerCode && workerEntry?.numFmt) {
    row.getCell(fixed.workerCode).numFmt = workerEntry.numFmt;
  }
  if (fixed.workerName) {
    // Ưu tiên tên công nhân lấy trực tiếp từ DB để không phụ thuộc kiểu dữ liệu
    // mã NV trong sheet TỔNG ĐIỂM. Chỉ dùng lookup của template làm phương án cuối.
    setCell(row, fixed.workerName, report.full_name || report.worker_name || workerNameForExcel(report.worker_code, workerLookup));
  }
  setCell(row, fixed.machine, report.machine_no || report.machine_code || '');
  setCell(row, fixed.shift, report.shift || '');
  const trainingPercent = normalizeTrainingPercent(report.training_percent);
  const trainingFactorValue = trainingPercent / 100;
  setCell(row, fixed.training, trainingFactorValue, '0%');
  setCell(row, fixed.totalTime, metrics.totalTime, '0.00');
  setCell(row, fixed.totalTime, metrics.totalTime, '0.00');
  setCell(row, fixed.product, report.product_code || report.product_name || '');
  setCell(row, fixed.ok, metrics.ok, '#,##0');
  if (fixed.workDate) setCell(row, fixed.workDate, report.work_date, 'dd/mm/yyyy');

  writeDetailColumns(row, report, mapping);
  writeDetailColumns(row, report, mapping);
};

const reportTimeKey = (report) => String(report.approved_at || report.created_at || report.entry_date || report.work_date || '');

const sortReports = (a, b) => normalizeDateKey(a.work_date).localeCompare(normalizeDateKey(b.work_date))
  || reportTimeKey(a).localeCompare(reportTimeKey(b))
  || String(a.worker_code || '').localeCompare(String(b.worker_code || ''), undefined, { numeric: true })
  || String(a.machine_no || '').localeCompare(String(b.machine_no || ''), undefined, { numeric: true })
  || Number(a.id) - Number(b.id);

async function resolveProcesses(group) {
  if (!group) throw new Error('Nhóm file Excel không hợp lệ');
  const placeholders = group.processCodes.map(() => '?').join(',');
  return query(
    `SELECT id, process_code, process_name FROM processes WHERE UPPER(process_code) IN (${placeholders}) ORDER BY id`,
    group.processCodes.map((code) => code.toUpperCase())
  );
}

// Per-machine NG detail lives in production_report_machine_defects (or the line's own
// defects_json). Event-level defects are NOT used: they are shared by every worker on
// the machine and would be repeated on each machine line.
async function attachMachineLineDefects(reports) {
  const lines = reports.flatMap((report) => (Array.isArray(report.machineLines) ? report.machineLines : []));
  const lineIds = lines.map((line) => Number(line.id)).filter((id) => Number.isInteger(id) && id > 0);
  const byLine = new Map();
  for (let i = 0; i < lineIds.length; i += 400) {
    const ids = lineIds.slice(i, i + 400);
    const rows = await query(
      `SELECT machine_line_id, defect_type_id, defect_code, defect_name, quantity
         FROM production_report_machine_defects
        WHERE machine_line_id IN (${ids.map(() => '?').join(',')}) AND quantity > 0
        ORDER BY machine_line_id, id`,
      ids
    );
    for (const row of rows) {
      const key = Number(row.machine_line_id);
      if (!byLine.has(key)) byLine.set(key, []);
      byLine.get(key).push({ defect_type_id: row.defect_type_id, defect_code: row.defect_code, defect_name: row.defect_name, quantity: row.quantity });
    }
  }
  for (const line of lines) {
    const persisted = byLine.get(Number(line.id));
    if (persisted?.length) line.defects = persisted;
  }
}

// Per-machine NG detail lives in production_report_machine_defects (or the line's own
// defects_json). Event-level defects are NOT used: they are shared by every worker on
// the machine and would be repeated on each machine line.
async function attachMachineLineDefects(reports) {
  const lines = reports.flatMap((report) => (Array.isArray(report.machineLines) ? report.machineLines : []));
  const lineIds = lines.map((line) => Number(line.id)).filter((id) => Number.isInteger(id) && id > 0);
  const byLine = new Map();
  for (let i = 0; i < lineIds.length; i += 400) {
    const ids = lineIds.slice(i, i + 400);
    const rows = await query(
      `SELECT machine_line_id, defect_type_id, defect_code, defect_name, quantity
         FROM production_report_machine_defects
        WHERE machine_line_id IN (${ids.map(() => '?').join(',')}) AND quantity > 0
        ORDER BY machine_line_id, id`,
      ids
    );
    for (const row of rows) {
      const key = Number(row.machine_line_id);
      if (!byLine.has(key)) byLine.set(key, []);
      byLine.get(key).push({ defect_type_id: row.defect_type_id, defect_code: row.defect_code, defect_name: row.defect_name, quantity: row.quantity });
    }
  }
  for (const line of lines) {
    const persisted = byLine.get(Number(line.id));
    if (persisted?.length) line.defects = persisted;
  }
}

async function loadGroupReports(yearMonth, group) {
  const processes = await resolveProcesses(group);
  const loaded = await Promise.all(processes.map(async (process) => ({
    process,
    reports: await loadProcessMonthReports(yearMonth, process.id)
  })));
  return loaded;
}

async function listCompanyFiles(value) {
  normalizeYearMonth(value);
  // Endpoint danh sách không cần tải dữ liệu báo cáo. Trước đây hàm này tải toàn
  // bộ dữ liệu hai nhóm chỉ để đếm dòng, làm tăng RAM ngay trước lúc xuất file.
  return Object.values(GROUPS).map((group) => ({
    code: group.code,
    title: group.title,
    reportCount: null
  }));
}

async function buildCompanyWorkbookInternal(value, groupCode) {
  const yearMonth = normalizeYearMonth(value);
  const group = GROUPS[String(groupCode || '').toUpperCase()];
  if (!group) {
    const error = new Error('Nhóm file Excel không hợp lệ');
    error.statusCode = 400;
    throw error;
  }
  await fs.access(group.template);
  const processes = await resolveProcesses(group);
  await assertReportVolume({ yearMonth, processIds: processes.map((item) => Number(item.id)) });
  const loaded = await Promise.all(processes.map(async (process) => ({ process, reports: await loadProcessMonthReports(yearMonth, process.id) })));
  const reportCount = loaded.reduce((sum, item) => sum + item.reports.length, 0);

  // Không chặn tháng chưa có báo cáo. Vẫn xuất nguyên workbook mẫu để Excel
  // luôn được tạo tự động; dữ liệu sẽ được bổ sung ở các lần đồng bộ sau.
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(group.template);
  workbook.calcProperties.fullCalcOnLoad = true;
  workbook.calcProperties.forceFullCalc = true;
  workbook.calcProperties.calcMode = 'auto';
  workbook.calcProperties.calcId = 0;
  workbook.calcProperties.concurrentCalc = true;
  const needsWorkerLookup = group.sheets.some((sheetConfig) => sheetConfig.mode !== 'WORKER_DAILY');
  const workerLookup = needsWorkerLookup ? buildWorkerLookup(workbook) : null;
  const unmappedDetails = [];
  const warningDetails = [];
  const needsWorkerLookup = group.sheets.some((sheetConfig) => sheetConfig.mode !== 'WORKER_DAILY');
  const workerLookup = needsWorkerLookup ? buildWorkerLookup(workbook) : null;
  const unmappedDetails = [];
  const warningDetails = [];

  for (const sheetConfig of group.sheets) {
    const processRows = loaded.filter(({ process }) => sheetConfig.processCodes.includes(String(process.process_code).toUpperCase()));
    const reports = processRows.flatMap((item) => item.reports).sort(sortReports);
    const deductionTypes = processRows.flatMap((item) => item.reports.deductionTypes || []);
    const defectTypes = processRows.flatMap((item) => item.reports.defectTypes || []);
    const sheet = workbook.getWorksheet(sheetConfig.sheetName);
    if (!sheet) throw new Error(`Thiếu sheet ${sheetConfig.sheetName} trong file mẫu`);
    if (sheetConfig.mode === 'WORKER_DAILY') {
      await attachMachineLineDefects(reports);
      const written = writeGcWorkerSheet(sheet, reports, { deductionTypes, defectTypes });
      if (written.unmapped.length) {
        const summary = new Map();
        for (const item of written.unmapped) summary.set(`${item.kind}:${item.name}`, (summary.get(`${item.kind}:${item.name}`) || 0) + 1);
        console.warn(`[KTC][EXCEL] ${sheet.name}: ${written.unmapped.length} chi tiết không có cột tương ứng: ${[...summary.entries()].map(([k, n]) => `${k} x${n}`).join('; ')}`);
        unmappedDetails.push(...written.unmapped.map((item) => ({ sheet: sheet.name, ...item })));
      }
      if (written.warnings.length) {
        console.warn(`[KTC][EXCEL] ${sheet.name}: ${written.warnings.length} cảnh báo dữ liệu dòng máy: ${[...new Set(written.warnings.map((w) => w.code))].join(', ')}`);
        warningDetails.push(...written.warnings.map((item) => ({ sheet: sheet.name, ...item })));
      }
      continue;
    }
    if (sheetConfig.mode === 'WORKER_DAILY') {
      await attachMachineLineDefects(reports);
      const written = writeGcWorkerSheet(sheet, reports, { deductionTypes, defectTypes });
      if (written.unmapped.length) {
        const summary = new Map();
        for (const item of written.unmapped) summary.set(`${item.kind}:${item.name}`, (summary.get(`${item.kind}:${item.name}`) || 0) + 1);
        console.warn(`[KTC][EXCEL] ${sheet.name}: ${written.unmapped.length} chi tiết không có cột tương ứng: ${[...summary.entries()].map(([k, n]) => `${k} x${n}`).join('; ')}`);
        unmappedDetails.push(...written.unmapped.map((item) => ({ sheet: sheet.name, ...item })));
      }
      if (written.warnings.length) {
        console.warn(`[KTC][EXCEL] ${sheet.name}: ${written.warnings.length} cảnh báo dữ liệu dòng máy: ${[...new Set(written.warnings.map((w) => w.code))].join(', ')}`);
        warningDetails.push(...written.warnings.map((item) => ({ sheet: sheet.name, ...item })));
      }
      continue;
    }
    const layout = LAYOUTS[sheetConfig.layout];
    const mapping = {
      ...buildLayoutResolvers(sheet, layout, sheetConfig.layout),
      deductionNameById: new Map(deductionTypes.map((type) => [Number(type.id), type.deduction_name || type.name])),
      defectNameById: new Map(defectTypes.map((type) => [Number(type.id), type.defect_name || type.name])),
      unmapped: []
    };
    // Header cells the bundled template lost are restored from the company sample.
    [...mapping.deductionColumns, ...mapping.defectColumns]
      .filter((entry) => entry.filledFromContract)
      .forEach((entry) => { sheet.getRow(layout.labelRow).getCell(entry.column).value = entry.label; });
    const mapping = {
      ...buildLayoutResolvers(sheet, layout, sheetConfig.layout),
      deductionNameById: new Map(deductionTypes.map((type) => [Number(type.id), type.deduction_name || type.name])),
      defectNameById: new Map(defectTypes.map((type) => [Number(type.id), type.defect_name || type.name])),
      unmapped: []
    };
    // Header cells the bundled template lost are restored from the company sample.
    [...mapping.deductionColumns, ...mapping.defectColumns]
      .filter((entry) => entry.filledFromContract)
      .forEach((entry) => { sheet.getRow(layout.labelRow).getCell(entry.column).value = entry.label; });
    const blocks = findDateBlocks(sheet, layout);
    const inputColumns = getInputColumns(layout);
    blocks.forEach((block) => clearInputColumns(sheet, block, inputColumns));
    ensureWorkerNameFormulas(sheet, blocks, layout, workerLookup);

    const byDay = new Map();
    reports.forEach((report) => {
      const day = Number(normalizeDateKey(report.work_date).slice(8, 10));
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day).push(report);
    });

    for (const [day, dayReports] of byDay.entries()) {
      const block = blocks[day - 1];
      if (!block) throw new Error(`File mẫu ${sheet.name} không có khối cho ngày ${day}`);
      if (dayReports.length > block.endRow - block.startRow + 1) {
        throw new Error(`Ngày ${day} có ${dayReports.length} dòng, vượt sức chứa của mẫu ${sheet.name}`);
      }
      dayReports.forEach((report, index) => writeReportRow(
        sheet,
        block.startRow + index,
        report,
        layout,
        mapping,
        mapping,
        workerLookup
      ));
    }
    if (mapping.unmapped.length) {
      const summary = new Map();
      for (const item of mapping.unmapped) {
        const key = `${item.kind}:${item.name}`;
        summary.set(key, (summary.get(key) || 0) + 1);
      }
      console.warn(`[KTC][EXCEL] ${sheet.name}: ${mapping.unmapped.length} chi tiết không có cột tương ứng trong mẫu: ${[...summary.entries()].map(([k, n]) => `${k} x${n}`).join('; ')}`);
      unmappedDetails.push(...mapping.unmapped.map((item) => ({ sheet: sheet.name, ...item })));
    }
    if (mapping.unmapped.length) {
      const summary = new Map();
      for (const item of mapping.unmapped) {
        const key = `${item.kind}:${item.name}`;
        summary.set(key, (summary.get(key) || 0) + 1);
      }
      console.warn(`[KTC][EXCEL] ${sheet.name}: ${mapping.unmapped.length} chi tiết không có cột tương ứng trong mẫu: ${[...summary.entries()].map(([k, n]) => `${k} x${n}`).join('; ')}`);
      unmappedDetails.push(...mapping.unmapped.map((item) => ({ sheet: sheet.name, ...item })));
    }
  }

  const [year, month] = yearMonth.split('-');
  const root = process.env.EXCEL_COMPANY_TEMP_ROOT || path.join(process.cwd(), 'exports-company');
  const folder = path.join(root, year, month);
  await fs.mkdir(folder, { recursive: true });
  const fileName = group.fileName({ year, month });
  const filePath = path.join(folder, fileName);
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await workbook.xlsx.writeFile(temporaryPath);
    await fs.rm(filePath, { force: true });
    await fs.rename(temporaryPath, filePath);
  } finally {
    await removeQuietly(temporaryPath);
  }
  const stat = await fs.stat(filePath);
  cleanupOldExports(path.dirname(filePath)).catch(() => undefined);
  return { path: filePath, fileName, groupCode: group.code, groupTitle: group.title, reportCount, unmappedDetails, warningDetails };
  return { path: filePath, fileName, groupCode: group.code, groupTitle: group.title, reportCount, unmappedDetails, warningDetails };
}


async function buildCompanyWorkbook(value, groupCode) {
  const yearMonth = normalizeYearMonth(value);
  const normalizedGroup = String(groupCode || '').toUpperCase();
  const key = buildKey(yearMonth, normalizedGroup);

  const cached = completedFiles.get(key);
  if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
    try {
      await fs.access(cached.result.path);
      return cached.result;
    } catch {
      completedFiles.delete(key);
    }
  }

  if (runningBuilds.has(key)) return runningBuilds.get(key);

  const promise = buildCompanyWorkbookInternal(yearMonth, normalizedGroup)
    .then((result) => {
      completedFiles.set(key, { createdAt: Date.now(), result });
      return result;
    })
    .finally(() => runningBuilds.delete(key));

  runningBuilds.set(key, promise);
  return promise;
}


async function loadCompanyGroupData(value, groupCode) {
  const yearMonth = normalizeYearMonth(value);
  const group = GROUPS[String(groupCode || '').toUpperCase()];
  if (!group) {
    const error = new Error('Nhóm file Excel không hợp lệ');
    error.statusCode = 400;
    throw error;
  }

  const loaded = await loadGroupReports(yearMonth, group);
  return {
    code: group.code,
    title: group.title,
    sheets: group.sheets,
    processes: loaded.map(({ process, reports }) => ({
      process,
      reports: Array.from(reports),
      deductionTypes: reports.deductionTypes || [],
      defectTypes: reports.defectTypes || []
    }))
  };
}

async function loadCompanyData(value) {
  const yearMonth = normalizeYearMonth(value);
  const groups = {};
  for (const group of Object.values(GROUPS)) {
    groups[group.code] = await loadCompanyGroupData(yearMonth, group.code);
  }
  return { yearMonth, groups };
}

module.exports = { GROUPS, listCompanyFiles, loadCompanyData, loadCompanyGroupData, buildCompanyWorkbook };

