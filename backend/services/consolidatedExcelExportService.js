const { calculateCountedNg } = require('../utils/outputCalculation');
const ExcelJS = require('exceljs');
const fs = require('node:fs/promises');
const path = require('node:path');

const TEMPLATE_PATH = path.join(__dirname, '../templates/bao-cao-cat-long-export.xlsx');
const SHEET_NAME = 'Cắt lồng';
const HEADER_ROW = 326;
const DATA_START_ROW = 327;
const TEMPLATE_TABLE_LAST_COLUMN = 53; // BA


const EXCEL_THEME = Object.freeze({
  navy: '1F4E78',
  navyDark: '17365D',
  blue: '5B9BD5',
  green: '70AD47',
  red: 'C00000',
  amber: 'C55A11',
  white: 'FFFFFF',
  text: '1F2937',
  mutedText: '5B6573',
  border: 'C9D2DC',
  softBlue: 'EAF3F8',
  softGreen: 'E2F0D9',
  softRed: 'FCE4D6',
  softGray: 'F5F7FA',
  softAmber: 'FFF2CC'
});

const solidFill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const thinBorder = {
  top: { style: 'thin', color: { argb: EXCEL_THEME.border } },
  left: { style: 'thin', color: { argb: EXCEL_THEME.border } },
  bottom: { style: 'thin', color: { argb: EXCEL_THEME.border } },
  right: { style: 'thin', color: { argb: EXCEL_THEME.border } }
};
const mediumLeftBorder = {
  ...thinBorder,
  left: { style: 'medium', color: { argb: EXCEL_THEME.navyDark } }
};

const getColumnGroup = (column) => {
  if (['sequence', 'worker_code', 'full_name', 'machine_no', 'shift'].includes(column.key)) return 'identity';
  if (['training_percent', 'total_time', 'actual_time', 'deduction_time'].includes(column.key) || column.kind === 'deduction') return 'time';
  if (['product_name', 'standard_output', 'actual_output', 'achievement_rate', 'work_date', 'output_per_hour', 'tt_ok'].includes(column.key)) return 'production';
  if (['tt_ng', 'ng_rate'].includes(column.key) || column.kind === 'defect') return 'quality';
  return 'identity';
};

const isGroupStart = (column) => [
  'training_percent',
  'product_name',
  'tt_ng'
].includes(column.key);

const styleHeaderCell = (cell, column) => {
  let fill = EXCEL_THEME.navy;
  if (column.kind === 'deduction') fill = '7F8C98';
  if (column.kind === 'defect') fill = 'A61B1B';
  if (column.key === 'actual_output') fill = EXCEL_THEME.blue;
  if (column.key === 'tt_ok') fill = EXCEL_THEME.green;
  if (column.key === 'tt_ng' || column.key === 'ng_rate') fill = EXCEL_THEME.red;

  cell.fill = solidFill(fill);
  cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: EXCEL_THEME.white } };
  cell.border = isGroupStart(column) ? mediumLeftBorder : thinBorder;
  cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
};

const styleDataCell = (cell, column) => {
  let fill = EXCEL_THEME.white;
  if (column.kind === 'deduction') fill = EXCEL_THEME.softGray;
  if (column.kind === 'defect') fill = 'FFF9F7';
  if (column.key === 'actual_output') fill = EXCEL_THEME.softBlue;
  if (column.key === 'achievement_rate') fill = 'F2F7FB';
  if (column.key === 'tt_ok') fill = EXCEL_THEME.softGreen;
  if (column.key === 'tt_ng' || column.key === 'ng_rate') fill = EXCEL_THEME.softRed;

  cell.fill = solidFill(fill);
  cell.font = { name: 'Arial', size: 10, color: { argb: EXCEL_THEME.text } };
  cell.border = isGroupStart(column) ? mediumLeftBorder : thinBorder;
  cell.alignment = {
    horizontal: ['full_name', 'product_name'].includes(column.key) ? 'left' : 'center',
    vertical: 'middle',
    wrapText: true
  };
};

