'use strict';

const Module = require('node:module');
const ExcelJS = require('exceljs');
const fs = require('node:fs');

const originalLoad = Module._load;
let patched = false;

function activeCodes(payload) {
  return Object.entries(payload?.processes || {})
    .filter(([, data]) => Array.isArray(data?.reports) && data.reports.length > 0)
    .map(([code]) => String(code).trim().toUpperCase());
}

function patch(mod) {
  if (!mod || mod.__ktcFastSingleSheet) return mod;
  const privateApi = mod._private || {};
  const sheets = mod.PROCESS_SHEETS;
  const fileName = mod.processWorkbookFileName;
  const makeColumns = privateApi.makeColumns;
  const processDetailTypes = privateApi.processDetailTypes;
  const rowValues = privateApi.rowValues;
  const settingsForReport = privateApi.settingsForReport;
  const sortReports = privateApi.sortReports;
  const colors = privateApi.COLORS || {};

  if (!sheets || typeof fileName !== 'function' || typeof makeColumns !== 'function' ||
      typeof processDetailTypes !== 'function' || typeof rowValues !== 'function' ||
      typeof settingsForReport !== 'function' || typeof sortReports !== 'function') {
    return mod;
  }

  const numberFormats = {
    INTEGER: '#,##0',
    DECIMAL: '#,##0.00',
    RATE: '#,##0.00',
    PERCENT: '0.00%',
    DATE: 'dd/mm/yyyy',
    DATETIME: 'dd/mm/yyyy hh:mm'
  };

  function normalizeDate(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    const s = String(value ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function groupLabel(group, config) {
    if (group === 'general') return 'THÔNG TIN CHUNG';
    if (group === 'time') return 'THỜI GIAN';
    if (group === 'deduction') return config.deductionGroup || 'CHI TIẾT THỜI GIAN TRỪ';
    if (group === 'result') return 'KẾT QUẢ';
    if (group === 'defect') return config.defectGroup || 'CHI TIẾT NG';
    if (group === 'summary') return 'TỔNG HỢP';
    return String(group || '').toUpperCase();
  }

  function applyHeader(sheet, columns, config) {
    let start = 1;
    while (start <= columns.length) {
      const group = columns[start - 1].group;
      let end = start;
      while (end < columns.length && columns[end].group === group) end += 1;
      const from = start;
      const to = end;
      sheet.mergeCells(4, from, 4, to);
      const cell = sheet.getCell(4, from);
      cell.value = groupLabel(group, config);
      cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17365D' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      start = end;
    }

    columns.forEach((column, index) => {
      const cell = sheet.getCell(5, index + 1);
      cell.value = String(column.header || column.key || '');
      cell.font = { name: 'Arial', size: 8, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      sheet.getColumn(index + 1).width = Math.max(5, Number(column.width) || 8);
    });
    sheet.getRow(4).height = 22;
    sheet.getRow(5).height = 38;
  }

  function cellValueForColumn(values, column) {
    const value = values[column.key];
    return value === undefined ? null : value;
  }

  async function build(args = {}) {
    const code = String(args.processCode || '').trim().toUpperCase();
    const config = sheets[code];
    if (!config) throw new Error(`Unsupported process: ${code}`);
    const payload = args.payload || {};
    const processData = payload.processes?.[code] || {};
    const yearMonth = String(payload.yearMonth || args.date || '').slice(0, 7);
    const started = Date.now();

    const deductionTypes = processDetailTypes(code, processData, 'deductionTypes', 'deductions', 'deduction');
    const defectTypes = processDetailTypes(code, processData, 'defectTypes', 'defects', 'defect');
    const columns = makeColumns(code, deductionTypes, defectTypes);
    const reports = sortReports(processData.reports || []);
    const settings = payload.formulaSettings?.[code] || payload.formulaSettings?.GLOBAL || {};

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'KTC Production Control';
    workbook.created = new Date();
    workbook.modified = new Date();

    const sheet = workbook.addWorksheet(config.sheet, {
      views: [{ state: 'frozen', xSplit: 4, ySplit: 5, topLeftCell: 'E6', activeCell: 'E6', showGridLines: false }]
    });
    sheet.properties.defaultRowHeight = 20;

    const lastColumn = columns.length;
    sheet.mergeCells(1, 1, 2, lastColumn);
    sheet.getCell(1, 1).value = `BÁO CÁO SẢN XUẤT CÔNG ĐOẠN ${config.title}`;
    sheet.getCell(1, 1).font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getCell(1, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17365D' } };
    sheet.getCell(1, 1).alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.mergeCells(3, 1, 3, lastColumn);
    const [year, month] = yearMonth.split('-');
    sheet.getCell(3, 1).value = `Tháng ${month}/${year} • Nguồn: TiDB - báo cáo đã duyệt`;
    sheet.getCell(3, 1).font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF17365D' } };
    sheet.getCell(3, 1).alignment = { horizontal: 'left', vertical: 'middle' };

    applyHeader(sheet, columns, config);

    const matrix = [];
    const dateRows = [];
    const reportRows = [];
    const numericTotals = new Array(columns.length).fill(0);
    let previousDate = '';
    let sequenceInDate = 0;

    for (const report of reports) {
      const currentDate = String(report.work_date || '').slice(0, 10);
      if (currentDate !== previousDate) {
        const row = new Array(lastColumn).fill(null);
        row[0] = normalizeDate(report.work_date) || String(report.work_date || '');
        matrix.push(row);
        dateRows.push(6 + matrix.length - 1);
        sequenceInDate = 0;
      }

      sequenceInDate += 1;
      const reportSettings = settingsForReport(report, settings, processData.formulaSettingsByDate || {});
      const values = rowValues(code, report, deductionTypes, defectTypes, reportSettings);
      values.stt = sequenceInDate;
      const row = columns.map((column, columnIndex) => {
        const value = cellValueForColumn(values, column);
        if (typeof value === 'number' && Number.isFinite(value)) numericTotals[columnIndex] += value;
        return value;
      });
      matrix.push(row);
      reportRows.push(6 + matrix.length - 1);
      previousDate = currentDate;
    }

    if (matrix.length) sheet.addRows(matrix);

    // Date separator rows are merged once per date. No per-cell styling is done
    // for the report body, which is the main performance win for large months.
    for (const rowNumber of dateRows) {
      sheet.mergeCells(rowNumber, 1, rowNumber, Math.min(4, lastColumn));
      const cell = sheet.getCell(rowNumber, 1);
      const value = cell.value;
      cell.value = value instanceof Date ? value : String(value || '');
      cell.numFmt = '@';
      cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF17365D' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } };
      cell.alignment = { horizontal: 'left', vertical: 'middle' };
      sheet.getRow(rowNumber).height = 22;
    }

    const totalRow = 6 + matrix.length;
    if (lastColumn > 1) sheet.mergeCells(totalRow, 1, totalRow, Math.min(10, lastColumn));
    const totalLabel = sheet.getCell(totalRow, 1);
    totalLabel.value = 'TỔNG CỘNG';
    totalLabel.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    totalLabel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17365D' } };
    for (let c = 2; c <= Math.min(10, lastColumn); c += 1) sheet.getCell(totalRow, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17365D' } };
    for (let c = Math.min(10, lastColumn) + 1; c <= lastColumn; c += 1) {
      const cell = sheet.getCell(totalRow, c);
      cell.value = numericTotals[c - 1] || 0;
      cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17365D' } };
    }

    // Apply number formats by column rather than cell-by-cell.
    columns.forEach((column, index) => {
      if (!column.format) return;
      const col = sheet.getColumn(index + 1);
      col.numFmt = numberFormats[column.format] || column.format;
    });

    sheet.autoFilter = { from: { row: 5, column: 1 }, to: { row: Math.max(5, totalRow - 1), column: lastColumn } };
    sheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };

    if (workbook.worksheets.length !== 1) throw new Error(`Export ${code} phải chỉ có 1 sheet`);

    const renderMs = Date.now() - started;
    const writeStarted = Date.now();
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const writeMs = Date.now() - writeStarted;

    console.info('[KTC-EXCEL-PERF] SINGLE_SHEET_EXPORT_DONE', {
      processCode: code,
      reportCount: reports.length,
      rows: sheet.rowCount,
      columns: sheet.columnCount,
      renderMs,
      writeMs,
      totalMs: Date.now() - started,
      builder: 'lean-direct-row-builder'
    });

    return {
      buffer,
      result: { code, sheet: config.sheet, reportCount: reports.length },
      processCode: code,
      processName: config.title,
      fileName: fileName(code, args.date, payload),
      formulaReplacementCount: 0
    };
  }

  mod.buildProcessWorkbookLocal = build;
  mod.buildSplitMonthlyWorkbooksLocal = async (args = {}) => ({
    summary: null,
    processes: await Promise.all(activeCodes(args.payload).map((code) => build({ ...args, processCode: code })))
  });
  Object.defineProperty(mod, '__ktcFastSingleSheet', { value: true });
  return mod;
}

Module._load = function(request, parent, isMain) {
  if (!patched && typeof request === 'string' && /monthlyWorkbookLocal\\.cjs$/.test(request)) {
    const originalExtension = Module._extensions['.cjs'];
    Module._extensions['.cjs'] = function(module, filename) {
      let source = fs.readFileSync(filename, 'utf8');
      // Expose only the two internal helpers needed by the lean builder.
      source = source.replace(
        /renderProcessSheet,\n    sortReports,/,
        'renderProcessSheet,\n    rowValues,\n    settingsForReport,\n    sortReports,'
      );
      // Do not run the expensive whole-table border pass in the loaded module.
      source = source.replace(/\\s*applyAllBorders\\(sheet, \\{ fromRow: 4, toRow: totalRowNumber, fromCol: 1, toCol: lastColumn \\}\\);/, '');
      module._compile(source, filename);
    };
    try {
      const loaded = originalLoad.call(this, request, parent, isMain);
      patched = true;
      return patch(loaded);
    } finally {
      Module._extensions['.cjs'] = originalExtension;
    }
  }
  return originalLoad.call(this, request, parent, isMain);
};
