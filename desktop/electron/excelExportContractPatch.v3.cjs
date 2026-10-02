'use strict';

const Module = require('node:module');
const ExcelJS = require('exceljs');
const path = require('node:path');

const originalLoad = Module._load;
const TEMPLATE_NAME = 'bao-cao-cat-long-export.xlsx';
const SHEET_NAME = 'Cắt lồng';

const GC_COL = Object.freeze({
  STT: 1, WORKER_CODE: 2, NAME: 3, MACHINE: 4, SHIFT: 5, TRAINING: 6,
  WORKING_TIME: 7, CHANGEOVERS: 8, DEDUCTION_TOTAL: 9,
  DEDUCTION_FIRST: 10, DEDUCTION_LAST: 17, PRODUCT: 18, STANDARD: 19,
  OUTPUT: 20, ACHIEVEMENT: 21, DATE: 22, OUTPUT_PER_HOUR: 23, OK: 24,
  NG: 25, NG_RATE: 26, KQD: 27, DEFECT_FIRST: 28, DEFECT_LAST: 54
});

// Fallback only. The actual DB type id/code/name is always preferred.
const GC_DEDUCTION_HEADERS = [
  'Chuyển mã', 'Chỉnh máy', 'Nghỉ giải lao', 'Dừng máy đi hỗ trợ',
  'Giặt cs/cân cs, tuốt-tái pp, GL', '5s', 'Học việc, đào tạo', 'Đi muộn về sớm'
];
const GC_DEFECT_HEADERS = [
  'Vỡ cao su', 'K xước cong gãy', 'Cao su xoay', 'Cắt không đứt', 'bavia', 'CSH',
  'ppcm', 'KT lớn', 'KT nhỏ', 'LCS', 'cắt lẹm', 'rách nvl', 'Chân ngắn dài',
  'sót via', 'fure trục', 'lẫn cs', 'bavia cắt hụt', 'thiếu cao su'
];