const applyValueHighlight = (cell, column, value) => {
  const numericValue = toNumber(value);

  // Chỉ nhấn mạnh các chỉ số tổng hợp quan trọng, không tô từng ô rời rạc như bàn cờ.
  if (column.key === 'achievement_rate') {
    cell.fill = solidFill(
      numericValue >= 1 ? EXCEL_THEME.softGreen
        : numericValue >= 0.9 ? EXCEL_THEME.softAmber
          : EXCEL_THEME.softRed
    );
    cell.font = { ...(cell.font || {}), bold: true };
  }

  if (column.key === 'ng_rate') {
    cell.fill = solidFill(
      numericValue <= 0.01 ? EXCEL_THEME.softGreen
        : numericValue <= 0.03 ? EXCEL_THEME.softAmber
          : EXCEL_THEME.softRed
    );
    cell.font = { ...(cell.font || {}), bold: true };
  }

  // Chi tiết chỉ đổi màu chữ khi có phát sinh để giữ nền bảng đồng nhất.
  if (column.kind === 'deduction' && numericValue > 0) {
    cell.font = { ...(cell.font || {}), bold: true, color: { argb: EXCEL_THEME.amber } };
  }
  if (column.kind === 'defect' && numericValue > 0) {
    cell.font = { ...(cell.font || {}), bold: true, color: { argb: EXCEL_THEME.red } };
  }

  if (['actual_output', 'tt_ok', 'tt_ng', 'standard_output', 'output_per_hour'].includes(column.key)) {
    cell.font = { ...(cell.font || {}), bold: true };
  }
};

