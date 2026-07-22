const ExcelJS = require('exceljs');
const fs = require('node:fs/promises');
const path = require('node:path');

const SHEET_NAME = 'Báo cáo sản xuất';
const DATA_START_ROW = 2;

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

const sortReports = (first, second) => {
  const dateCompare = normalizeDateKey(first.work_date).localeCompare(normalizeDateKey(second.work_date));
  if (dateCompare) return dateCompare;
  const workerCompare = String(first.worker_code || '').localeCompare(
    String(second.worker_code || ''),
    undefined,
    { numeric: true, sensitivity: 'base' }
  );
  if (workerCompare) return workerCompare;
  return Number(first.id) - Number(second.id);
};

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
    if (!item.id || map.has(item.id)) return;
    map.set(item.id, item);
  });
  return [...map.values()].sort((a, b) =>
    a.process_id - b.process_id || a.sort_order - b.sort_order || a.id - b.id
  );
};

const collectTypesFromReports = (reports, kind) => uniqueTypes(
  reports.flatMap((report) => report[kind === 'deduction' ? 'deductions' : 'defects'] || []),
  kind
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

const setHeaderStyle = (row) => {
  row.height = 44;
  row.eachCell((cell) => {
    cell.font = { bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9EAF7' } };
    cell.border = {
      top: { style: 'thin' }, left: { style: 'thin' },
      bottom: { style: 'thin' }, right: { style: 'thin' }
    };
  });
};

const setDataStyle = (row) => {
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.alignment = { vertical: 'middle', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFD9D9D9' } },
      left: { style: 'thin', color: { argb: 'FFD9D9D9' } },
      bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } },
      right: { style: 'thin', color: { argb: 'FFD9D9D9' } }
    };
  });
};

const buildMonthlyTemplateWorkbook = async (reports, yearMonth, options = {}) => {
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) throw new Error('Tháng xuất Excel không hợp lệ');

  const sortedReports = [...reports].sort(sortReports);
  const deductionTypes = uniqueTypes(options.deductionTypes, 'deduction');
  const defectTypes = uniqueTypes(options.defectTypes, 'defect');
  const finalDeductionTypes = deductionTypes.length ? deductionTypes : collectTypesFromReports(sortedReports, 'deduction');
  const finalDefectTypes = defectTypes.length ? defectTypes : collectTypesFromReports(sortedReports, 'defect');

  const headers = [
    'STT', 'Mã nhân viên', 'Tên', 'Số máy', 'Ca', '% học việc',
    'Thời gian làm việc', 'Thời gian làm thực tế', 'Tổng trừ h',
    ...finalDeductionTypes.map((item) => item.name),
    'Loại SP', 'Định mức', 'TT', 'Tỷ lệ đạt', 'Ngày/Tháng', 'Số SP/H',
    'OK', 'Tổng NG', 'Tỷ lệ NG',
    ...finalDefectTypes.map((item) => item.name),
    'Trạng thái', 'Ghi chú', 'ID báo cáo'
  ];

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'KTC Production Control';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(SHEET_NAME, { views: [{ state: 'frozen', ySplit: 1 }] });
  const headerRow = sheet.addRow(headers);
  setHeaderStyle(headerRow);
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };

  let currentDate = '';
  let sequence = 0;
  sortedReports.forEach((report) => {
    const dateKey = normalizeDateKey(report.work_date);
    sequence = dateKey === currentDate ? sequence + 1 : 1;
    currentDate = dateKey;

    const ok = toNumber(report.tt_ok);
    const ng = toNumber(report.tt_ng);
    const total = toNumber(report.actual_output) || ok + ng;
    const standard = toNumber(report.standard_output);
    const actualTime = toNumber(report.actual_time);

    const values = [
      sequence,
      report.worker_code || '',
      report.full_name || '',
      report.machine_no || '',
      report.shift || '',
      toNumber(report.training_percent || 100) / 100,
      toNumber(report.total_time),
      actualTime,
      toNumber(report.deduction_time),
      ...finalDeductionTypes.map((type) => detailValue(
        report.deductions, type.id, 'hours', 'deduction_type_id'
      )),
      report.product_name || '',
      standard,
      total,
      standard > 0 ? total / standard : 0,
      toExcelDate(report.work_date),
      actualTime > 0 ? total / actualTime : 0,
      ok,
      ng,
      total > 0 ? ng / total : 0,
      ...finalDefectTypes.map((type) => detailValue(
        report.defects, type.id, 'quantity', 'defect_type_id'
      )),
      report.status || 'approved',
      report.note || '',
      Number(report.id) || ''
    ];

    const row = sheet.addRow(values);
    setDataStyle(row);
  });

  const deductionStart = 10;
  const productColumn = deductionStart + finalDeductionTypes.length;
  const rateColumn = productColumn + 3;
  const dateColumn = productColumn + 4;
  const perHourColumn = productColumn + 5;
  const ngRateColumn = productColumn + 8;

  sheet.getColumn(1).width = 8;
  sheet.getColumn(2).width = 14;
  sheet.getColumn(3).width = 24;
  sheet.getColumn(4).width = 14;
  sheet.getColumn(5).width = 10;
  sheet.getColumn(6).width = 12;
  for (let index = 7; index <= 9; index += 1) sheet.getColumn(index).width = 16;
  finalDeductionTypes.forEach((_, index) => { sheet.getColumn(deductionStart + index).width = 16; });
  sheet.getColumn(productColumn).width = 20;
  sheet.getColumn(productColumn + 1).width = 14;
  sheet.getColumn(productColumn + 2).width = 14;
  sheet.getColumn(rateColumn).width = 14;
  sheet.getColumn(dateColumn).width = 14;
  sheet.getColumn(perHourColumn).width = 14;
  sheet.getColumn(productColumn + 6).width = 12;
  sheet.getColumn(productColumn + 7).width = 12;
  sheet.getColumn(ngRateColumn).width = 14;
  finalDefectTypes.forEach((_, index) => { sheet.getColumn(ngRateColumn + 1 + index).width = 16; });
  sheet.getColumn(headers.length - 2).width = 16;
  sheet.getColumn(headers.length - 1).width = 28;
  sheet.getColumn(headers.length).width = 14;

  sheet.getColumn(6).numFmt = '0.00%';
  sheet.getColumn(rateColumn).numFmt = '0.00%';
  sheet.getColumn(dateColumn).numFmt = 'dd/mm/yyyy';
  sheet.getColumn(perHourColumn).numFmt = '0.00';
  sheet.getColumn(ngRateColumn).numFmt = '0.00%';

  const target = getMonthlyTarget(yearMonth);
  await fs.mkdir(target.folder, { recursive: true });
  const temporaryPath = `${target.filePath}.${process.pid}.${Date.now()}.tmp`;
  await workbook.xlsx.writeFile(temporaryPath);
  await fs.rename(temporaryPath, target.filePath);
  await writeMonthlyCacheMetadata(target, {
    yearMonth,
    reportCount: sortedReports.length,
    deductionColumnCount: finalDeductionTypes.length,
    defectColumnCount: finalDefectTypes.length,
    latestUpdatedAt: options.latestUpdatedAt || null,
    generatedAt: new Date().toISOString()
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
  readMonthlyCacheMetadata,
  SHEET_NAME,
  DATA_START_ROW
};
