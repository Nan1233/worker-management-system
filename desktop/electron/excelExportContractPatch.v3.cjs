'use strict';

const Module = require('node:module');
const ExcelJS = require('exceljs');
const path = require('node:path');

const originalLoad = Module._load;
const TEMPLATE_NAME = 'bao-cao-cat-long-export.xlsx';
const SHEET_NAME = 'Cắt lồng';

// Exact columns of the supplied GC template. Hidden columns are intentionally
// preserved because they are part of the original form and contain valid DB detail fields.
const GC_COL = Object.freeze({
  STT: 1, WORKER_CODE: 2, NAME: 3, MACHINE: 4, SHIFT: 5, TRAINING: 6,
  WORKING_TIME: 7, CHANGEOVERS: 8, DEDUCTION_TOTAL: 9,
  DEDUCTION_FIRST: 11, DEDUCTION_LAST: 26,
  PRODUCT: 27, STANDARD: 28, OUTPUT: 29, ACHIEVEMENT: 30,
  DATE: 31, OUTPUT_PER_HOUR: 32, OK: 33, NG: 34, NG_RATE: 35,
  KQD: 36, DEFECT_FIRST: 37, DEFECT_LAST: 54
});

// These are the labels in the real template, in column order K:Z.
const GC_DEDUCTION_HEADERS = [
  'Thiếu sản lượng', 'Bật máy, xét máy', 'Chuyển mã', 'Chỉnh máy',
  'Chờ chỉnh máy', 'Mất điện', 'Mất khí', 'Chờ hàng', 'Bảo dưỡng máy',
  'Nghỉ giải lao', 'Giao ca', 'Dừng máy đi hỗ trợ',
  'Giặt cs/cân cs, tuốt-tái pp, GL', '5s', 'Học việc, đào tạo', 'Đi muộn về sớm'
];

// AJ is the KQD defect type; AK:BB are the following 18 defect columns.
const GC_DEFECT_HEADERS = [
  'KQD', 'Vỡ cao su', 'K xước cong gãy', 'Cao su xoay', 'Cắt không đứt', 'bavia',
  'CSH', 'ppcm', 'KT lớn', 'KT nhỏ', 'LCS', 'cắt lẹm', 'rách nvl',
  'Chân ngắn dài', 'sót via', 'fure trục', 'lẫn cs', 'bavia cắt hụt', 'thiếu cao su'
];

function log(event, data = {}) {
  try {
    const m = process.memoryUsage();
    console.log('[KTC-EXCEL-TEMPLATE]', event, JSON.stringify({
      elapsedMs: Math.round(Number(process.hrtime.bigint()) / 1e6),
      rssMB: Math.round(m.rss / 1048576),
      heapMB: Math.round(m.heapUsed / 1048576),
      ...data
    }));
  } catch (_) {}
}