const toNumber = (value) => {
  const parsed = Number(String(value ?? 0).replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
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

const toExcelDate = (value) => {
  const key = normalizeDateKey(value);
  if (!key) return null;
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const sortReports = (a, b) => {
  const byDate = normalizeDateKey(a.work_date).localeCompare(normalizeDateKey(b.work_date));
  if (byDate) return byDate;
  const byWorker = String(a.worker_code || '').localeCompare(
    String(b.worker_code || ''),
    undefined,
    { numeric: true, sensitivity: 'base' }
  );
  return byWorker || Number(a.id) - Number(b.id);
};

const clone = (value) => (value == null ? value : JSON.parse(JSON.stringify(value)));

const normalizeType = (item, kind) => {
  const id = Number(item.id ?? item.type_id ?? item[`${kind}_type_id`]);
  const code = String(
    item.code ?? item.type_code ?? item[`${kind}_code`] ?? ''
  ).trim();
  const rawName = item.name ?? item.type_name ?? item[`${kind}_name`];
  const fallbackName = kind === 'deduction'
    ? `Loại trừ giờ #${id || '?'}`
    : `Lỗi NG #${id || '?'}`;

  return {
    id,
    code,
    name: String(rawName || code || fallbackName).trim(),
    sort_order: Number(item.sort_order) || 0,
    process_id: Number(item.process_id) || 0
  };
};

const uniqueTypes = (items, kind) => {
  const map = new Map();
  (items || []).forEach((raw) => {
    const item = normalizeType(raw, kind);
    if (item.id && !map.has(item.id)) map.set(item.id, item);
  });
  return [...map.values()].sort(
    (a, b) => a.process_id - b.process_id || a.sort_order - b.sort_order || a.id - b.id
  );
};

const collectTypesFromReports = (reports, kind) => uniqueTypes(
  reports.flatMap((report) => report[kind === 'deduction' ? 'deductions' : 'defects'] || []),
  kind
);

const mergeTypes = (configuredTypes, reports, kind) => uniqueTypes([
  ...(configuredTypes || []),
  ...collectTypesFromReports(reports, kind)
], kind);

const sumDetailValues = (items, valueKey, allowedTypeIds = null, typeKey = null) => (items || [])
  .filter((item) => !allowedTypeIds || allowedTypeIds.has(Number(item[typeKey])))
  .reduce((sum, item) => sum + toNumber(item[valueKey]), 0);

const detailValue = (items, typeId, valueKey, typeKey) => (items || [])
  .filter((item) => Number(item[typeKey]) === Number(typeId))
  .reduce((sum, item) => sum + toNumber(item[valueKey]), 0);

const safeFolderName = (value, fallback) => String(value || fallback)
  .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
  .replace(/\s+/g, ' ')
  .trim() || fallback;

const getMonthlyTarget = (yearMonth) => {
  const [year, month] = yearMonth.split('-');
  const root = process.env.EXCEL_EXPORT_ROOT || path.join(process.cwd(), 'exports');
  const stageName = safeFolderName(process.env.EXCEL_STAGE_FOLDER_NAME || 'Cắt lồng', 'Cắt lồng');
  const folder = path.join(root, year, stageName);
  const fileName = `Bao-cao-san-xuat-${month}-${year}.xlsx`;
  const filePath = path.join(folder, fileName);
  return { folder, fileName, filePath, metadataPath: `${filePath}.meta.json` };
};

const readMonthlyCacheMetadata = async (yearMonth) => {
  const target = getMonthlyTarget(yearMonth);
  try {
    const [fileStat, metadataText] = await Promise.all([
      fs.stat(target.filePath),
      fs.readFile(target.metadataPath, 'utf8')
    ]);
    return { target, fileStat, metadata: JSON.parse(metadataText) };
  } catch (error) {
    if (error?.code === 'ENOENT' || error instanceof SyntaxError) return null;
    throw error;
  }
};

const writeMonthlyCacheMetadata = async (target, metadata) => {
  const temporaryPath = `${target.metadataPath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporaryPath, JSON.stringify(metadata), 'utf8');
  await fs.rename(temporaryPath, target.metadataPath);
};

const captureCellStyle = (sheet, rowNumber, columnNumber) => {
  const cell = sheet.getRow(rowNumber).getCell(columnNumber);
  const column = sheet.getColumn(columnNumber);
  return {
    style: clone(cell.style),
    font: clone(cell.font),
    fill: clone(cell.fill),
    border: clone(cell.border),
    alignment: clone(cell.alignment),
    protection: clone(cell.protection),
    numFmt: cell.numFmt,
    width: column.width,
    hidden: column.hidden,
    outlineLevel: column.outlineLevel
  };
};

const applyCellStyle = (sheet, rowNumber, columnNumber, source) => {
  const cell = sheet.getRow(rowNumber).getCell(columnNumber);
  if (source.style) cell.style = clone(source.style);
  if (source.font) cell.font = clone(source.font);
  if (source.fill) cell.fill = clone(source.fill);
  if (source.border) cell.border = clone(source.border);
  if (source.alignment) cell.alignment = clone(source.alignment);
  if (source.protection) cell.protection = clone(source.protection);
  if (source.numFmt) cell.numFmt = source.numFmt;

  const column = sheet.getColumn(columnNumber);
  if (source.width != null) column.width = source.width;
  column.hidden = false;
  if (source.outlineLevel != null) column.outlineLevel = source.outlineLevel;
};

/*
 * Vị trí style trong file mẫu cố định (hàng 326/327).
 * Không tự tạo màu. Mỗi cột động chỉ sao chép style từ đúng nhóm tương ứng trong template.
 *
 * A STT, B mã NV, C tên, D máy, E ca, F % học việc,
 * G TG làm việc, H TG thực tế, J tổng trừ, K:Y chi tiết trừ,
 * AA SP, AB định mức, AC TT, AD SP/H, AE ngày, AF tỷ lệ đạt,
 * AG OK, AH tổng NG, AI tỷ lệ NG, AJ:AY chi tiết NG, AZ trạng thái, BA ghi chú.
 */
const TEMPLATE_SOURCE = Object.freeze({
  stt: 1,
  workerCode: 2,
  workerName: 3,
  machine: 4,
  shift: 5,
  trainingPercent: 6,
  totalTime: 7,
  actualTime: 8,
  totalDeduction: 10,
  deductionDetail: 11,
  product: 27,
  standard: 28,
  totalOutput: 29,
  outputPerHour: 30,
  workDate: 31,
  achievementRate: 32,
  ok: 33,
  totalNg: 34,
  ngRate: 35,
  defectDetail: 36,
  status: 52,
  note: 53,
  reportId: 53
});

const buildColumns = (deductionTypes, defectTypes) => [
  { key: 'sequence', title: 'STT', source: TEMPLATE_SOURCE.stt },
  { key: 'worker_code', title: 'Mã nhân viên', source: TEMPLATE_SOURCE.workerCode },
  { key: 'full_name', title: 'Tên', source: TEMPLATE_SOURCE.workerName },
  { key: 'machine_no', title: 'Số máy', source: TEMPLATE_SOURCE.machine },
  { key: 'shift', title: 'ca', source: TEMPLATE_SOURCE.shift },
  { key: 'training_percent', title: '%\nhọc việc', source: TEMPLATE_SOURCE.trainingPercent },
  { key: 'total_time', title: 'Thời gian\nLàm việc', source: TEMPLATE_SOURCE.totalTime },
  { key: 'actual_time', title: 'Thời gian làm thực tế', source: TEMPLATE_SOURCE.actualTime },
  { key: 'deduction_time', title: 'Tổng TG trừ giờ', source: TEMPLATE_SOURCE.totalDeduction },
  ...deductionTypes.map((type) => ({
    key: `deduction_${type.id}`,
    title: type.name || type.code || `Loại trừ giờ #${type.id}`,
    source: TEMPLATE_SOURCE.deductionDetail,
    kind: 'deduction',
    type
  })),
  { key: 'product_name', title: 'SP', source: TEMPLATE_SOURCE.product },
  { key: 'standard_output', title: 'Định mức', source: TEMPLATE_SOURCE.standard },
  { key: 'actual_output', title: 'TT', source: TEMPLATE_SOURCE.totalOutput },
  { key: 'achievement_rate', title: 'Tỷ lệ đạt', source: TEMPLATE_SOURCE.achievementRate },
  { key: 'work_date', title: 'Ngày/ Tháng', source: TEMPLATE_SOURCE.workDate },
  { key: 'output_per_hour', title: 'Số SP/H', source: TEMPLATE_SOURCE.outputPerHour },
  { key: 'tt_ok', title: 'OK', source: TEMPLATE_SOURCE.ok },
  { key: 'tt_ng', title: 'tổng NG', source: TEMPLATE_SOURCE.totalNg },
  { key: 'ng_rate', title: 'Tỷ lệ NG', source: TEMPLATE_SOURCE.ngRate },
  ...defectTypes.map((type) => ({
    key: `defect_${type.id}`,
    title: type.name,
    source: TEMPLATE_SOURCE.defectDetail,
    kind: 'defect',
    type
  })),
];

