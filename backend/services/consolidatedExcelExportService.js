const ExcelJS = require('exceljs');
const fs = require('node:fs/promises');
const path = require('node:path');

const TEMPLATE_PATH = path.join(__dirname, '../templates/bao-cao-cat-long-export.xlsx');
const SHEET_NAME = 'Cắt lồng';
const HEADER_ROW = 326;
const DATA_START_ROW = 327;
const TEMPLATE_COLUMN_COUNT = 53;

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
  const byWorker = String(a.worker_code || '').localeCompare(String(b.worker_code || ''), undefined, { numeric: true, sensitivity: 'base' });
  return byWorker || Number(a.id) - Number(b.id);
};

const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));

const normalizeType = (item, kind) => ({
  id: Number(item.id ?? item[`${kind}_type_id`]),
  code: String(item[`${kind}_code`] || ''),
  name: String(item[`${kind}_name`] || item[`${kind}_code`] || ''),
  sort_order: Number(item.sort_order) || 0,
  process_id: Number(item.process_id) || 0
});

const uniqueTypes = (items, kind) => {
  const map = new Map();
  (items || []).forEach((raw) => {
    const item = normalizeType(raw, kind);
    if (item.id && !map.has(item.id)) map.set(item.id, item);
  });
  return [...map.values()].sort((a, b) => a.process_id - b.process_id || a.sort_order - b.sort_order || a.id - b.id);
};

const collectTypesFromReports = (reports, kind) => uniqueTypes(
  reports.flatMap((report) => report[kind === 'deduction' ? 'deductions' : 'defects'] || []), kind
);

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
    const [fileStat, metadataText] = await Promise.all([fs.stat(target.filePath), fs.readFile(target.metadataPath, 'utf8')]);
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

const captureCell = (sheet, rowNumber, columnNumber) => {
  const cell = sheet.getRow(rowNumber).getCell(columnNumber);
  return {
    style: clone(cell.style), font: clone(cell.font), fill: clone(cell.fill),
    border: clone(cell.border), alignment: clone(cell.alignment), protection: clone(cell.protection),
    numFmt: cell.numFmt, width: sheet.getColumn(columnNumber).width
  };
};

const applyCell = (sheet, rowNumber, columnNumber, source) => {
  const cell = sheet.getRow(rowNumber).getCell(columnNumber);
  if (source.style) cell.style = clone(source.style);
  if (source.font) cell.font = clone(source.font);
  if (source.fill) cell.fill = clone(source.fill);
  if (source.border) cell.border = clone(source.border);
  if (source.alignment) cell.alignment = clone(source.alignment);
  if (source.protection) cell.protection = clone(source.protection);
  if (source.numFmt) cell.numFmt = source.numFmt;
  if (source.width) sheet.getColumn(columnNumber).width = source.width;
};

// Mapping tới cột trong file mẫu cũ để giữ nguyên màu sắc/kiểu trình bày theo từng nhóm.
const SOURCE = {
  stt: 1, workerCode: 2, name: 3, machine: 4, shift: 5, training: 6,
  totalTime: 7, actualTime: 8, totalDeduction: 10, deduction: 11,
  product: 27, standard: 28, total: 29, rate: 30, date: 31, perHour: 32,
  ok: 33, ng: 34, ngRate: 35, defect: 37, status: 52, note: 53, reportId: 53
};

const buildColumns = (deductionTypes, defectTypes) => [
  ['STT', SOURCE.stt], ['Mã nhân viên', SOURCE.workerCode], ['Tên', SOURCE.name],
  ['Số máy', SOURCE.machine], ['Ca', SOURCE.shift], ['%\nhọc việc', SOURCE.training],
  ['Thời gian\nLàm việc', SOURCE.totalTime], ['Thời gian làm thực tế', SOURCE.actualTime],
  ['Tổng trừ h', SOURCE.totalDeduction],
  ...deductionTypes.map((type) => [type.name, SOURCE.deduction, { kind: 'deduction', type }]),
  ['Loại SP', SOURCE.product], ['Định mức', SOURCE.standard], ['TT', SOURCE.total],
  ['Tỷ lệ đạt', SOURCE.rate], ['Ngày/Tháng', SOURCE.date], ['Số SP/H', SOURCE.perHour],
  ['OK', SOURCE.ok], ['Tổng NG', SOURCE.ng], ['Tỷ lệ NG', SOURCE.ngRate],
  ...defectTypes.map((type) => [type.name, SOURCE.defect, { kind: 'defect', type }]),
  ['Trạng thái', SOURCE.status], ['Ghi chú', SOURCE.note], ['ID báo cáo', SOURCE.reportId]
];

