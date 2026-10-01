'use strict';

const fs = require('node:fs');
const Module = require('node:module');
const ExcelJS = require('exceljs');

const originalLoad = Module._load;
let patchedModule = null;

function normalizeHeader(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .trim()
    .toUpperCase();
}

function columnByHeader(sheet, header) {
  const wanted = normalizeHeader(header);
  for (let col = 1; col <= sheet.columnCount; col += 1) {
    if (normalizeHeader(sheet.getCell(5, col).value) === wanted) return col;
  }
  return 0;
}

function pruneProcessSheet(sheet) {
  if (!sheet || sheet.rowCount < 5) return;

  const removeHeaders = new Set(['TONG SP QUY DOI', 'TRANG THAI', 'GHI CHU', 'ID']);
  const removeColumns = [];
  for (let col = 1; col <= sheet.columnCount; col += 1) {
    if (removeHeaders.has(normalizeHeader(sheet.getCell(5, col).value))) removeColumns.push(col);
  }
  for (let i = removeColumns.length - 1; i >= 0; i -= 1) sheet.spliceColumns(removeColumns[i], 1);

  const trainingCol = columnByHeader(sheet, '% HOC VIEC');
  const standardCol = columnByHeader(sheet, 'DINH MUC');
  const actualTimeCol = columnByHeader(sheet, 'THOI GIAN THUC TE');
  if (!trainingCol || !standardCol || !actualTimeCol) return;

  for (let row = 6; row <= sheet.rowCount; row += 1) {
    const training = Number(sheet.getCell(row, trainingCol).value);
    const standardPerHour = Number(sheet.getCell(row, standardCol).value);
    const actualTime = Number(sheet.getCell(row, actualTimeCol).value);
    if (!Number.isFinite(training) || !Number.isFinite(standardPerHour) || !Number.isFinite(actualTime)) continue;
    sheet.getCell(row, standardCol).value = training * standardPerHour * actualTime;
  }
}

function assertOnlyExpectedSheet(workbook, sheetName) {
  const sheets = workbook.worksheets;
  if (sheets.length !== 1 || sheets[0].name !== sheetName) {
    const names = sheets.map((sheet) => sheet.name).join(', ');
    throw new Error(`GC workbook phải chỉ có 1 sheet (${sheetName}), thực tế: ${names || '(none)'}`);
  }
}

function detailAliasMap(items, kind) {
  const map = new Map();
  for (const item of items || []) {
    const idValue = kind === 'deduction'
      ? item?.deduction_type_id ?? item?.type_id ?? item?.id
      : item?.defect_type_id ?? item?.type_id ?? item?.id;
    const codeValue = kind === 'deduction'
      ? item?.deduction_type_code ?? item?.deduction_code ?? item?.type_code ?? item?.code
      : item?.defect_type_code ?? item?.defect_code ?? item?.type_code ?? item?.code;
    const labelValue = kind === 'deduction'
      ? item?.deduction_type_name ?? item?.deduction_name ?? item?.type_name ?? item?.display_name ?? item?.label ?? item?.name ?? item?.deduction_type_code ?? item?.deduction_code ?? item?.code
      : item?.defect_type_name ?? item?.defect_name ?? item?.type_name ?? item?.display_name ?? item?.label ?? item?.name ?? item?.defect_type_code ?? item?.defect_code ?? item?.code;
    const value = Number(kind === 'deduction'
      ? item?.deduction_hours ?? item?.duration_hours ?? item?.time_hours ?? item?.hours ?? item?.value
      : item?.defect_quantity ?? item?.ng_quantity ?? item?.quantity ?? item?.qty ?? item?.value);
    if (!Number.isFinite(value)) continue;
    const aliases = [];
    const id = Number(idValue);
    if (Number.isInteger(id) && id > 0) aliases.push(`id:${id}`);
    if (codeValue) aliases.push(`code:${normalizeHeader(codeValue)}`);
    if (labelValue) aliases.push(`name:${normalizeHeader(labelValue)}`);
    for (const alias of aliases) map.set(alias, (map.get(alias) || 0) + (kind === 'defect' ? Math.round(value) : value));
  }
  return map;
}