const buildReportValue = (column, report, sequence) => {
  const ok = toNumber(report.tt_ok);
  // Tổng NG lấy từ toàn bộ chi tiết lỗi đã lưu trong DB của báo cáo.
  const activeDefectIds = new Set((report.__activeDefectTypes || []).map((item) => Number(item.id)));
  const ng = sumDetailValues(report.defects, 'quantity', activeDefectIds, 'defect_type_id');
  const totalOutput = Number(report.actual_output ?? (ok + calculateCountedNg(report.defects, Boolean(Number(report.exclude_kqd_from_tt || 0)))));
  const standard = Math.round(toNumber(report.standard_output));
  const actualTime = toNumber(report.actual_time);

  if (column.kind === 'deduction') {
    return detailValue(report.deductions, column.type.id, 'hours', 'deduction_type_id');
  }
  if (column.kind === 'defect') {
    return detailValue(report.defects, column.type.id, 'quantity', 'defect_type_id');
  }

  switch (column.key) {
    case 'sequence': return sequence;
    case 'worker_code': return report.worker_code || '';
    case 'full_name': return report.full_name || '';
    case 'machine_no': return report.machine_no || '';
    case 'shift': return report.shift || '';
    case 'training_percent': return toNumber(report.training_percent || 100) / 100;
    case 'total_time': return toNumber(report.total_time);
    case 'actual_time': return actualTime;
    case 'deduction_time': return toNumber(report.deduction_time);
    case 'product_name': return report.product_name || '';
    case 'standard_output': return standard;
    case 'actual_output': return totalOutput;
    case 'achievement_rate': return standard > 0 ? totalOutput / standard : 0;
    case 'work_date': return toExcelDate(report.work_date);
    case 'output_per_hour': return actualTime > 0 ? totalOutput / actualTime : 0;
    case 'tt_ok': return ok;
    case 'tt_ng': return ng;
    case 'ng_rate': return totalOutput > 0 ? ng / totalOutput : 0;
    default: return '';
  }
};

