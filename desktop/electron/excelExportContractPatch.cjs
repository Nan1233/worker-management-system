'use strict';

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

function detailAliases(mod, item, kind) {
  const aliases = [];
  const normalize = mod._private.normalize;
  const id = Number(kind === 'deduction'
    ? item?.deduction_type_id ?? item?.type_id ?? item?.id
    : item?.defect_type_id ?? item?.type_id ?? item?.id);
  const code = kind === 'deduction'
    ? item?.deduction_type_code ?? item?.deduction_code ?? item?.type_code ?? item?.code
    : item?.defect_type_code ?? item?.defect_code ?? item?.type_code ?? item?.code;
  const label = kind === 'deduction'
    ? item?.deduction_type_name ?? item?.deduction_name ?? item?.type_name ?? item?.display_name ?? item?.label ?? item?.name ?? item?.deduction_type_code ?? item?.deduction_code ?? item?.code
    : item?.defect_type_name ?? item?.defect_name ?? item?.type_name ?? item?.display_name ?? item?.label ?? item?.name ?? item?.defect_type_code ?? item?.defect_code ?? item?.code;
  if (Number.isInteger(id) && id > 0) aliases.push(`id:${id}`);
  if (code) aliases.push(`code:${normalize(code)}`);
  if (label) aliases.push(`name:${normalize(label)}`);
  return aliases;
}

function detailValue(item, kind) {
  const raw = kind === 'deduction'
    ? item?.deduction_hours ?? item?.duration_hours ?? item?.time_hours ?? item?.hours ?? item?.value
    : item?.defect_quantity ?? item?.ng_quantity ?? item?.quantity ?? item?.qty ?? item?.value;
  const value = Number(raw);
  if (!Number.isFinite(value)) return 0;
  return kind === 'defect' ? Math.round(value) : value;
}

function makeDetailMap(mod, items, kind) {
  const map = new Map();
  for (const item of items || []) {
    const value = detailValue(item, kind);
    for (const alias of detailAliases(mod, item, kind)) {
      map.set(alias, (map.get(alias) || 0) + value);
    }
  }
  return map;
}

function valueForDetailType(map, type) {
  for (const key of [type.key, ...(type.aliases || [])]) {
    if (map.has(key)) return map.get(key) || 0;
  }
  return 0;
}

