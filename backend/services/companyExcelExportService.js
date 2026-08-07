const path = require('node:path');
const fs = require('node:fs/promises');
const ExcelJS = require('exceljs');
const db = require('../config/db');
const { loadProcessMonthReports, normalizeYearMonth } = require('./processExcelExportService');
const { calculateCountedNg } = require('../utils/outputCalculation');

const query = (sql, params = []) => new Promise((resolve, reject) => {
const { assertReportVolume } = require('./excelExportGuards');
const { removeQuietly, cleanupOldExports } = require('./exportFileMaintenance');
  db.query(sql, params, (error, rows) => error ? reject(error) : resolve(rows));
});

const TEMPLATE_DIR = path.join(__dirname, '../templates');
const GROUPS = Object.freeze({
  GIA_CONG: {
    code: 'GIA_CONG',
    title: 'Gia công',
    processCodes: ['GC'],
    template: path.join(TEMPLATE_DIR, 'bao-cao-cat-long-export.xlsx'),
    fileName: ({ month, year }) => `A+B GIA CÔNG THÁNG ${month}-${year}.xlsx`,
    sheets: [{ processCodes: ['GC'], sheetName: 'Cắt lồng', layout: 'GIA_CONG' }]
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

const LAYOUTS = Object.freeze({
  GIA_CONG: {
    headerSearchColumn: 31, // AE - Ngày/Tháng
    headerPattern: /ngày\s*\/?\s*tháng/i,
    fixed: {
      sequence: 1, workerCode: 2, workerName: 3, machine: 4, shift: 5,
      training: 6, totalTime: 7, actualTime: 8, deductionTotal: 10,
      product: 27, plannedOutput: 28, actualOutput: 29, achievement: 30,
      workDate: 31, outputPerHour: 32, ok: 33, totalNg: 34, ngRate: 35
    },
    deductions: [11, 26],
    defects: [36, 53]
  },
  MAI: {
    headerSearchColumn: 36, // AJ - ngày
    headerPattern: /ngày/i,
    fixed: {
      sequence: 1, workerCode: 2, workerName: 3, shift: 4, machine: 5,
      training: 8, totalTime: 10, actualTime: 9, deductionTotal: 11,
      product: 32, plannedOutput: 33, actualOutput: 34, achievement: 35,
      workDate: 36, outputPerHour: 37, ok: 38, totalNg: 39
    },
    deductions: [12, 31],
    defects: [40, 46]
  },
  DO: {
    headerSearchColumn: 32, // AF - ngày
    headerPattern: /ngày/i,
    fixed: {
      sequence: 1, workerCode: 2, workerName: 3, shift: 4, machine: 5,
      training: 7, totalTime: 8, actualTime: 9, deductionTotal: 10,
      product: 28, plannedOutput: 29, actualOutput: 30, achievement: 31,
      workDate: 32, outputPerHour: 33, ok: 34, totalNg: 35, ngRate: 36
    },
    deductions: [11, 27],
    defects: [37, 49]
  }
});

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
    : Number(report.actual_output ?? (ok + calculateCountedNg(report.defects || [], Boolean(Number(report.exclude_kqd_from_tt || 0)))));
  const standard = machineMetrics?.machine_count > 0 ? 0 : Math.round(toNumber(report.standard_output));
  const actualTime = toNumber(report.actual_time);
  const plannedOutput = machineMetrics?.machine_count > 0
    ? toNumber(machineMetrics.maximum_output)
    : standard * actualTime * (toNumber(report.training_percent || 100) / 100);
  const outputPerHour = actualTime > 0 ? actualOutput / actualTime : 0;
  return {
    ok, allNg, actualOutput, standard, actualTime, plannedOutput, outputPerHour,
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

const writeReportRow = (sheet, rowNumber, report, layout, deductionTypes, defectTypes, workerLookup) => {
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
  const rawTraining = toNumber(report.training_percent ?? 100);
  const trainingFactor = rawTraining > 1 ? rawTraining / 100 : Math.max(0, rawTraining);
  setCell(row, fixed.training, trainingFactor, '0%');
  setCell(row, fixed.totalTime, toNumber(report.total_time), '0.00');
  setCell(row, fixed.product, report.product_code || report.product_name || '');
  setCell(row, fixed.ok, metrics.ok, '#,##0');
  if (fixed.workDate) setCell(row, fixed.workDate, report.work_date, 'dd/mm/yyyy');

  const [deductionStart, deductionEnd] = layout.deductions;
  deductionTypes.slice(0, deductionEnd - deductionStart + 1).forEach((type, index) => {
    setCell(row, deductionStart + index,
      detailValue(report.deductions, type.id, 'hours', 'deduction_type_id'), '0.00');
  });
  const [defectStart, defectEnd] = layout.defects;
  defectTypes.slice(0, defectEnd - defectStart + 1).forEach((type, index) => {
    setCell(row, defectStart + index,
      detailValue(report.defects, type.id, 'quantity', 'defect_type_id'), '#,##0');
  });
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
  const workerLookup = buildWorkerLookup(workbook);

  for (const sheetConfig of group.sheets) {
    const processRows = loaded.filter(({ process }) => sheetConfig.processCodes.includes(String(process.process_code).toUpperCase()));
    const reports = processRows.flatMap((item) => item.reports).sort(sortReports);
    const deductionTypes = processRows.flatMap((item) => item.reports.deductionTypes || []);
    const defectTypes = processRows.flatMap((item) => item.reports.defectTypes || []);
    const sheet = workbook.getWorksheet(sheetConfig.sheetName);
    if (!sheet) throw new Error(`Thiếu sheet ${sheetConfig.sheetName} trong file mẫu`);
    const layout = LAYOUTS[sheetConfig.layout];
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
        deductionTypes,
        defectTypes,
        workerLookup
      ));
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
  return { path: filePath, fileName, groupCode: group.code, groupTitle: group.title, reportCount };
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