const clearOldData = (sheet) => {
  if (sheet.rowCount < DATA_START_ROW) return;
  for (let r = DATA_START_ROW; r <= sheet.rowCount; r += 1) {
    const row = sheet.getRow(r);
    for (let c = 1; c <= Math.max(sheet.columnCount, TEMPLATE_COLUMN_COUNT); c += 1) row.getCell(c).value = null;
  }
  sheet.spliceRows(DATA_START_ROW, sheet.rowCount - HEADER_ROW);
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
  const deductionTypes = requestedDeductions.length ? requestedDeductions : collectTypesFromReports(sortedReports, 'deduction');
  const defectTypes = requestedDefects.length ? requestedDefects : collectTypesFromReports(sortedReports, 'defect');
  const columns = buildColumns(deductionTypes, defectTypes);

  const headerSources = Object.fromEntries([...new Set(columns.map(([, source]) => source))].map((source) => [source, captureCell(sheet, HEADER_ROW, source)]));
  const dataSources = Object.fromEntries([...new Set(columns.map(([, source]) => source))].map((source) => [source, captureCell(sheet, DATA_START_ROW, source)]));
  const templateDataRow = sheet.getRow(DATA_START_ROW);
  const dataRowHeight = templateDataRow.height;

  clearOldData(sheet);

  // Dựng lại tiêu đề theo cột động nhưng kế thừa nguyên style từng nhóm từ mẫu.
  const headerRow = sheet.getRow(HEADER_ROW);
  headerRow.height = headerRow.height || 45;
  for (let c = 1; c <= Math.max(columns.length, TEMPLATE_COLUMN_COUNT); c += 1) {
    const cell = headerRow.getCell(c);
    cell.value = null;
    sheet.getColumn(c).hidden = c > columns.length;
  }
  columns.forEach(([title, source], index) => {
    const col = index + 1;
    applyCell(sheet, HEADER_ROW, col, headerSources[source]);
    headerRow.getCell(col).value = title;
    headerRow.getCell(col).alignment = { ...(headerRow.getCell(col).alignment || {}), horizontal: 'center', vertical: 'middle', wrapText: true };
    sheet.getColumn(col).hidden = false;
  });

  let currentDate = '';
  let sequence = 0;
  let rowNumber = DATA_START_ROW;

  for (const report of sortedReports) {
    const dateKey = normalizeDateKey(report.work_date);
    sequence = dateKey === currentDate ? sequence + 1 : 1;
    currentDate = dateKey;

    const ok = toNumber(report.tt_ok);
    const ng = toNumber(report.tt_ng);
    const total = toNumber(report.actual_output) || ok + ng;
    const standard = toNumber(report.standard_output);
    const actualTime = toNumber(report.actual_time);

    const values = [
      sequence, report.worker_code || '', report.full_name || '', report.machine_no || '', report.shift || '',
      toNumber(report.training_percent || 100) / 100, toNumber(report.total_time), actualTime,
      toNumber(report.deduction_time),
      ...deductionTypes.map((type) => detailValue(report.deductions, type.id, 'hours', 'deduction_type_id')),
      report.product_name || '', standard, total, standard > 0 ? total / standard : 0,
      toExcelDate(report.work_date), actualTime > 0 ? total / actualTime : 0,
      ok, ng, total > 0 ? ng / total : 0,
      ...defectTypes.map((type) => detailValue(report.defects, type.id, 'quantity', 'defect_type_id')),
      report.status || 'approved', report.note || '', Number(report.id) || ''
    ];

    const row = sheet.getRow(rowNumber);
    row.height = dataRowHeight;
    columns.forEach(([, source], index) => {
      const col = index + 1;
      applyCell(sheet, rowNumber, col, dataSources[source]);
      row.getCell(col).value = values[index];
    });
    for (let c = columns.length + 1; c <= Math.max(sheet.columnCount, TEMPLATE_COLUMN_COUNT); c += 1) row.getCell(c).value = null;
    rowNumber += 1;
  }

  const productColumn = 10 + deductionTypes.length;
  const rateColumn = productColumn + 3;
  const dateColumn = productColumn + 4;
  const perHourColumn = productColumn + 5;
  const ngRateColumn = productColumn + 8;
  sheet.getColumn(6).numFmt = '0.00%';
  sheet.getColumn(rateColumn).numFmt = '0.00%';
  sheet.getColumn(dateColumn).numFmt = 'dd/mm/yyyy';
  sheet.getColumn(perHourColumn).numFmt = '0.00';
  sheet.getColumn(ngRateColumn).numFmt = '0.00%';

  sheet.views = [{ state: 'frozen', ySplit: HEADER_ROW, activeCell: `A${DATA_START_ROW}` }];
  sheet.autoFilter = { from: { row: HEADER_ROW, column: 1 }, to: { row: HEADER_ROW, column: columns.length } };
  sheet.pageSetup = { ...(sheet.pageSetup || {}), orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printArea: `A1:${sheet.getColumn(columns.length).letter}${Math.max(HEADER_ROW, rowNumber - 1)}` };

  const target = getMonthlyTarget(yearMonth);
  await fs.mkdir(target.folder, { recursive: true });
  const temporaryPath = `${target.filePath}.${process.pid}.${Date.now()}.tmp`;
  await workbook.xlsx.writeFile(temporaryPath);
  await fs.rename(temporaryPath, target.filePath);
  await writeMonthlyCacheMetadata(target, {
    yearMonth, reportCount: sortedReports.length, deductionColumnCount: deductionTypes.length,
    defectColumnCount: defectTypes.length, latestUpdatedAt: options.latestUpdatedAt || null,
    generatedAt: new Date().toISOString(), templateStyle: true
  });

  return { workbook, archivePath: target.filePath, fileName: target.fileName, reportCount: sortedReports.length };
};

module.exports = {
  buildMonthlyTemplateWorkbook,
  getMonthlyTarget,
  readMonthlyCacheMetadata
};