function leanStyleHeaders(sheet, columns, config) {
  sheet.properties.defaultRowHeight = 20;
  for (let i = 0; i < columns.length; i += 1) {
    const col = sheet.getColumn(i + 1);
    col.width = Math.max(5, Number(columns[i].width) || 8);
  }

  const last = columns.length;
  sheet.mergeCells(1, 1, 2, last);
  sheet.getCell(1, 1).value = `BÁO CÁO SẢN XUẤT CÔNG ĐOẠN ${config.title}`;
  sheet.getCell(1, 1).font = { name: 'Arial', size: 18, bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getCell(1, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17365D' } };
  sheet.getCell(1, 1).alignment = { horizontal: 'center', vertical: 'middle' };

  sheet.mergeCells(3, 1, 3, last);
  sheet.getCell(3, 1).font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF17365D' } };
  sheet.getCell(3, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9EAF7' } };
  sheet.getCell(3, 1).alignment = { horizontal: 'left', vertical: 'middle' };

  for (let i = 0; i < columns.length; i += 1) {
    const cell = sheet.getCell(5, i + 1);
    cell.value = columns[i].header;
    cell.font = { name: 'Arial', size: 8, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
    cell.alignment = { horizontal: 'center', vertical: 'center', wrapText: true };
  }
  sheet.getRow(4).height = 8;
  sheet.getRow(5).height = 38;
}

async function leanGcProcessWorkbook(mod, args) {
  const startedNs = process.hrtime.bigint();
  const elapsedMs = () => Number(process.hrtime.bigint() - startedNs) / 1e6;
  const profile = (stage, extra = {}) => {
    console.log('[KTC-EXCEL-PROFILE]', stage, JSON.stringify({ elapsedMs: Number(elapsedMs().toFixed(1)), ...extra }));
  };

  const code = 'GC';
  const config = mod.PROCESS_SHEETS[code];
  const payload = args?.payload || {};
  const date = args?.date;
  const yearMonth = String(payload.yearMonth || date || '').slice(0, 7);
  const processData = payload.processes?.[code] || {};
  const settings = payload?.formulaSettings?.[code] || payload?.formulaSettings?.GLOBAL || {};
  const rawReports = Array.isArray(processData.reports) ? processData.reports : [];

  profile('GC_BUILD_START', { date, yearMonth, reportCount: rawReports.length });

  const typesStartedNs = process.hrtime.bigint();
  const deductionTypes = mod._private.processDetailTypes(code, processData, 'deductionTypes', 'deductions', 'deduction');
  const defectTypes = mod._private.processDetailTypes(code, processData, 'defectTypes', 'defects', 'defect');
  const columns = mod._private.makeColumns(code, deductionTypes, defectTypes);
  const reports = mod._private.sortReports(rawReports);
  profile('GC_COLUMNS_READY', {
    stageMs: Number((Number(process.hrtime.bigint() - typesStartedNs) / 1e6).toFixed(1)),
    deductionTypeCount: deductionTypes.length,
    defectTypeCount: defectTypes.length,
    columnCount: columns.length,
    sortedReportCount: reports.length
  });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'KTC Production Control';
  workbook.created = new Date();
  workbook.modified = new Date();
  const sheet = workbook.addWorksheet(config.sheet, {
    views: [{ state: 'frozen', xSplit: 4, ySplit: 5, topLeftCell: 'E6', activeCell: 'E6', showGridLines: false }]
  });

  const headerStartedNs = process.hrtime.bigint();
  leanStyleHeaders(sheet, columns, config);
  sheet.getCell(3, 1).value = `Tháng ${yearMonth.slice(5, 7)}/${yearMonth.slice(0, 4)} • Nguồn: TiDB - báo cáo đã duyệt`;
  profile('GC_HEADERS_READY', { stageMs: Number((Number(process.hrtime.bigint() - headerStartedNs) / 1e6).toFixed(1)) });

  const rows = [];
  const dateRowIndexes = [];
  let previousDate = null;
  let sequence = 0;
  const numericTotals = new Array(columns.length).fill(0);
  let snapshotMs = 0;
  let detailMapMs = 0;
  let valueMapMs = 0;
  let rowMapMs = 0;
  let slowestReportMs = 0;
  let slowestReportIndex = 0;
  let slowestReportId = null;

  profile('GC_REPORT_LOOP_START', { reportCount: reports.length });

  for (let reportIndex = 0; reportIndex < reports.length; reportIndex += 1) {
    const report = reports[reportIndex];
    const reportStartedNs = process.hrtime.bigint();
    const currentDate = String(report.work_date || '').slice(0, 10);

    if (currentDate !== previousDate) {
      const dateRow = new Array(columns.length).fill(null);
      dateRow[0] = currentDate;
      rows.push(dateRow);
      dateRowIndexes.push(5 + rows.length);
      sequence = 0;
      previousDate = currentDate;
    }

    sequence += 1;
    const reportSettings = (processData.formulaSettingsByDate || {})[currentDate] || settings;

    let partStartedNs = process.hrtime.bigint();
    const snapshot = mod._private.reportSnapshot(report, reportSettings);
    snapshotMs += Number(process.hrtime.bigint() - partStartedNs) / 1e6;

    partStartedNs = process.hrtime.bigint();
    const deductions = makeDetailMap(mod, report.deductions, 'deduction');
    const defects = makeDetailMap(mod, report.defects, 'defect');
    detailMapMs += Number(process.hrtime.bigint() - partStartedNs) / 1e6;

    const values = { ...snapshot };
    partStartedNs = process.hrtime.bigint();
    for (const type of deductionTypes) values[`deduction:${type.key}`] = valueForDetailType(deductions, type);
    for (const type of defectTypes) values[`defect:${type.key}`] = valueForDetailType(defects, type);
    valueMapMs += Number(process.hrtime.bigint() - partStartedNs) / 1e6;
    values.stt = sequence;

    partStartedNs = process.hrtime.bigint();
    const row = new Array(columns.length);
    for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
      const value = values[columns[columnIndex].key];
      if (typeof value === 'number' && Number.isFinite(value)) numericTotals[columnIndex] += value;
      row[columnIndex] = value === undefined ? null : value;
    }
    rowMapMs += Number(process.hrtime.bigint() - partStartedNs) / 1e6;
    rows.push(row);

    const reportMs = Number(process.hrtime.bigint() - reportStartedNs) / 1e6;
    if (reportMs > slowestReportMs) {
      slowestReportMs = reportMs;
      slowestReportIndex = reportIndex + 1;
      slowestReportId = report.id ?? report.report_id ?? report.uuid ?? null;
    }

    if ((reportIndex + 1) % 100 === 0 || reportMs >= 1000 || reportIndex === reports.length - 1) {
      profile('GC_REPORT_BATCH', {
        processed: reportIndex + 1,
        total: reports.length,
        lastReportMs: Number(reportMs.toFixed(1)),
        snapshotMs: Number(snapshotMs.toFixed(1)),
        detailMapMs: Number(detailMapMs.toFixed(1)),
        valueMapMs: Number(valueMapMs.toFixed(1)),
        rowMapMs: Number(rowMapMs.toFixed(1)),
        slowestReportMs: Number(slowestReportMs.toFixed(1)),
        slowestReportIndex,
        slowestReportId,
        rows: rows.length
      });
    }
  }

  profile('GC_REPORT_LOOP_END', {
    reportCount: reports.length,
    rows: rows.length,
    snapshotMs: Number(snapshotMs.toFixed(1)),
    detailMapMs: Number(detailMapMs.toFixed(1)),
    valueMapMs: Number(valueMapMs.toFixed(1)),
    rowMapMs: Number(rowMapMs.toFixed(1)),
    slowestReportMs: Number(slowestReportMs.toFixed(1)),
    slowestReportIndex,
    slowestReportId
  });

  const addRowsStartedNs = process.hrtime.bigint();
  profile('GC_ADD_ROWS_START', { rows: rows.length, columns: columns.length });
  sheet.addRows(rows);
  profile('GC_ADD_ROWS_END', {
    rows: rows.length,
    stageMs: Number((Number(process.hrtime.bigint() - addRowsStartedNs) / 1e6).toFixed(1))
  });

  const formatStartedNs = process.hrtime.bigint();
  profile('GC_DATE_ROW_FORMAT_START', { dateRowCount: dateRowIndexes.length });
  for (const rowNumber of dateRowIndexes) {
    const row = sheet.getRow(rowNumber);
    row.height = 22;
    row.getCell(1).font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF17365D' } };
    row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9EAF7' } };
    row.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
    if (columns.length >= 4) sheet.mergeCells(rowNumber, 1, rowNumber, 4);
  }
  profile('GC_DATE_ROW_FORMAT_END', {
    dateRowCount: dateRowIndexes.length,
    stageMs: Number((Number(process.hrtime.bigint() - formatStartedNs) / 1e6).toFixed(1))
  });

  const totalStartedNs = process.hrtime.bigint();
  profile('GC_TOTAL_ROW_START');
  const totalRow = sheet.addRow(new Array(columns.length).fill(null));
  const totalRowNumber = totalRow.number;
  totalRow.getCell(1).value = 'TỔNG CỘNG';
  totalRow.getCell(1).font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
  totalRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17365D' } };
  for (let i = 1; i <= columns.length; i += 1) {
    const cell = totalRow.getCell(i);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17365D' } };
    if (i > 10) cell.value = numericTotals[i - 1] || null;
  }
  profile('GC_TOTAL_ROW_END', {
    stageMs: Number((Number(process.hrtime.bigint() - totalStartedNs) / 1e6).toFixed(1)),
    totalRowNumber
  });

  const setupStartedNs = process.hrtime.bigint();
  sheet.autoFilter = { from: { row: 5, column: 1 }, to: { row: Math.max(5, totalRowNumber - 1), column: columns.length } };
  sheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
  sheet.headerFooter = { oddFooter: '&LKTC Production Control&CTrang &P / &N&R&D &T' };
  profile('GC_SHEET_SETUP_END', {
    stageMs: Number((Number(process.hrtime.bigint() - setupStartedNs) / 1e6).toFixed(1))
  });

  profile('GC_BUILD_END', {
    reportCount: reports.length,
    rowCount: rows.length
  });

  const writeStartedNs = process.hrtime.bigint();
  profile('GC_WRITE_BUFFER_START');
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  profile('GC_WRITE_BUFFER_END', {
    stageMs: Number((Number(process.hrtime.bigint() - writeStartedNs) / 1e6).toFixed(1)),
    bytes: buffer.length
  });

  console.log('[KTC-EXCEL-PERF] GC_LEAN_EXPORT_DONE', JSON.stringify({
    reportCount: reports.length,
    columnCount: columns.length,
    rowCount: rows.length,
    totalMs: Number(elapsedMs().toFixed(1)),
    bytes: buffer.length
  }));

  return {
    buffer,
    result: { code, sheet: config.sheet, reportCount: reports.length, deductionColumnCount: deductionTypes.length, defectColumnCount: defectTypes.length },
    processCode: code,
    processName: config.title,
    fileName: mod.processWorkbookFileName(code, date, payload),
    formulaReplacementCount: 0
  };
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
    Object.defineProperty(mod, '__ktcOriginalBuildProcess', {
      value: mod.buildProcessWorkbookLocal,
      configurable: false,
      enumerable: false,
      writable: false
    });
  }

  if (typeof mod.buildSplitMonthlyWorkbooksLocal === 'function') {
    mod.buildSplitMonthlyWorkbooksLocal = async (args) => leanSplitMonthlyWorkbooks(mod, args);
  }

  if (typeof mod.buildProcessWorkbookLocal === 'function') {
    mod.buildProcessWorkbookLocal = async (args) => {
      if (String(args?.processCode || '').trim().toUpperCase() === 'GC') return leanGcProcessWorkbook(mod, args);
      return mod.__ktcOriginalBuildProcess(args);
    };
  }

  Object.defineProperty(mod, '__ktcExcelExportPatched', { value: true });
  return mod;
}

Module._load = function patchedLoad(request, parent, isMain) {
  if (!patchedModule && String(request).endsWith('monthlyWorkbookLocal.cjs')) {
    const loaded = originalLoad.call(this, request, parent, isMain);
    patchedModule = patchMonthlyModule(loaded);
    return patchedModule;
  }
  return originalLoad.call(this, request, parent, isMain);
};