function fastRenderGcSheet(mod, workbook, processData, yearMonth) {
  const code = 'GC';
  const config = mod.PROCESS_SHEETS[code];
  const deductionTypes = mod._private.processDetailTypes(code, processData, 'deductionTypes', 'deductions', 'deduction');
  const defectTypes = mod._private.processDetailTypes(code, processData, 'defectTypes', 'defects', 'defect');
  const columns = mod._private.makeColumns(code, deductionTypes, defectTypes);
  const reports = mod._private.sortReports(processData?.reports || []);
  const sheet = workbook.addWorksheet(config.sheet, {
    views: [{ state: 'frozen', xSplit: 4, ySplit: 5, topLeftCell: 'E6', activeCell: 'E6', showGridLines: false }]
  });
  sheet.properties.defaultRowHeight = 20;

  columns.forEach((column, index) => {
    const excelColumn = sheet.getColumn(index + 1);
    excelColumn.width = Math.max(5, Number(column.width) || 8);
    if (column.format) excelColumn.numFmt = column.format;
    excelColumn.alignment = {
      horizontal: column.align || (['number','decimal'].includes(column.kind) ? 'right' : 'center'),
      vertical: 'middle'
    };
  });

  const lastColumn = columns.length;
  sheet.mergeCells(1, 1, 2, lastColumn);
  sheet.getCell(1, 1).value = `BÁO CÁO SẢN XUẤT CÔNG ĐOẠN ${config.title}`;
  sheet.getCell(1, 1).font = { name: 'Arial', size: 18, bold: true, color: { argb: mod._private.COLORS.white } };
  sheet.getCell(1, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: mod._private.COLORS.navy } };
  sheet.getCell(1, 1).alignment = { horizontal: 'center', vertical: 'middle' };

  sheet.mergeCells(3, 1, 3, lastColumn);
  const [year, month] = yearMonth.split('-');
  sheet.getCell(3, 1).value = `Tháng ${month}/${year} • Nguồn: TiDB - báo cáo đã duyệt`;
  sheet.getCell(3, 1).font = { name: 'Arial', size: 11, bold: true, color: { argb: mod._private.COLORS.navy } };
  sheet.getCell(3, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: mod._private.COLORS.blueLight } };

  let start = 1;
  while (start <= lastColumn) {
    const group = columns[start - 1].group;
    let end = start;
    while (end < lastColumn && columns[end].group === group) end += 1;
    if (end > start) sheet.mergeCells(4, start, 4, end);
    const label = group === 'deduction' ? config.deductionGroup : group === 'defect' ? config.defectGroup : group === 'general' ? 'THÔNG TIN CHUNG' : group === 'time' ? 'THỜI GIAN' : group === 'result' ? 'KẾT QUẢ SẢN XUẤT' : 'TỔNG HỢP';
    const cell = sheet.getCell(4, start);
    cell.value = label;
    cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: mod._private.COLORS.white } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: mod._private.COLORS.blue } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    start = end + 1;
  }

  columns.forEach((column, index) => {
    const cell = sheet.getCell(5, index + 1);
    cell.value = String(column.header || column.key);
    cell.font = { name: 'Arial', size: 7, bold: true, color: { argb: mod._private.COLORS.white } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: mod._private.COLORS.blue } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });
  sheet.getRow(4).height = 22;
  sheet.getRow(5).height = 38;

  const baseSettings = mod._private.reportSnapshot;
  const settingsByDate = processData?.formulaSettingsByDate || {};
  const deductionMaps = reports.map((report) => detailAliasMap(report?.deductions, 'deduction'));
  const defectMaps = reports.map((report) => detailAliasMap(report?.defects, 'defect'));

  let rowNumber = 6;
  let previousDate = null;
  let sequenceInDate = 0;
  for (let reportIndex = 0; reportIndex < reports.length; reportIndex += 1) {
    const report = reports[reportIndex];
    const currentDate = String(report.work_date || '').slice(0, 10);
    if (currentDate !== previousDate) {
      const dateRow = sheet.getRow(rowNumber);
      dateRow.getCell(1).value = currentDate;
      dateRow.getCell(1).font = { name: 'Arial', size: 10, bold: true, color: { argb: mod._private.COLORS.navy } };
      dateRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: mod._private.COLORS.blueLight } };
      dateRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
      sheet.mergeCells(rowNumber, 1, rowNumber, Math.min(4, lastColumn));
      rowNumber += 1;
      sequenceInDate = 0;
    }

    sequenceInDate += 1;
    const settings = (currentDate && settingsByDate[currentDate]) || {};
    const snapshot = baseSettings(report, settings);
    const deductionMap = deductionMaps[reportIndex];
    const defectMap = defectMaps[reportIndex];
    const values = new Array(lastColumn).fill(null);
    for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
      const column = columns[columnIndex];
      let value = snapshot[column.key];
      if (column.key === 'stt') value = sequenceInDate;
      else if (column.key.startsWith('deduction:')) {
        const type = deductionTypes.find((item) => item.key === column.key.slice('deduction:'.length));
        value = type ? ((type.aliases || []).map((alias) => deductionMap.get(alias)).find((item) => item !== undefined) || 0) : 0;
      } else if (column.key.startsWith('defect:')) {
        const type = defectTypes.find((item) => item.key === column.key.slice('defect:'.length));
        value = type ? ((type.aliases || []).map((alias) => defectMap.get(alias)).find((item) => item !== undefined) || 0) : 0;
      }
      values[columnIndex] = value === undefined ? null : value;
    }
    sheet.getRow(rowNumber).values = [null, ...values];
    rowNumber += 1;
    previousDate = currentDate;
  }

  const totalRowNumber = rowNumber;
  const totalLabelEnd = Math.min(10, lastColumn);
  if (totalLabelEnd > 1) sheet.mergeCells(totalRowNumber, 1, totalRowNumber, totalLabelEnd);
  sheet.getCell(totalRowNumber, 1).value = 'TỔNG CỘNG';
  sheet.getCell(totalRowNumber, 1).font = { name: 'Arial', size: 11, bold: true, color: { argb: mod._private.COLORS.white } };
  sheet.getCell(totalRowNumber, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: mod._private.COLORS.navy } };
  sheet.getRow(totalRowNumber).height = 24;

  sheet.autoFilter = { from: { row: 5, column: 1 }, to: { row: Math.max(5, totalRowNumber - 1), column: lastColumn } };
  sheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9, margins: { left: 0.2, right: 0.2, top: 0.4, bottom: 0.4, header: 0.15, footer: 0.15 } };
  sheet.headerFooter = { oddFooter: '&LKTC Production Control&CTrang &P / &N&R&D &T' };
  return { code, sheet: config.sheet, reportCount: reports.length, deductionColumnCount: deductionTypes.length, defectColumnCount: defectTypes.length };
}

