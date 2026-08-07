const ExcelJS = require('exceljs');
const path = require('node:path');
const fs = require('node:fs/promises');
const db = require('../config/db');
const { loadProcessMonthReports, normalizeYearMonth } = require('./processExcelExportService');
const { buildCompanyWorkbook } = require('./companyExcelExportService');
const { assertReportVolume } = require('./excelExportGuards');
const { removeQuietly, cleanupOldExports } = require('./exportFileMaintenance');

const TEMPLATE_PATH = path.join(__dirname, '../templates/bao-cao-mai-do-export.xlsx');
const PROCESS_CODES = new Set(['MAI', 'DO']);

const query = (sql, params = []) => new Promise((resolve, reject) => {
  db.query(sql, params, (error, rows) => (error ? reject(error) : resolve(rows)));
});

const normalizeText = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .replace(/Đ/g, 'D')
  .toUpperCase()
  .replace(/[^A-Z0-9]+/g, ' ')
  .trim();

const toNumber = (value) => {
  const numberValue = Number(String(value ?? 0).replace(/,/g, '').trim());
  return Number.isFinite(numberValue) ? numberValue : 0;
};

const normalizeDateKey = (value) => {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toExcelDate = (dateKey) => {
  const [year, month, day] = String(dateKey).split('-').map(Number);
  return new Date(year, month - 1, day);
};

const getDaysInMonth = (yearMonth) => {
  const [year, month] = String(yearMonth).split('-').map(Number);
  return new Date(year, month, 0).getDate();
};

const shiftToCompanyValue = (value) => {
  const normalized = normalizeText(value);
  if (normalized.includes('3') || normalized === 'C') return 'C';
  if (normalized.includes('2') || normalized === 'B') return 'B';
  return 'A';
};

const safeName = (value, fallback) => String(value || fallback)
  .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
  .replace(/\s+/g, ' ')
  .trim() || fallback;

const detailKey = (item, kind) => normalizeText([
  item?.[`${kind}_code`],
  item?.[`${kind}_name`],
  item?.code,
  item?.name
].filter(Boolean).join(' '));

const sumDetail = (items, predicate, valueKey) => (items || [])
  .filter((item) => predicate(detailKey(item, valueKey === 'hours' ? 'deduction' : 'defect')))
  .reduce((sum, item) => sum + toNumber(item[valueKey]), 0);

const containsAny = (text, aliases) => aliases.some((alias) => text.includes(alias));

const DEDUCTION_ALIASES = Object.freeze({
  THIEU_SP: ['THIEU SP', 'THIEU SAN LUONG'],
  BAT_MAY: ['BAT MAY', 'XET MAY', 'DAU GIO'],
  CHUYEN_MA: ['CHUYEN MA'],
  CHINH_MAY: ['CHINH MAY'],
  CHO_CHINH_MAY: ['CHO CHINH MAY'],
  MAI_DA: ['MAI DA'],
  BAO_DUONG: ['BAO DUONG'],
  KHONG_KH: ['KHONG CO KHSX', 'KO CO KHSX', 'DUNG MAY KO HT', 'DUNG MAY KHONG HT'],
  CHO_HANG: ['CHO HANG', 'HET HANG'],
  MAT_KHI: ['MAT KHI', 'KHI YEU'],
  NGHI_GIAI_LAO: ['NGHI GIAI LAO'],
  GIAO_CA: ['GIAO CA'],
  HO_TRO: ['HO TRO'],
  FIVE_S: ['5S', 'LAY BUI', 'DO BUI', 'XI BUI'],
  HOC_VIEC: ['HOC VIEC', 'DAO TAO'],
  THOI_BUI: ['THOI BUI'],
  DI_DO: ['DI DO', 'DO KIEM SOAT'],
  DI_MUON: ['DI MUON', 'VE SOM'],
  TAT_HUT_BUI: ['TAT MAY HUT BUI'],
  MAT_DIEN: ['MAT DIEN'],
  LUU_DL: ['LUU DL', 'LUU DU LIEU'],
  KS_DF: ['KS DF', 'KIEM SOAT DF'],
  RAI_HANG: ['RAI HANG', 'CV KHAC', 'CONG VIEC KHAC'],
  KIEM_KHO: ['KIEM KHO'],
  KHAC: ['KHAC', 'DAY HANG XUAT']
});

const DEFECT_ALIASES = Object.freeze({
  KQD: ['KQD', 'DAO CS'],
  XO_CS: ['XO CS', 'XO CAO SU'],
  PPCM: ['PPCM', 'PP MAT DIEN'],
  HANG_ROI: ['HANG ROI'],
  K_COLET: ['K COLET', 'KHONG COLET'],
  CSH: ['CSH', 'THIEU LAN CS'],
  LOI_CAO_SU: ['LOI CAO SU'],
  LON: ['LON'],
  NHO: ['NHO'],
  FURE_CAO_SU: ['FURE CAO SU'],
  FURE_TRUC: ['FURE TRUC'],
  LAN_HANG: ['LAN HANG'],
  TRUC_CONG: ['TRUC CONG'],
  LECH_DIEM: ['LECH DIEM'],
  LOI_TRUC: ['LOI TRUC'],
  CHUA_MAI: ['CHUA MAI'],
  MAI_2_LAN: ['MAI 2 LAN'],
  HO_VAI: ['HO VAI']
});

const sumByAliases = (items, aliases, valueKey) => sumDetail(
  items,
  (text) => containsAny(text, aliases),
  valueKey
);

const setInputCell = (row, columnNumber, value) => {
  const cell = row.getCell(columnNumber);
  cell.value = value === 0 ? 0 : (value || null);
};

const clearInputColumns = (sheet, rowNumbers, columns) => {
  rowNumbers.forEach((rowNumber) => {
    const row = sheet.getRow(rowNumber);
    columns.forEach((columnNumber) => {
      row.getCell(columnNumber).value = null;
    });
  });
};

const discoverHeaderRows = (sheet, minimumRow) => {
  const rows = [];
  for (let rowNumber = minimumRow; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const value = sheet.getRow(rowNumber).getCell(1).value;
    const text = typeof value === 'object' && value !== null
      ? String(value.result ?? value.text ?? '')
      : String(value ?? '');
    if (normalizeText(text) === 'STT') rows.push(rowNumber);
  }
  return rows;
};

const groupByDay = (reports, yearMonth) => {
  const grouped = new Map();
  reports.forEach((report) => {
    const dateKey = normalizeDateKey(report.work_date);
    if (!dateKey.startsWith(`${yearMonth}-`)) return;
    const day = Number(dateKey.slice(8, 10));
    if (!grouped.has(day)) grouped.set(day, []);
    grouped.get(day).push(report);
  });
  grouped.forEach((rows) => rows.sort((a, b) => {
    const workerCompare = String(a.worker_code || '').localeCompare(String(b.worker_code || ''), undefined, { numeric: true });
    return workerCompare || String(a.machine_no || '').localeCompare(String(b.machine_no || ''), undefined, { numeric: true }) || Number(a.id) - Number(b.id);
  }));
  return grouped;
};

const fillMaiSheet = (sheet, reports, yearMonth) => {
  const headerRows = discoverHeaderRows(sheet, 300).filter((row) => row >= 343).slice(0, 31);
  if (headerRows.length < 28) throw new Error('File mẫu Mài không có đủ vùng nhập theo ngày');
  const grouped = groupByDay(reports, yearMonth);
  const inputColumns = [2, 4, 5, 8, 9, ...Array.from({ length: 19 }, (_, index) => 13 + index), 32, 34, ...Array.from({ length: 14 }, (_, index) => 40 + index)];

  headerRows.forEach((headerRow, dayIndex) => {
    const day = dayIndex + 1;
    const nextHeader = headerRows[dayIndex + 1];
    const dataStart = headerRow + 1;
    const dataEnd = nextHeader ? nextHeader - 2 : Math.min(sheet.rowCount, dataStart + 149);
    const rowNumbers = Array.from({ length: Math.max(0, dataEnd - dataStart + 1) }, (_, index) => dataStart + index);
    clearInputColumns(sheet, rowNumbers, inputColumns);

    const dateRow = sheet.getRow(headerRow - 1);
    const validDay = day <= getDaysInMonth(yearMonth);
    dateRow.getCell(1).value = validDay
      ? toExcelDate(`${yearMonth}-${String(day).padStart(2, '0')}`)
      : null;
    dateRow.getCell(1).numFmt = 'dd/mm/yyyy';

    const dayReports = validDay ? (grouped.get(day) || []) : [];
    dayReports.slice(0, rowNumbers.length).forEach((report, index) => {
      const row = sheet.getRow(rowNumbers[index]);
      const trainingFactor = toNumber(report.training_percent) > 1
        ? toNumber(report.training_percent) / 100
        : (toNumber(report.training_percent) || 1);
      const actualTime = toNumber(report.actual_time);
      const standardRate = toNumber(report.standard_output);
      const plannedOutput = actualTime * trainingFactor * standardRate;
      const actualOutput = toNumber(report.actual_output);
      const totalNg = toNumber(report.tt_ng);

      setInputCell(row, 2, report.worker_code);
      setInputCell(row, 4, shiftToCompanyValue(report.shift));
      setInputCell(row, 5, report.machine_no);
      setInputCell(row, 8, trainingFactor);
      setInputCell(row, 9, toNumber(report.total_time));

      const deductions = report.deductions || [];
      setInputCell(row, 12, sumByAliases(deductions, DEDUCTION_ALIASES.THIEU_SP, 'hours'));
      setInputCell(row, 13, sumByAliases(deductions, DEDUCTION_ALIASES.BAT_MAY, 'hours'));
      setInputCell(row, 14, sumByAliases(deductions, DEDUCTION_ALIASES.CHUYEN_MA, 'hours'));
      setInputCell(row, 15, sumByAliases(deductions, DEDUCTION_ALIASES.CHINH_MAY, 'hours'));
      setInputCell(row, 16, sumByAliases(deductions, DEDUCTION_ALIASES.CHO_CHINH_MAY, 'hours'));
      setInputCell(row, 17, sumByAliases(deductions, DEDUCTION_ALIASES.MAI_DA, 'hours'));
      setInputCell(row, 18, sumByAliases(deductions, DEDUCTION_ALIASES.BAO_DUONG, 'hours'));
      setInputCell(row, 19, sumByAliases(deductions, DEDUCTION_ALIASES.KHONG_KH, 'hours'));
      setInputCell(row, 20, sumByAliases(deductions, DEDUCTION_ALIASES.CHO_HANG, 'hours'));
      setInputCell(row, 21, sumByAliases(deductions, DEDUCTION_ALIASES.MAT_KHI, 'hours'));
      setInputCell(row, 22, sumByAliases(deductions, DEDUCTION_ALIASES.NGHI_GIAI_LAO, 'hours'));
      setInputCell(row, 23, sumByAliases(deductions, DEDUCTION_ALIASES.GIAO_CA, 'hours'));
      setInputCell(row, 24, sumByAliases(deductions, DEDUCTION_ALIASES.HO_TRO, 'hours'));
      setInputCell(row, 25, sumByAliases(deductions, DEDUCTION_ALIASES.FIVE_S, 'hours'));
      setInputCell(row, 26, sumByAliases(deductions, DEDUCTION_ALIASES.HOC_VIEC, 'hours'));
      setInputCell(row, 27, sumByAliases(deductions, DEDUCTION_ALIASES.THOI_BUI, 'hours'));
      setInputCell(row, 28, sumByAliases(deductions, DEDUCTION_ALIASES.DI_DO, 'hours'));
      setInputCell(row, 29, sumByAliases(deductions, DEDUCTION_ALIASES.DI_MUON, 'hours'));
      setInputCell(row, 30, sumByAliases(deductions, DEDUCTION_ALIASES.TAT_HUT_BUI, 'hours'));
      setInputCell(row, 31, sumByAliases(deductions, DEDUCTION_ALIASES.MAT_DIEN, 'hours'));

      setInputCell(row, 32, report.product_name);
      setInputCell(row, 34, actualOutput);

      const defects = report.defects || [];
      setInputCell(row, 40, sumByAliases(defects, DEFECT_ALIASES.KQD, 'quantity'));
      setInputCell(row, 41, sumByAliases(defects, DEFECT_ALIASES.XO_CS, 'quantity'));
      setInputCell(row, 42, sumByAliases(defects, DEFECT_ALIASES.PPCM, 'quantity'));
      setInputCell(row, 43, sumByAliases(defects, DEFECT_ALIASES.HANG_ROI, 'quantity'));
      setInputCell(row, 44, sumByAliases(defects, DEFECT_ALIASES.K_COLET, 'quantity'));
      setInputCell(row, 45, sumByAliases(defects, DEFECT_ALIASES.CSH, 'quantity'));
      setInputCell(row, 46, sumByAliases(defects, DEFECT_ALIASES.LOI_CAO_SU, 'quantity'));
    });
  });
};

const fillDoSheet = (sheet, reports, yearMonth) => {
  const headerRows = discoverHeaderRows(sheet, 200).filter((row) => row >= 207).slice(0, 31);
  if (headerRows.length < 28) throw new Error('File mẫu Đo không có đủ vùng nhập theo ngày');
  const grouped = groupByDay(reports, yearMonth);
  const inputColumns = [2, 4, 5, 7, 8, ...Array.from({ length: 16 }, (_, index) => 12 + index), 28, 30, ...Array.from({ length: 15 }, (_, index) => 37 + index)];

  headerRows.forEach((headerRow, dayIndex) => {
    const day = dayIndex + 1;
    const nextHeader = headerRows[dayIndex + 1];
    const dataStart = headerRow + 1;
    const dataEnd = nextHeader ? nextHeader - 2 : Math.min(sheet.rowCount, dataStart + 159);
    const rowNumbers = Array.from({ length: Math.max(0, dataEnd - dataStart + 1) }, (_, index) => dataStart + index);
    clearInputColumns(sheet, rowNumbers, inputColumns);

    const dateRow = sheet.getRow(headerRow - 1);
    const validDay = day <= getDaysInMonth(yearMonth);
    dateRow.getCell(1).value = validDay
      ? toExcelDate(`${yearMonth}-${String(day).padStart(2, '0')}`)
      : null;
    dateRow.getCell(1).numFmt = 'dd/mm/yyyy';

    const dayReports = validDay ? (grouped.get(day) || []) : [];
    dayReports.slice(0, rowNumbers.length).forEach((report, index) => {
      const row = sheet.getRow(rowNumbers[index]);
      const trainingFactor = toNumber(report.training_percent) > 1
        ? toNumber(report.training_percent) / 100
        : (toNumber(report.training_percent) || 1);
      const actualTime = toNumber(report.actual_time);
      const standardRate = toNumber(report.standard_output);
      const plannedOutput = actualTime * trainingFactor * standardRate;
      const actualOutput = toNumber(report.actual_output);
      const totalNg = toNumber(report.tt_ng);

      setInputCell(row, 2, report.worker_code);
      setInputCell(row, 4, shiftToCompanyValue(report.shift));
      setInputCell(row, 5, report.machine_no);
      setInputCell(row, 7, trainingFactor);
      setInputCell(row, 8, toNumber(report.total_time));

      const deductions = report.deductions || [];
      setInputCell(row, 11, sumByAliases(deductions, DEDUCTION_ALIASES.THIEU_SP, 'hours'));
      setInputCell(row, 12, sumByAliases(deductions, DEDUCTION_ALIASES.CHINH_MAY, 'hours'));
      setInputCell(row, 13, sumByAliases(deductions, DEDUCTION_ALIASES.MAT_DIEN, 'hours'));
      setInputCell(row, 14, sumByAliases(deductions, DEDUCTION_ALIASES.KHONG_KH, 'hours'));
      setInputCell(row, 15, sumByAliases(deductions, DEDUCTION_ALIASES.CHO_CHINH_MAY, 'hours'));
      setInputCell(row, 16, sumByAliases(deductions, DEDUCTION_ALIASES.NGHI_GIAI_LAO, 'hours'));
      setInputCell(row, 17, sumByAliases(deductions, DEDUCTION_ALIASES.GIAO_CA, 'hours'));
      setInputCell(row, 18, sumByAliases(deductions, DEDUCTION_ALIASES.HO_TRO, 'hours'));
      setInputCell(row, 19, sumByAliases(deductions, DEDUCTION_ALIASES.FIVE_S, 'hours'));
      setInputCell(row, 20, sumByAliases(deductions, DEDUCTION_ALIASES.RAI_HANG, 'hours'));
      setInputCell(row, 21, sumByAliases(deductions, DEDUCTION_ALIASES.LUU_DL, 'hours'));
      setInputCell(row, 22, sumByAliases(deductions, DEDUCTION_ALIASES.KS_DF, 'hours'));
      setInputCell(row, 23, sumByAliases(deductions, DEDUCTION_ALIASES.THOI_BUI, 'hours'));
      setInputCell(row, 24, sumByAliases(deductions, DEDUCTION_ALIASES.KHAC, 'hours'));
      setInputCell(row, 25, sumByAliases(deductions, DEDUCTION_ALIASES.DI_MUON, 'hours'));
      setInputCell(row, 26, sumByAliases(deductions, DEDUCTION_ALIASES.KIEM_KHO, 'hours'));
      setInputCell(row, 27, sumByAliases(deductions, DEDUCTION_ALIASES.HOC_VIEC, 'hours'));

      setInputCell(row, 28, report.product_name);
      setInputCell(row, 30, actualOutput);

      const defects = report.defects || [];
      setInputCell(row, 37, sumByAliases(defects, DEFECT_ALIASES.LON, 'quantity'));
      setInputCell(row, 38, sumByAliases(defects, DEFECT_ALIASES.NHO, 'quantity'));
      setInputCell(row, 39, sumByAliases(defects, DEFECT_ALIASES.FURE_CAO_SU, 'quantity'));
      setInputCell(row, 40, sumByAliases(defects, DEFECT_ALIASES.FURE_TRUC, 'quantity'));
      setInputCell(row, 41, sumByAliases(defects, DEFECT_ALIASES.LAN_HANG, 'quantity'));
      setInputCell(row, 42, sumByAliases(defects, DEFECT_ALIASES.TRUC_CONG, 'quantity'));
      setInputCell(row, 43, sumByAliases(defects, DEFECT_ALIASES.LECH_DIEM, 'quantity'));
      setInputCell(row, 44, sumByAliases(defects, DEFECT_ALIASES.LOI_CAO_SU, 'quantity'));
      setInputCell(row, 45, sumByAliases(defects, DEFECT_ALIASES.KQD, 'quantity'));
      setInputCell(row, 46, sumByAliases(defects, DEFECT_ALIASES.LOI_TRUC, 'quantity'));
      setInputCell(row, 47, sumByAliases(defects, DEFECT_ALIASES.CHUA_MAI, 'quantity'));
      setInputCell(row, 48, sumByAliases(defects, DEFECT_ALIASES.MAI_2_LAN, 'quantity'));
      setInputCell(row, 49, sumByAliases(defects, DEFECT_ALIASES.HO_VAI, 'quantity'));
    });
  });
};


const sanitizeWorkbookForWrite = (workbook) => {
  workbook.eachSheet((sheet) => {
    sheet.eachRow({ includeEmpty: true }, (row) => {
      row.eachCell({ includeEmpty: true }, (cell) => {
        const value = cell.value;
        if (!value || typeof value !== 'object') return;

        if ((Object.prototype.hasOwnProperty.call(value, 'formula')
          || Object.prototype.hasOwnProperty.call(value, 'sharedFormula'))
          && value.result == null) {
          cell.value = { ...value, result: '' };
          return;
        }

        if (Array.isArray(value.richText)) {
          cell.value = {
            ...value,
            richText: value.richText.map((part) => ({
              ...part,
              text: part?.text == null ? '' : String(part.text)
            }))
          };
        }
      });
    });
  });
};

const resolveMaiDoProcesses = async () => {
  const rows = await query(
    `SELECT id, process_code, process_name
       FROM processes
      WHERE UPPER(process_code) IN ('MAI', 'DO')
      ORDER BY CASE UPPER(process_code) WHEN 'MAI' THEN 1 ELSE 2 END, id`
  );
  return rows.filter((row) => PROCESS_CODES.has(String(row.process_code || '').toUpperCase()));
};

async function buildMaiDoCompanyWorkbook(value) {
  const yearMonth = normalizeYearMonth(value);
  const processes = await resolveMaiDoProcesses();
  if (!processes.length) {
    const error = new Error('Không tìm thấy công đoạn Mài hoặc Đo');
    error.statusCode = 404;
    throw error;
  }

  await assertReportVolume({ yearMonth, processIds: processes.map((item) => Number(item.id)) });

  const loaded = await Promise.all(processes.map(async (process) => ({
    process,
    reports: await loadProcessMonthReports(yearMonth, process.id)
  })));
  const maiReports = loaded.find((item) => String(item.process.process_code).toUpperCase() === 'MAI')?.reports || [];
  const doReports = loaded.find((item) => String(item.process.process_code).toUpperCase() === 'DO')?.reports || [];
  if (!maiReports.length && !doReports.length) {
    const error = new Error('Công đoạn Mài - Đo không có báo cáo đã duyệt trong tháng');
    error.statusCode = 404;
    throw error;
  }

  await fs.access(TEMPLATE_PATH);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(TEMPLATE_PATH);
  const maiSheet = workbook.getWorksheet('TT Mài');
  const doSheet = workbook.getWorksheet('TT Đo');
  if (!maiSheet || !doSheet) throw new Error('File mẫu Mài - Đo thiếu sheet TT Mài hoặc TT Đo');

  fillMaiSheet(maiSheet, maiReports, yearMonth);
  fillDoSheet(doSheet, doReports, yearMonth);

  workbook.calcProperties.fullCalcOnLoad = true;
  workbook.calcProperties.forceFullCalc = true;
  workbook.calcProperties.calcMode = 'auto';

  const [year, month] = yearMonth.split('-');
  const root = process.env.EXCEL_PROCESS_TEMP_ROOT || path.join(process.cwd(), 'exports-process');
  const folder = path.join(root, year, safeName('Mài - Đo', 'Mai - Do'), month);
  await fs.mkdir(folder, { recursive: true });
  const fileName = `A+B MÀI - ĐO THÁNG ${month}-${year}.xlsx`;
  const filePath = path.join(folder, fileName);
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  sanitizeWorkbookForWrite(workbook);
  try {
    try {
      await workbook.xlsx.writeFile(temporaryPath);
    } catch (error) {
      const wrapped = new Error(`Không thể ghi file Mài - Đo: ${error?.message || error}`);
      wrapped.cause = error;
      throw wrapped;
    }
    await fs.rm(filePath, { force: true });
    await fs.rename(temporaryPath, filePath);
  } finally {
    await removeQuietly(temporaryPath);
  }
  const stat = await fs.stat(filePath);
  cleanupOldExports(path.dirname(filePath)).catch(() => undefined);

  return {
    path: filePath,
    fileName,
    processName: 'Mài - Đo',
    processCode: 'MAI_DO',
    reportCount: maiReports.length + doReports.length,
    fileSize: stat.size,
    yearMonth
  };
}

/**
 * Tạo cả hai workbook công ty trong một lần gọi.
 * Chạy tuần tự thay vì Promise.all để tránh hai workbook ExcelJS lớn
 * cùng chiếm bộ nhớ trên Render/desktop cấu hình thấp.
 *
 * - GIA_CONG: dùng service chung và template bao-cao-cat-long-export.xlsx
 * - MAI_DO: dùng logic chuyên biệt trong file này
 *
 * Hàm trả về kết quả từng file. Nếu một file lỗi, file còn lại vẫn được xử lý;
 * sau đó ném lỗi tổng hợp có thuộc tính partialResults để controller ghi log rõ ràng.
 */
async function buildBothCompanyWorkbooks(value) {
  const yearMonth = normalizeYearMonth(value);
  const files = [];
  const errors = [];

  const tasks = [
    {
      code: 'GIA_CONG',
      title: 'Gia công',
      run: () => buildCompanyWorkbook(yearMonth, 'GIA_CONG')
    },
    {
      code: 'MAI_DO',
      title: 'Mài - Đo',
      run: () => buildMaiDoCompanyWorkbook(yearMonth)
    }
  ];

  for (const task of tasks) {
    try {
      const result = await task.run();
      files.push({
        code: task.code,
        title: task.title,
        success: true,
        ...result
      });
    } catch (error) {
      errors.push({
        code: task.code,
        title: task.title,
        success: false,
        message: error?.message || String(error)
      });
    }
  }

  if (errors.length) {
    const error = new Error(
      `Không thể tạo đầy đủ file công ty: ${errors.map((item) => `${item.title}: ${item.message}`).join('; ')}`
    );
    error.statusCode = 500;
    error.partialResults = files;
    error.fileErrors = errors;
    throw error;
  }

  return {
    yearMonth,
    success: true,
    files
  };
}

module.exports = {
  buildMaiDoCompanyWorkbook,
  buildBothCompanyWorkbooks,
  resolveMaiDoProcesses
};