function log(event, data = {}) {
  try {
    const m = process.memoryUsage();
    console.log('[KTC-EXCEL-TEMPLATE]', event, JSON.stringify({
      elapsedMs: Math.round(Number(process.hrtime.bigint()) / 1e6),
      rssMB: Math.round(m.rss / 1048576),
      heapMB: Math.round(m.heapUsed / 1048576), ...data
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
    const v = JSON.parse(String(report.extra_data));
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch (_) { return {}; }
}
function findGcTemplateSheet(workbook) {
  const sheets = workbook.worksheets || [];
  const exact = sheets.find(s => normalize(s.name) === normalize(SHEET_NAME));
  const partial = sheets.find(s => normalize(s.name).includes('CATLONG'));
  if (exact || partial) return exact || partial;
  throw new Error(`Không tìm thấy sheet ${SHEET_NAME} trong template GC.`);
}
function reduceWorkbookToSheet(workbook, keepSheet) {
  for (const sheet of [...workbook.worksheets]) if (sheet.id !== keepSheet.id) workbook.removeWorksheet(sheet.id);
}
function stripBrokenSharedFormulaClones(workbook) {
  let converted = 0, cleared = 0;
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
    ? ['hours', 'deduction_hours', 'duration_hours', 'time_hours']
    : ['quantity', 'defect_quantity', 'ng_quantity', 'qty', 'count'];
  for (const key of keys) {
    if (item?.[key] == null || item[key] === '') continue;
    const n = asNumber(item[key], NaN);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}
function typeForDetail(item, types, kind) {
  const id = detailId(item, kind);
  return (Array.isArray(types) ? types : []).find(t => Number(t?.id) === Number(id)) || null;
}
function detailMatchesName(item, type, wanted, kind) {
  const target = normalize(wanted);
  if (!target) return false;
  const aliases = [
    detailCode(item, kind), detailName(item, kind),
    type?.code, type?.name, type?.deduction_code, type?.deduction_name,
    type?.defect_code, type?.defect_name
  ].filter(Boolean).map(normalize);
  // Exact normalized matching is deliberate: fuzzy matching caused a date/header
  // column to be mistaken for a deduction/defect column in the old exporter.
  return aliases.some(a => a === target);
}
function findHeader(sheet, column) {
  // The business header is in rows 5-8. Only use it when it is a real text header.
  for (let r = 8; r >= 5; r -= 1) {
    const value = sheet.getCell(r, column).value;
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return '';
}
function resolveColumnHeader(sheet, column, fallback) {
  const h = findHeader(sheet, column);
  const n = normalize(h);
  // Never allow a date/group/title value to become a detail header.
  const forbidden = new Set(['NGAYTHANG', 'NGAYBAOCAO', 'NGAY', 'STT', 'MAUSONHANVIEN', 'TEN', 'SOMAY', 'CA']);
  return forbidden.has(n) ? fallback : (h || fallback);
}
function detailForColumn(report, processData, column, kind, fallbackHeader) {
  const types = kind === 'deduction' ? processData?.deductionTypes : processData?.defectTypes;
  const header = resolveColumnHeader(report.__templateSheet, column, fallbackHeader);
  let total = 0;
  for (const item of detailItems(report, kind)) {
    const type = typeForDetail(item, types, kind);
    if (detailMatchesName(item, type, header, kind)) total += detailValue(item, kind);
  }
  return total;
}

function machineDisplay(report) {
  const lines = Array.isArray(report?.machineLines) ? report.machineLines : [];
  const values = lines.map(x => asText(x?.machine_code || x?.machine_no || x?.machine_name)).filter(Boolean);
  return values.length ? [...new Set(values)].join(', ') : asText(report?.machine_no);
}
function productDisplay(report) {
  const lines = Array.isArray(report?.machineLines) ? report.machineLines : [];
  const values = lines.map(x => asText(x?.product_code)).filter(Boolean);
  return values.length ? [...new Set(values)].join(', ') : asText(report?.product_code ?? report?.product_name);
}
function shiftDisplay(report) {
  const extra = parseExtraData(report);
  return asText(report?.shift ?? report?.ca ?? extra.shift ?? extra.ca);
}
function kqdDisplay(report) {
  const extra = parseExtraData(report);
  return asText(report?.kqd ?? report?.kqd_code ?? report?.result_code ?? extra.kqd ?? extra.kqd_code ?? extra.result_code);
}
function changeoverCount(report) {
  const extra = parseExtraData(report);
  return asNumber(report?.changeover_count ?? report?.change_machine_count ?? report?.so_lan_cm ?? extra.changeover_count ?? extra.change_machine_count ?? extra.so_lan_cm, 0);
}

function copyCellStyle(source, target) {
  if (!source || !target) return;
  if (source.font) target.font = { ...source.font, color: source.font.color ? { ...source.font.color } : undefined };
  if (source.fill) target.fill = JSON.parse(JSON.stringify(source.fill));
  if (source.border) target.border = JSON.parse(JSON.stringify(source.border));
  if (source.alignment) target.alignment = { ...source.alignment };
  if (source.protection) target.protection = { ...source.protection };
  if (source.numFmt) target.numFmt = source.numFmt;
}
function copyRowStyle(sourceRow, targetRow, columnCount) {
  targetRow.height = sourceRow.height;
  targetRow.hidden = false;
  for (let c = 1; c <= columnCount; c += 1) copyCellStyle(sourceRow.getCell(c), targetRow.getCell(c));
}
function clearRowValues(row, columnCount) {
  for (let c = 1; c <= columnCount; c += 1) row.getCell(c).value = null;
}

function writeGcReportRow(sheet, rowNumber, report, processData, sequence) {
  report.__templateSheet = sheet;
  const training = report?.training_percent == null ? asNumber(report?.training_factor, 0) : asNumber(report.training_percent, 0);
  const workingTime = asNumber(report?.total_time ?? report?.working_time, 0);
  const standard = asNumber(report?.standard_output ?? report?.standard, 0);
  const output = asNumber(report?.actual_output ?? report?.output ?? report?.adjusted_output ?? report?.tt_ok, 0);
  const ok = asNumber(report?.tt_ok ?? report?.ok_quantity ?? report?.ok, 0);
  const values = new Map([
    [GC_COL.STT, sequence], [GC_COL.WORKER_CODE, asText(report?.worker_code)],
    [GC_COL.NAME, asText(report?.full_name ?? report?.worker_name)], [GC_COL.MACHINE, machineDisplay(report)],
    [GC_COL.SHIFT, shiftDisplay(report)], [GC_COL.TRAINING, training], [GC_COL.WORKING_TIME, workingTime],
    [GC_COL.CHANGEOVERS, changeoverCount(report)], [GC_COL.PRODUCT, productDisplay(report)],
    [GC_COL.STANDARD, standard], [GC_COL.OUTPUT, output], [GC_COL.DATE, asDate(report?.work_date)],
    [GC_COL.OK, ok], [GC_COL.KQD, kqdDisplay(report)]
  ]);
  for (const [column, value] of values) {
    const cell = sheet.getCell(rowNumber, column); cell.value = value;
    if (column === GC_COL.DATE) cell.numFmt = 'd-mmm';
  }
  for (let c = GC_COL.DEDUCTION_FIRST; c <= GC_COL.DEDUCTION_LAST; c += 1) {
    sheet.getCell(rowNumber, c).value = detailForColumn(report, processData, c, 'deduction', GC_DEDUCTION_HEADERS[c - GC_COL.DEDUCTION_FIRST]);
  }
  for (let c = GC_COL.DEFECT_FIRST; c <= GC_COL.DEFECT_LAST; c += 1) {
    const fallback = GC_DEFECT_HEADERS[c - GC_COL.DEFECT_FIRST] || '';
    sheet.getCell(rowNumber, c).value = detailForColumn(report, processData, c, 'defect', fallback);
  }
  sheet.getCell(rowNumber, GC_COL.DEDUCTION_TOTAL).value = { formula: `SUM(J${rowNumber}:Q${rowNumber})` };
  sheet.getCell(rowNumber, GC_COL.NG).value = { formula: `SUM(AB${rowNumber}:BB${rowNumber})` };
  sheet.getCell(rowNumber, GC_COL.ACHIEVEMENT).value = { formula: `IFERROR(T${rowNumber}/S${rowNumber},0)` };
  sheet.getCell(rowNumber, GC_COL.OUTPUT_PER_HOUR).value = { formula: `IFERROR(T${rowNumber}/G${rowNumber},0)` };
  sheet.getCell(rowNumber, GC_COL.NG_RATE).value = { formula: `IFERROR(Y${rowNumber}/(X${rowNumber}+Y${rowNumber}),0)` };
  delete report.__templateSheet;
}
function writeDateRow(sheet, rowNumber, date, styleSourceRow, columnCount) {
  const row = sheet.getRow(rowNumber); copyRowStyle(styleSourceRow, row, columnCount); clearRowValues(row, columnCount);
  row.getCell(GC_COL.DATE).value = asDate(date); row.getCell(GC_COL.DATE).numFmt = 'd-mmm';
  row.getCell(GC_COL.DATE).font = { ...(row.getCell(GC_COL.DATE).font || {}), bold: true };
}

async function buildGcFromApprovedDb(args) {
  const payload = args?.payload || {};
  const processData = payload?.processes?.GC || {};
  const reports = Array.isArray(processData.reports) ? [...processData.reports] : [];
  reports.sort((a, b) => {
    const ad = String(a?.work_date || ''), bd = String(b?.work_date || '');
    if (ad !== bd) return ad.localeCompare(bd);
    return String(a?.approved_at || a?.created_at || '').localeCompare(String(b?.approved_at || b?.created_at || ''));
  });
  if (payload.dataSource !== 'tidb.production_reports.approved') throw new Error('GC Excel chỉ được xuất từ production_reports đã duyệt trong TiDB.');
  for (const report of reports) if (report?.dataSource !== 'production_reports' || report?.isApprovedDatabaseRecord !== true) throw new Error(`Báo cáo ${report?.id || '?'} không phải dữ liệu đã duyệt từ TiDB.`);

  const templatePath = path.join(args.appPath, 'assets', 'templates', TEMPLATE_NAME);
  const started = Date.now();
  log('BUILD_GC_DB_TEMPLATE_START', { date: args?.date, reportCount: reports.length, templatePath });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(templatePath);
  const sheet = findGcTemplateSheet(workbook);
  const originalSheetCount = workbook.worksheets.length;
  reduceWorkbookToSheet(workbook, sheet); sheet.state = 'visible';
  const formulaStats = stripBrokenSharedFormulaClones(workbook);
  const templateDataRow = sheet.getRow(7);
  const columnCount = Math.min(Math.max(sheet.columnCount, GC_COL.DEFECT_LAST), 80);
  if (sheet.rowCount > 7) sheet.spliceRows(8, sheet.rowCount - 7);
  clearRowValues(templateDataRow, columnCount);

  let rowNumber = 7, sequence = 0, currentDate = '';
  const dateRows = [], reportRows = [];
  for (const report of reports) {
    const workDate = String(report?.work_date || '').slice(0, 10);
    if (workDate !== currentDate) {
      currentDate = workDate; sequence = 0;
      if (rowNumber !== 7) sheet.insertRow(rowNumber, []);
      writeDateRow(sheet, rowNumber, workDate, templateDataRow, columnCount);
      dateRows.push(rowNumber); rowNumber += 1;
    }
    if (rowNumber > 8 || (rowNumber === 8 && dateRows.length > 0)) sheet.insertRow(rowNumber, []);
    const row = sheet.getRow(rowNumber); copyRowStyle(templateDataRow, row, columnCount); clearRowValues(row, columnCount);
    sequence += 1; writeGcReportRow(sheet, rowNumber, report, processData, sequence); reportRows.push(rowNumber); rowNumber += 1;
  }

  workbook.views = [{ activeTab: 0, firstSheet: 0, visibility: 'visible' }];
  workbook.calcProperties.fullCalcOnLoad = true;
  workbook.calcProperties.forceFullCalc = true;
  workbook.calcProperties.calcMode = 'auto';
  log('GC_DB_TEMPLATE_RENDERED', { reportRows: reportRows.length, dateRows: dateRows.length, lastRow: Math.max(7, rowNumber - 1), columns: columnCount, originalSheetCount });
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  log('GC_DB_TEMPLATE_DONE', { reportCount: reports.length, reportRows: reportRows.length, dateRows: dateRows.length, bytes: buffer.length, sharedFormulaConverted: formulaStats.converted, sharedFormulaCleared: formulaStats.cleared, elapsedMs: Date.now() - started });
  return {
    buffer,
    result: { code: 'GC', sheet: sheet.name, reportCount: reports.length, dateRows: dateRows.length },
    processCode: 'GC', processName: 'CẮT/LỒNG',
    fileName: `04_CAT_LONG_${String(args.date || '').slice(5, 7)}-${String(args.date || '').slice(0, 4)}.xlsx`,
    reportCount: reports.length, formulaReplacementCount: formulaStats.converted,
    templateKind: 'ONE_SHEET_GC_TEMPLATE_DAILY_BLOCKS'
  };
}

function patchMonthly(mod) {
  if (!mod || mod.__ktcV3MonthlyPatched) return mod;
  const original = mod.buildProcessWorkbookLocal;
  if (typeof original !== 'function') { log('PATCH_FAILED', { reason: 'buildProcessWorkbookLocal_missing' }); return mod; }
  mod.buildProcessWorkbookLocal = async (args = {}) => String(args?.processCode || '').trim().toUpperCase() === 'GC' ? buildGcFromApprovedDb(args) : original(args);
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
Module._load = function(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  if (typeof request === 'string' && /monthlyWorkbookLocal\.cjs$/.test(request)) return patchMonthly(loaded);
  return loaded;
};
log('EXCEL_EXPORT_V3_READY_GC_TEMPLATE_DB_DETAIL_MAP');