async function leanGcProcessWorkbook(mod, args) {
  const startedAt = Date.now();
  const code = 'GC';
  const config = mod.PROCESS_SHEETS[code];
  const payload = args?.payload || {};
  const date = args?.date;
  const yearMonth = String(payload.yearMonth || date || '').slice(0, 7);
  const processData = payload.processes?.[code] || {};

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'KTC Production Control';
  workbook.created = new Date();
  workbook.modified = new Date();

  const renderStartedAt = Date.now();
  const result = fastRenderGcSheet(mod, workbook, processData, yearMonth);
  console.info('[KTC-EXCEL-PERF] GC_RENDER_FAST_DONE', {
    reportCount: processData?.reports?.length || 0,
    sheetRows: workbook.getWorksheet(config.sheet)?.rowCount || 0,
    sheetColumns: workbook.getWorksheet(config.sheet)?.columnCount || 0,
    elapsedMs: Date.now() - renderStartedAt
  });

  const processSheet = workbook.getWorksheet(config.sheet);
  if (!processSheet) throw new Error(`Không tạo được sheet ${config.sheet}`);

  const pruneStartedAt = Date.now();
  pruneProcessSheet(processSheet);
  assertOnlyExpectedSheet(workbook, config.sheet);
  console.info('[KTC-EXCEL-PERF] GC_PRUNE_DONE', {
    sheetRows: processSheet.rowCount,
    sheetColumns: processSheet.columnCount,
    elapsedMs: Date.now() - pruneStartedAt
  });

  const writeStartedAt = Date.now();
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  console.info('[KTC-EXCEL-PERF] GC_WRITEBUFFER_DONE', {
    bytes: buffer.length,
    elapsedMs: Date.now() - writeStartedAt,
    totalElapsedMs: Date.now() - startedAt
  });
  return { buffer, result, processCode: code, processName: config.title, fileName: mod.processWorkbookFileName(code, date, payload), formulaReplacementCount: 0 };
}

async function leanSplitMonthlyWorkbooks(mod, args) {
  const payload = args?.payload || {};
  const processes = [];
  for (const code of Object.keys(mod.PROCESS_SHEETS)) {
    const processData = payload.processes?.[code];
    if (!Array.isArray(processData?.reports) || processData.reports.length === 0) continue;
    if (code === 'GC') processes.push(await leanGcProcessWorkbook(mod, args));
    else processes.push(await mod.__ktcOriginalBuildProcess({ ...args, processCode: code }));
  }
  return { summary: null, processes };
}

function patchMonthlyModule(mod) {
  if (!mod || mod.__ktcExcelExportPatched) return mod;
  if (typeof mod.buildProcessWorkbookLocal === 'function') {
    Object.defineProperty(mod, '__ktcOriginalBuildProcess', { value: mod.buildProcessWorkbookLocal, configurable: false, enumerable: false, writable: false });
  }
  if (typeof mod.buildSplitMonthlyWorkbooksLocal === 'function') mod.buildSplitMonthlyWorkbooksLocal = async (args) => leanSplitMonthlyWorkbooks(mod, args);
  if (typeof mod.buildProcessWorkbookLocal === 'function') {
    mod.buildProcessWorkbookLocal = async (args) => String(args?.processCode || '').trim().toUpperCase() === 'GC'
      ? leanGcProcessWorkbook(mod, args)
      : mod.__ktcOriginalBuildProcess(args);
  }
  Object.defineProperty(mod, '__ktcExcelExportPatched', { value: true });
  return mod;
}

Module._load = function patchedLoad(request, parent, isMain) {
  if (!patchedModule && String(request).endsWith('monthlyWorkbookLocal.cjs')) {
    const originalCjsExtension = Module._extensions['.cjs'];
    Module._extensions['.cjs'] = function patchedCjsExtension(module, filename) {
      let source = fs.readFileSync(filename, 'utf8');
      source = source.replace(/\s*applyAllBorders\(sheet, \{ fromRow: 4, toRow: totalRowNumber, fromCol: 1, toCol: lastColumn \}\);/, '');
      module._compile(source, filename);
    };
    try {
      const loaded = originalLoad.call(this, request, parent, isMain);
      patchedModule = patchMonthlyModule(loaded);
      return patchedModule;
    } finally {
      Module._extensions['.cjs'] = originalCjsExtension;
    }
  }
  return originalLoad.call(this, request, parent, isMain);
};