function normalize(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/Đ/g, 'D').replace(/đ/g, 'd').replace(/[^a-zA-Z0-9]+/g, '').toUpperCase();
}
function asText(value) { return value == null ? '' : String(value); }
function asNumber(value, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const n = Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : fallback;
}
function asDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const s = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function parseExtraData(report) {
  if (!report?.extra_data) return {};
  if (typeof report.extra_data === 'object' && !Array.isArray(report.extra_data)) return report.extra_data;
  try {
    const value = JSON.parse(String(report.extra_data));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch (_) { return {}; }
}
function findGcTemplateSheet(workbook) {
  const sheets = workbook.worksheets || [];
  const exact = sheets.find((s) => normalize(s.name) === normalize(SHEET_NAME));
  const partial = sheets.find((s) => normalize(s.name).includes('CATLONG'));
  if (exact || partial) return exact || partial;
  throw new Error(`Không tìm thấy sheet ${SHEET_NAME} trong template GC.`);
}
function reduceWorkbookToSheet(workbook, keepSheet) {
  for (const sheet of [...workbook.worksheets]) {
    if (sheet.id !== keepSheet.id) workbook.removeWorksheet(sheet.id);
  }
}
function stripBrokenSharedFormulaClones(workbook) {
  let converted = 0;
  let cleared = 0;
  for (const sheet of workbook.worksheets || []) {
    for (const row of sheet._rows || []) {
      for (const cell of row?._cells || []) {
        const model = cell?.model;
        if (!model?.sharedFormula) continue;
        const cached = model.result;
        cell.value = cached == null ? null : cached;
        if (cell.model) delete cell.model.sharedFormula;
        converted += 1;
        if (cached == null) cleared += 1;
      }
    }
  }
  log('TEMPLATE_SHARED_FORMULAS_STRIPPED', { converted, cleared });
  return { converted, cleared };
}

function detailItems(report, kind) {
  const direct = kind === 'deduction' ? report?.deductions : report?.defects;
  if (Array.isArray(direct)) return direct;
  const extra = parseExtraData(report);
  const candidates = kind === 'deduction'
    ? [extra.deductions, extra.deductionDetails, extra.timeDeductions]
    : [extra.defects, extra.defectDetails, extra.ngDetails];
  return candidates.find(Array.isArray) || [];
}
function detailId(item, kind) {
  const raw = kind === 'deduction'
    ? item?.deduction_type_id ?? item?.deductionTypeId ?? item?.type_id
    : item?.defect_type_id ?? item?.defectTypeId ?? item?.type_id;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}
function detailCode(item, kind) {
  return asText(kind === 'deduction'
    ? item?.deduction_code ?? item?.deduction_type_code ?? item?.code
    : item?.defect_code ?? item?.defect_type_code ?? item?.code);
}
function detailName(item, kind) {
  return asText(kind === 'deduction'
    ? item?.deduction_name ?? item?.deduction_type_name ?? item?.name
    : item?.defect_name ?? item?.defect_type_name ?? item?.name);
}
function detailValue(item, kind) {
  const keys = kind === 'deduction'
    ? ['hours', 'deduction_hours', 'duration_hours', 'time_hours', 'value']
    : ['quantity', 'defect_quantity', 'ng_quantity', 'qty', 'count', 'value'];
  for (const key of keys) {
    if (item?.[key] == null || item[key] === '') continue;
    const n = asNumber(item[key], NaN);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}
function typeForDetail(item, types, kind) {
  const id = detailId(item, kind);
  if (id == null) return null;
  return (Array.isArray(types) ? types : []).find((type) => Number(type?.id) === id) || null;
}
function detailAliases(item, type, kind) {
  return [
    detailCode(item, kind), detailName(item, kind),
    type?.code, type?.name, type?.deduction_code, type?.deduction_name,
    type?.defect_code, type?.defect_name
  ].filter(Boolean).map(normalize);
}
function detailForHeader(report, processData, header, kind) {
  const target = normalize(header);
  if (!target) return 0;
  const types = kind === 'deduction' ? processData?.deductionTypes : processData?.defectTypes;
  let total = 0;
  for (const item of detailItems(report, kind)) {
    const type = typeForDetail(item, types, kind);
    if (detailAliases(item, type, kind).some((alias) => alias === target)) {
      total += detailValue(item, kind);
    }
  }
  return total;
}
function machineDisplay(report) {
  const lines = Array.isArray(report?.machineLines) ? report.machineLines : [];
  const values = lines.map((line) => asText(line?.machine_code || line?.machine_no || line?.machine_name)).filter(Boolean);
  return values.length ? [...new Set(values)].join(', ') : asText(report?.machine_no);
}
function productDisplay(report) {
  const lines = Array.isArray(report?.machineLines) ? report.machineLines : [];
  const values = lines.map((line) => asText(line?.product_code)).filter(Boolean);
  return values.length ? [...new Set(values)].join(', ') : asText(report?.product_code ?? report?.product_name);
}
function shiftDisplay(report) {
  const extra = parseExtraData(report);
  return asText(report?.shift ?? report?.ca ?? extra.shift ?? extra.ca);
}
function changeoverCount(report) {
  const extra = parseExtraData(report);
  return asNumber(
    report?.changeover_count ?? report?.change_machine_count ?? report?.so_lan_cm ??
    extra.changeover_count ?? extra.change_machine_count ?? extra.so_lan_cm,
    0
  );
}

function copyCellStyle(source, target) {
  if (!source || !target) return;
  if (source.font) target.font = { ...source.font, color: source.font.color ? { ...source.font.color } : undefined };
  if (source.fill) target.fill = JSON.parse(JSON.stringify(source.fill));
  if (source.border) target.border = JSON.parse(JSON.stringify(source.border));
  if (source.alignment) target.alignment = { ...source.alignment };
  if (source.protection) target.protection = { ...source.protection };
}
function copyRowStyle(sourceRow, targetRow, columnCount) {
  targetRow.height = sourceRow.height;
  targetRow.hidden = false;
  for (let column = 1; column <= columnCount; column += 1) {
    copyCellStyle(sourceRow.getCell(column), targetRow.getCell(column));
  }
}
function clearRowValues(row, columnCount) {
  for (let column = 1; column <= columnCount; column += 1) row.getCell(column).value = null;
}
function setGcNumberFormats(sheet, rowNumber) {
  sheet.getCell(rowNumber, GC_COL.TRAINING).numFmt = '0';
  sheet.getCell(rowNumber, GC_COL.WORKING_TIME).numFmt = '0.##';
  sheet.getCell(rowNumber, GC_COL.CHANGEOVERS).numFmt = '0.##';
  sheet.getCell(rowNumber, GC_COL.DEDUCTION_TOTAL).numFmt = '0.##';
  for (let c = GC_COL.DEDUCTION_FIRST; c <= GC_COL.DEDUCTION_LAST; c += 1) sheet.getCell(rowNumber, c).numFmt = '0.##';
  sheet.getCell(rowNumber, GC_COL.STANDARD).numFmt = '#,##0.##';
  sheet.getCell(rowNumber, GC_COL.OUTPUT).numFmt = '#,##0.##';
  sheet.getCell(rowNumber, GC_COL.ACHIEVEMENT).numFmt = '0%';
  sheet.getCell(rowNumber, GC_COL.DATE).numFmt = 'd-mmm';
  sheet.getCell(rowNumber, GC_COL.OUTPUT_PER_HOUR).numFmt = '0.##';
  sheet.getCell(rowNumber, GC_COL.OK).numFmt = '#,##0';
  sheet.getCell(rowNumber, GC_COL.NG).numFmt = '#,##0';
  sheet.getCell(rowNumber, GC_COL.NG_RATE).numFmt = '0.00%';
  for (let c = GC_COL.DEFECT_FIRST; c <= GC_COL.DEFECT_LAST; c += 1) sheet.getCell(rowNumber, c).numFmt = '#,##0';
}
function writeGcReportRow(sheet, rowNumber, report, processData, sequence) {
  const training = report?.training_percent == null
    ? asNumber(report?.training_factor, 0)
    : asNumber(report.training_percent, 0);
  const workingTime = asNumber(report?.total_time ?? report?.working_time, 0);
  const standard = asNumber(report?.standard_output ?? report?.standard, 0);
  const output = asNumber(report?.actual_output ?? report?.output ?? report?.adjusted_output ?? report?.tt_ok, 0);
  const ok = asNumber(report?.tt_ok ?? report?.ok_quantity ?? report?.ok, 0);

  sheet.getCell(rowNumber, GC_COL.STT).value = sequence;
  sheet.getCell(rowNumber, GC_COL.WORKER_CODE).value = asText(report?.worker_code);
  sheet.getCell(rowNumber, GC_COL.NAME).value = asText(report?.full_name ?? report?.worker_name);
  sheet.getCell(rowNumber, GC_COL.MACHINE).value = machineDisplay(report);
  sheet.getCell(rowNumber, GC_COL.SHIFT).value = shiftDisplay(report);
  sheet.getCell(rowNumber, GC_COL.TRAINING).value = training;
  sheet.getCell(rowNumber, GC_COL.WORKING_TIME).value = workingTime;
  sheet.getCell(rowNumber, GC_COL.CHANGEOVERS).value = changeoverCount(report);
  sheet.getCell(rowNumber, GC_COL.PRODUCT).value = productDisplay(report);
  sheet.getCell(rowNumber, GC_COL.STANDARD).value = standard;
  sheet.getCell(rowNumber, GC_COL.OUTPUT).value = output;
  sheet.getCell(rowNumber, GC_COL.DATE).value = asDate(report?.work_date);
  sheet.getCell(rowNumber, GC_COL.OK).value = ok;

  for (let i = 0; i < GC_DEDUCTION_HEADERS.length; i += 1) {
    const column = GC_COL.DEDUCTION_FIRST + i;
    sheet.getCell(rowNumber, column).value = detailForHeader(
      report, processData, GC_DEDUCTION_HEADERS[i], 'deduction'
    );
  }

  // KQD is the first defect type and is stored in AJ; the remaining 18 defect
  // types map one-to-one to AK:BB. All values come from production_report_defects.
  for (let i = 0; i < GC_DEFECT_HEADERS.length; i += 1) {
    const column = GC_COL.KQD + i;
    if (column > GC_COL.DEFECT_LAST) break;
    sheet.getCell(rowNumber, column).value = detailForHeader(
      report, processData, GC_DEFECT_HEADERS[i], 'defect'
    );
  }

  sheet.getCell(rowNumber, GC_COL.DEDUCTION_TOTAL).value = { formula: `SUM(K${rowNumber}:Z${rowNumber})` };
  sheet.getCell(rowNumber, GC_COL.ACHIEVEMENT).value = { formula: `IFERROR(AC${rowNumber}/AB${rowNumber},0)` };
  sheet.getCell(rowNumber, GC_COL.OUTPUT_PER_HOUR).value = { formula: `IFERROR(AC${rowNumber}/G${rowNumber},0)` };
  sheet.getCell(rowNumber, GC_COL.NG).value = { formula: `SUM(AJ${rowNumber}:BB${rowNumber})` };
  sheet.getCell(rowNumber, GC_COL.NG_RATE).value = { formula: `IFERROR(AH${rowNumber}/(AG${rowNumber}+AH${rowNumber}),0)` };
  setGcNumberFormats(sheet, rowNumber);
}
function writeDateRow(sheet, rowNumber, date, styleSourceRow, columnCount) {
  const row = sheet.getRow(rowNumber);
  copyRowStyle(styleSourceRow, row, columnCount);
  clearRowValues(row, columnCount);
  row.getCell(GC_COL.DATE).value = asDate(date);
  row.getCell(GC_COL.DATE).numFmt = 'd-mmm';
  row.getCell(GC_COL.DATE).font = { ...(row.getCell(GC_COL.DATE).font || {}), bold: true };
}

async function buildGcFromApprovedDb(args) {
  const payload = args?.payload || {};
  const processData = payload?.processes?.GC || {};
  const reports = Array.isArray(processData.reports) ? [...processData.reports] : [];
  reports.sort((a, b) => {
    const ad = String(a?.work_date || '');
    const bd = String(b?.work_date || '');
    if (ad !== bd) return ad.localeCompare(bd);
    return String(a?.approved_at || a?.created_at || '').localeCompare(
      String(b?.approved_at || b?.created_at || '')
    );
  });
  if (payload.dataSource !== 'tidb.production_reports.approved') {
    throw new Error('GC Excel chỉ được xuất từ production_reports đã duyệt trong TiDB.');
  }
  for (const report of reports) {
    if (report?.dataSource !== 'production_reports' || report?.isApprovedDatabaseRecord !== true) {
      throw new Error(`Báo cáo ${report?.id || '?'} không phải dữ liệu đã duyệt từ TiDB.`);
    }
  }

  const templatePath = path.join(args.appPath, 'assets', 'templates', TEMPLATE_NAME);
  const started = Date.now();
  log('BUILD_GC_DB_TEMPLATE_START', {
    date: args?.date,
    reportCount: reports.length,
    templatePath
  });

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(templatePath);
  const sheet = findGcTemplateSheet(workbook);
  const originalSheetCount = workbook.worksheets.length;
  reduceWorkbookToSheet(workbook, sheet);
  sheet.state = 'visible';
  const formulaStats = stripBrokenSharedFormulaClones(workbook);

  // Row 6 in the supplied file is sample/old data (worker 2556). Do not carry it
  // into production. Row 7 is the sample date-row style; row 8 is the sample data-row style.
  const dateStyleRow = sheet.getRow(7);
  const dataStyleRow = sheet.getRow(8);
  const columnCount = Math.max(sheet.columnCount, GC_COL.DEFECT_LAST);

  // Clear the template sample data from row 6 onward, while retaining row styles.
  for (let r = 6; r <= sheet.rowCount; r += 1) clearRowValues(sheet.getRow(r), columnCount);

  let rowNumber = 6;
  let currentDate = '';
  let sequence = 0;
  let dateRows = 0;
  let reportRows = 0;

  for (const report of reports) {
    const workDate = String(report?.work_date || '').slice(0, 10);
    if (workDate !== currentDate) {
      currentDate = workDate;
      sequence = 0;
      writeDateRow(sheet, rowNumber, workDate, dateStyleRow, columnCount);
      dateRows += 1;
      rowNumber += 1;
    }

    const row = sheet.getRow(rowNumber);
    copyRowStyle(dataStyleRow, row, columnCount);
    clearRowValues(row, columnCount);
    sequence += 1;
    writeGcReportRow(sheet, rowNumber, report, processData, sequence);
    reportRows += 1;
    rowNumber += 1;
  }

  // Remove stale blank/sample rows to keep the workbook size reasonable.
  const lastRow = Math.max(5, rowNumber - 1);
  if (sheet.rowCount > lastRow) sheet.spliceRows(lastRow + 1, sheet.rowCount - lastRow);

  workbook.views = [{ activeTab: 0, firstSheet: 0, visibility: 'visible' }];
  workbook.calcProperties.fullCalcOnLoad = true;
  workbook.calcProperties.forceFullCalc = true;
  workbook.calcProperties.calcMode = 'auto';

  log('GC_DB_TEMPLATE_RENDERED', {
    reportRows,
    dateRows,
    lastRow,
    columns: columnCount,
    originalSheetCount
  });
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  log('GC_DB_TEMPLATE_DONE', {
    reportCount: reports.length,
    reportRows,
    dateRows,
    bytes: buffer.length,
    sharedFormulaConverted: formulaStats.converted,
    sharedFormulaCleared: formulaStats.cleared,
    elapsedMs: Date.now() - started
  });

  return {
    buffer,
    result: { code: 'GC', sheet: sheet.name, reportCount: reports.length, dateRows },
    processCode: 'GC',
    processName: 'CẮT/LỒNG',
    fileName: `04_CAT_LONG_${String(args.date || '').slice(5, 7)}-${String(args.date || '').slice(0, 4)}.xlsx`,
    reportCount: reports.length,
    formulaReplacementCount: formulaStats.converted,
    templateKind: 'ONE_SHEET_GC_TEMPLATE_DAILY_BLOCKS_DB_DIRECT'
  };
}

function patchMonthly(mod) {
  if (!mod || mod.__ktcV3MonthlyPatched) return mod;
  const original = mod.buildProcessWorkbookLocal;
  if (typeof original !== 'function') {
    log('PATCH_FAILED', { reason: 'buildProcessWorkbookLocal_missing' });
    return mod;
  }
  mod.buildProcessWorkbookLocal = async (args = {}) => (
    String(args?.processCode || '').trim().toUpperCase() === 'GC'
      ? buildGcFromApprovedDb(args)
      : original(args)
  );
  mod.buildSplitMonthlyWorkbooksLocal = async (args = {}) => {
    const processes = [];
    for (const [code, data] of Object.entries(args?.payload?.processes || {})) {
      if (!Array.isArray(data?.reports) || !data.reports.length) continue;
      processes.push(await mod.buildProcessWorkbookLocal({ ...args, processCode: code }));
    }
    return { summary: null, processes };
  };
  Object.defineProperty(mod, '__ktcV3MonthlyPatched', { value: true });
  log('MONTHLY_PATCH_INSTALLED_V3_GC_TEMPLATE_DB_DETAIL_MAP');
  return mod;
}

Module._load = function patchedLoad(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  if (typeof request === 'string' && /monthlyWorkbookLocal\.cjs$/.test(request)) {
    return patchMonthly(loaded);
  }
  return loaded;
};