const clearTemplateDataRows = (sheet) => {
  if (sheet.rowCount < DATA_START_ROW) return;
  for (let rowNumber = DATA_START_ROW; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    for (let columnNumber = 1; columnNumber <= TEMPLATE_TABLE_LAST_COLUMN; columnNumber += 1) {
      row.getCell(columnNumber).value = null;
    }
  }
};

const buildMonthlyTemplateWorkbook = async (reports, yearMonth, options = {}) => {
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) throw new Error('Tháng xuất Excel không hợp lệ');
  await fs.access(TEMPLATE_PATH);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(TEMPLATE_PATH);
  const sheet = workbook.getWorksheet(SHEET_NAME);
  if (!sheet) throw new Error(`Không tìm thấy sheet ${SHEET_NAME} trong file mẫu`);

  const sortedReports = [...reports].sort(sortReports);
  const requestedDeductions = uniqueTypes(options.deductionTypes, 'deduction');
  const requestedDefects = uniqueTypes(options.defectTypes, 'defect');
  const deductionTypes = mergeTypes(requestedDeductions, sortedReports, 'deduction');
  const defectTypes = requestedDefects;
  const columns = buildColumns(deductionTypes, defectTypes);
  sortedReports.forEach((report) => { report.__activeDefectTypes = defectTypes; });

  // Chụp style trước khi ghi đè để luôn lấy đúng style gốc của file mẫu.
  const sourceColumnNumbers = [...new Set(columns.map((column) => column.source))];
  const headerStyles = new Map();
  const dataStyles = new Map();
  sourceColumnNumbers.forEach((sourceColumn) => {
    headerStyles.set(sourceColumn, captureCellStyle(sheet, HEADER_ROW, sourceColumn));
    dataStyles.set(sourceColumn, captureCellStyle(sheet, DATA_START_ROW, sourceColumn));
  });

  const headerRow = sheet.getRow(HEADER_ROW);
  const headerHeight = headerRow.height;
  const dataHeight = sheet.getRow(DATA_START_ROW).height;

  clearTemplateDataRows(sheet);

  // Chỉ dựng lại bảng dữ liệu từ hàng 326. Toàn bộ phần biểu mẫu, logo, màu và bố cục phía trên giữ nguyên.
  for (let columnNumber = 1; columnNumber <= Math.max(columns.length, TEMPLATE_TABLE_LAST_COLUMN); columnNumber += 1) {
    if (columnNumber <= TEMPLATE_TABLE_LAST_COLUMN) headerRow.getCell(columnNumber).value = null;
    sheet.getColumn(columnNumber).hidden = columnNumber > columns.length && columnNumber <= TEMPLATE_TABLE_LAST_COLUMN;
  }

  columns.forEach((column, index) => {
    const destinationColumn = index + 1;
    applyCellStyle(sheet, HEADER_ROW, destinationColumn, headerStyles.get(column.source));
    const cell = headerRow.getCell(destinationColumn);
    cell.value = column.title;
    styleHeaderCell(cell, column);
  });
  headerRow.height = headerHeight;

  let currentDate = '';
  let sequence = 0;
  let rowNumber = DATA_START_ROW;

  sortedReports.forEach((report) => {
    const dateKey = normalizeDateKey(report.work_date);

    // Mỗi ngày có một dòng phân cách riêng. Chỉ cột A ghi ngày, các cột còn lại để trống.
    if (dateKey !== currentDate) {
      const dateRow = sheet.getRow(rowNumber);
      dateRow.height = dataHeight;

      columns.forEach((column, index) => {
        const destinationColumn = index + 1;
        applyCellStyle(sheet, rowNumber, destinationColumn, dataStyles.get(column.source));
        dateRow.getCell(destinationColumn).value = null;
      });

      columns.forEach((column, index) => {
        const cell = dateRow.getCell(index + 1);
        cell.fill = solidFill(EXCEL_THEME.navy);
        cell.border = thinBorder;
        cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: EXCEL_THEME.white } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      });

      const dateCell = dateRow.getCell(1);
      dateCell.value = toExcelDate(report.work_date);
      dateCell.numFmt = 'dd/mm/yyyy';
      dateRow.height = Math.max(Number(dataHeight) || 18, 22);

      for (
        let columnNumber = columns.length + 1;
        columnNumber <= TEMPLATE_TABLE_LAST_COLUMN;
        columnNumber += 1
      ) {
        dateRow.getCell(columnNumber).value = null;
      }

      rowNumber += 1;
      currentDate = dateKey;
      sequence = 0;
    }

    sequence += 1;

    const row = sheet.getRow(rowNumber);
    row.height = dataHeight;

    columns.forEach((column, index) => {
      const destinationColumn = index + 1;
      applyCellStyle(sheet, rowNumber, destinationColumn, dataStyles.get(column.source));
      const cell = row.getCell(destinationColumn);
      const value = buildReportValue(column, report, sequence);
      cell.value = value;
      styleDataCell(cell, column, rowNumber);
      applyValueHighlight(cell, column, value);
    });

    for (
      let columnNumber = columns.length + 1;
      columnNumber <= TEMPLATE_TABLE_LAST_COLUMN;
      columnNumber += 1
    ) {
      row.getCell(columnNumber).value = null;
    }
    rowNumber += 1;
  });

  // Chuẩn hóa định dạng số, độ rộng và khả năng đọc của bảng.
  columns.forEach((column, index) => {
    const excelColumn = sheet.getColumn(index + 1);
    if (column.key === 'training_percent' || column.key === 'achievement_rate' || column.key === 'ng_rate') {
      excelColumn.numFmt = '0.0%';
    } else if (column.key === 'work_date') {
      excelColumn.numFmt = 'dd/mm/yyyy';
    } else if (['total_time', 'actual_time', 'deduction_time'].includes(column.key) || column.kind === 'deduction') {
      excelColumn.numFmt = '0.00';
    } else if (column.key === 'output_per_hour') {
      excelColumn.numFmt = '#,##0.00';
    } else if (['standard_output', 'actual_output', 'tt_ok', 'tt_ng'].includes(column.key) || column.kind === 'defect') {
      excelColumn.numFmt = '#,##0';
    }

    if (column.key === 'full_name') excelColumn.width = Math.max(excelColumn.width || 0, 22);
    else if (column.key === 'product_name') excelColumn.width = Math.max(excelColumn.width || 0, 16);
    else if (column.kind === 'deduction' || column.kind === 'defect') excelColumn.width = Math.max(excelColumn.width || 0, 11);
    else excelColumn.width = Math.max(excelColumn.width || 0, 10);
  });

  headerRow.height = Math.max(Number(headerRow.height) || 24, 36);
  sheet.autoFilter = {
    from: { row: HEADER_ROW, column: 1 },
    to: { row: HEADER_ROW, column: columns.length }
  };

  // Giữ cấu hình in, màu, freeze pane và bố cục từ template; chỉ cập nhật vùng in theo bảng động.
  const lastColumnLetter = sheet.getColumn(columns.length).letter;
  sheet.pageSetup = {
    ...(sheet.pageSetup || {}),
    printArea: `A1:${lastColumnLetter}${Math.max(HEADER_ROW, rowNumber - 1)}`
  };

  const target = getMonthlyTarget(yearMonth);
  await fs.mkdir(target.folder, { recursive: true });
  const temporaryPath = `${target.filePath}.${process.pid}.${Date.now()}.tmp`;
  await workbook.xlsx.writeFile(temporaryPath);
  await fs.rename(temporaryPath, target.filePath);
  await writeMonthlyCacheMetadata(target, {
    yearMonth,
    reportCount: sortedReports.length,
    deductionColumnCount: deductionTypes.length,
    defectColumnCount: defectTypes.length,
    latestUpdatedAt: options.latestUpdatedAt || null,
    generatedAt: new Date().toISOString(),
    templateStyle: true,
    templateLayoutVersion: 2
  });

  return {
    workbook,
    archivePath: target.filePath,
    fileName: target.fileName,
    reportCount: sortedReports.length
  };
};

module.exports = {
  buildMonthlyTemplateWorkbook,
  getMonthlyTarget,
  readMonthlyCacheMetadata
};
