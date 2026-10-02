'use strict';

const Module = require('node:module');
const ExcelJS = require('exceljs');
const path = require('node:path');

const originalLoad = Module._load;

const TEMPLATE_NAME = 'bao-cao-cat-long-export.xlsx';
const SHEET_NAME = 'Cắt lồng';

const GC_COL = Object.freeze({
  STT: 1,
  WORKER_CODE: 2,
  NAME: 3,
  MACHINE: 4,
  MOLD: 5,
  TRAINING: 6,
  WORKING_TIME: 7,
  ACTUAL_TIME: 8,
  CHANGEOVERS: 9,
  DEDUCTION_TOTAL: 10,
  DEDUCTION_FIRST: 11,
  DEDUCTION_LAST: 18,
  PRODUCT: 19,
  STANDARD: 20,
  OUTPUT: 21,
  ACHIEVEMENT: 22,
  DATE: 23,
  OUTPUT_PER_HOUR: 24,
  OK: 25,
  NG: 26,
  NG_RATE: 27,
  DEFECT_FIRST: 28,
  DEFECT_LAST: 54
});

const log = (event, data = {}) => {
  try {
    const m = process.memoryUsage();
    console.log('[KTC-EXCEL-TEMPLATE]', event, JSON.stringify({
      elapsedMs: Math.round(Number(process.hrtime.bigint()) / 1e6),
      rssMB: Math.round(m.rss / 1048576),
      heapMB: Math.round(m.heapUsed / 1048576),
      ...data
    }));
  } catch (_) {}
};

function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/Đ/g, 'D').replace(/đ/g, 'd')
    .replace(/[^a-zA-Z0-9]+/g, '')
    .toUpperCase();
}

function asNumber(value, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const n = Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : fallback;
}

function asText(value) {
  if (value === null || value === undefined) return '';
  return String(value);
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
  } catch (_) {
    return {};
  }
}

function findGcTemplateSheet(workbook) {
  const sheets = workbook.worksheets || [];
  const exact = sheets.find((s) => normalize(s.name) === normalize(SHEET_NAME));
  if (exact) return exact;
  const partial = sheets.find((s) => normalize(s.name).includes('CATLONG'));
  if (partial) return partial;
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
        if (!model) continue;
        if (model.sharedFormula) {
          const cached = model.result;
          cell.value = cached !== undefined && cached !== null ? cached : null;
          if (cell.model) delete cell.model.sharedFormula;
          converted += 1;
          if (cached === undefined || cached === null) cleared += 1;
        }
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
  for (const value of candidates) if (Array.isArray(value)) return value;
  return [];
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
    ? item?.deduction_type_code ?? item?.deduction_code ?? item?.type_code ?? item?.code
    : item?.defect_type_code ?? item?.defect_code ?? item?.type_code ?? item?.code);
}

function detailName(item, kind) {
  return asText(kind === 'deduction'
    ? item?.deduction_type_name ?? item?.deduction_name ?? item?.type_name ?? item?.display_name ?? item?.label ?? item?.name
    : item?.defect_type_name ?? item?.defect_name ?? item?.type_name ?? item?.display_name ?? item?.label ?? item?.name);
}

function detailValue(item, kind) {
  const keys = kind === 'deduction'
    ? ['hours', 'duration_hours', 'deduction_hours', 'time_hours', 'value', 'duration', 'amount', 'minutes']
    : ['quantity', 'qty', 'count', 'value', 'amount'];
  for (const key of keys) {
    if (item?.[key] === undefined || item?.[key] === null || item?.[key] === '') continue;
    const n = asNumber(item[key], NaN);
    if (!Number.isFinite(n)) continue;
    if (kind === 'deduction' && key === 'minutes') return n / 60;
    return n;
  }
  return 0;
}

function typeAliases(types, id) {
  const numericId = Number(id);
  const type = (Array.isArray(types) ? types : []).find((x) => Number(x?.id) === numericId);
  if (!type) return [];
  return [type.code, type.name, type.label, type.display_name]
    .filter(Boolean)
    .map(normalize);
}

function detailMatchesHeader(item, header, kind, types) {
  const wanted = normalize(header);
  if (!wanted) return false;
  const aliases = [detailCode(item, kind), detailName(item, kind), ...typeAliases(types, detailId(item, kind))]
    .filter(Boolean)
    .map(normalize);
  return aliases.some((alias) => alias === wanted || alias.includes(wanted) || wanted.includes(alias));
}

function detailForHeader(report, processData, header, kind) {
  let total = 0;
  for (const item of detailItems(report, kind)) {
    if (detailMatchesHeader(item, header, kind, kind === 'deduction' ? processData?.deductionTypes : processData?.defectTypes)) {
      total += detailValue(item, kind);
    }
  }
  return total;
}

function machineDisplay(report) {
  const lines = Array.isArray(report?.machineLines) ? report.machineLines : [];
  const values = lines.map((x) => asText(x?.machine_code || x?.machine_no || x?.machine_name)).filter(Boolean);
  return values.length ? [...new Set(values)].join(', ') : asText(report?.machine_no);
}

function productDisplay(report) {
  const lines = Array.isArray(report?.machineLines) ? report.machineLines : [];
  const values = lines.map((x) => asText(x?.product_code)).filter(Boolean);
  return values.length ? [...new Set(values)].join(', ') : asText(report?.product_name);
}

function moldDisplay(report) {
  const extra = parseExtraData(report);
  return asText(
    report?.mold_no ?? report?.mold_code ?? report?.mold_number ?? report?.tool_no ??
    extra.mold_no ?? extra.mold_code ?? extra.mold_number ?? extra.so_khuon
  );
}

function changeoverCount(report) {
  const extra = parseExtraData(report);
  return asNumber(
    report?.changeover_count ?? report?.change_machine_count ?? report?.so_lan_cm ??
    extra.changeover_count ?? extra.change_machine_count ?? extra.so_lan_cm,
    0
  );
}

function clearCell(cell) {
  try { cell.value = null; } catch (_) {}
}

function clearDataRows(sheet) {
  const last = sheet.rowCount;
  for (let r = 6; r <= last; r += 1) {
    const row = sheet.getRow(r);
    for (let c = 1; c <= Math.max(GC_COL.DEFECT_LAST, sheet.columnCount); c += 1) {
      const cell = row.getCell(c);
      if (cell.isMerged && !cell.master) continue;
      clearCell(cell);
    }
    row.hidden = false;
  }
}

function findHeader(sheet, column) {
  for (let r = 1; r <= 8; r += 1) {
    const value = sheet.getCell(r, column).value;
    if (value !== null && value !== undefined && String(value).trim() !== '') return String(value);
  }
  return '';
}

function clearUnreliableGcFields(sheet) {
  let cleared = 0;
  for (let c = 1; c <= sheet.columnCount; c += 1) {
    const header = normalize(findHeader(sheet, c));
    if (!header) continue;
    if (header === 'LOAITHAOTAC' || header === 'CHEDO') {
      for (let r = 6; r <= sheet.rowCount; r += 1) {
        const cell = sheet.getCell(r, c);
        if (cell.value !== null && cell.value !== undefined && cell.value !== '') {
          clearCell(cell);
          cleared += 1;
        }
      }
    }
  }
  return cleared;
}

function writeGcReportRow(sheet, rowNumber, report, processData, sequence) {
  const training = report?.training_percent === null || report?.training_percent === undefined
    ? 0
    : asNumber(report.training_percent, 0);
  const workingTime = asNumber(report?.total_time, 0);
  const actualTime = asNumber(report?.actual_time, workingTime);
  const deductionTime = asNumber(report?.deduction_time, 0);
  const standard = asNumber(report?.standard_output, 0);
  const output = asNumber(report?.actual_output, 0);
  const ok = asNumber(report?.tt_ok, 0);
  const ng = asNumber(report?.tt_ng ?? report?.total_ng ?? report?.ng_quantity, 0);

  const values = new Map([
    [GC_COL.STT, sequence],
    [GC_COL.WORKER_CODE, asText(report?.worker_code)],
    [GC_COL.NAME, asText(report?.full_name ?? report?.worker_name)],
    [GC_COL.MACHINE, machineDisplay(report)],
    [GC_COL.MOLD, moldDisplay(report)],
    [GC_COL.TRAINING, training],
    [GC_COL.WORKING_TIME, workingTime],
    [GC_COL.ACTUAL_TIME, actualTime],
    [GC_COL.CHANGEOVERS, changeoverCount(report)],
    [GC_COL.DEDUCTION_TOTAL, deductionTime],
    [GC_COL.PRODUCT, productDisplay(report)],
    [GC_COL.STANDARD, standard],
    [GC_COL.OUTPUT, output],
    [GC_COL.DATE, asDate(report?.work_date)],
    [GC_COL.OK, ok],
    [GC_COL.NG, ng]
  ]);

  for (const [column, value] of values) {
    const cell = sheet.getCell(rowNumber, column);
    cell.value = value;
    if (column === GC_COL.DATE) cell.numFmt = 'd-mmm';
  }

  // Chỉ dùng công thức cho các chỉ số tính toán. Dữ liệu nhập thực tế và dữ liệu DB
  // (OK/NG, thời gian, định mức, sản lượng, chi tiết trừ giờ/NG) không bị tính lại.
  sheet.getCell(rowNumber, GC_COL.ACHIEVEMENT).value = {
    formula: `IFERROR(U${rowNumber}/T${rowNumber},0)`
  };
  sheet.getCell(rowNumber, GC_COL.OUTPUT_PER_HOUR).value = {
    formula: `IFERROR(U${rowNumber}/H${rowNumber},0)`
  };
  sheet.getCell(rowNumber, GC_COL.NG_RATE).value = {
    formula: `IFERROR(Z${rowNumber}/(Y${rowNumber}+Z${rowNumber}),0)`
  };

  for (let c = GC_COL.DEDUCTION_FIRST; c <= GC_COL.DEDUCTION_LAST; c += 1) {
    const header = findHeader(sheet, c);
    sheet.getCell(rowNumber, c).value = detailForHeader(report, processData, header, 'deduction');
  }
  for (let c = GC_COL.DEFECT_FIRST; c <= GC_COL.DEFECT_LAST; c += 1) {
    const header = findHeader(sheet, c);
    sheet.getCell(rowNumber, c).value = detailForHeader(report, processData, header, 'defect');
  }
}

async function buildGcFromApprovedDb(args) {
  const payload = args?.payload || {};
  const processData = payload?.processes?.GC || {};
  const reports = Array.isArray(processData.reports) ? [...processData.reports] : [];
  reports.sort((a, b) => {
    const ad = String(a?.work_date || '');
    const bd = String(b?.work_date || '');
    if (ad !== bd) return ad.localeCompare(bd);
    return String(a?.approved_at || a?.created_at || '').localeCompare(String(b?.approved_at || b?.created_at || ''));
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
  log('BUILD_GC_DB_DIRECT_START', { date: args?.date, reportCount: reports.length, templatePath });

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(templatePath);
  const sheet = findGcTemplateSheet(workbook);
  const originalSheetCount = workbook.worksheets.length;
  reduceWorkbookToSheet(workbook, sheet);
  sheet.state = 'visible';

  const formulaStats = stripBrokenSharedFormulaClones(workbook);
  clearDataRows(sheet);

  // Template là giao diện. Không lấy giá trị nghiệp vụ từ các công thức/mẫu cũ.
  // Chỉ giữ style/merge/header của template và ghi dữ liệu approved DB vào các dòng.
  let dataRow = 7;
  let sequence = 0;
  let currentDate = '';
  let reportRows = 0;

  for (const report of reports) {
    const workDate = String(report?.work_date || '').slice(0, 10);
    if (workDate !== currentDate) {
      const dateRow = sheet.getRow(dataRow - 1);
      if (dataRow === 7 || dateRow.getCell(1).value !== null && dateRow.getCell(1).value !== undefined) {
        // Do not create a new synthetic row. The date is already stored in the
        // Ngày/Tháng column of each real report row.
      }
      currentDate = workDate;
      sequence = 0;
    }
    sequence += 1;
    writeGcReportRow(sheet, dataRow, report, processData, sequence);
    dataRow += 1;
    reportRows += 1;
  }

  for (let r = dataRow; r <= sheet.rowCount; r += 1) {
    const row = sheet.getRow(r);
    row.hidden = true;
    for (let c = 1; c <= Math.min(sheet.columnCount, GC_COL.DEFECT_LAST); c += 1) {
      const cell = row.getCell(c);
      if (cell.isMerged && !cell.master) continue;
      clearCell(cell);
    }
  }

  const unreliableCleared = clearUnreliableGcFields(sheet);
  if (sheet.autoFilter) {
    sheet.autoFilter = {
      from: { row: 5, column: 1 },
      to: { row: Math.max(5, dataRow - 1), column: Math.min(sheet.columnCount, GC_COL.DEFECT_LAST) }
    };
  }

  workbook.views = [{ activeTab: 0, firstSheet: 0, visibility: 'visible' }];
  workbook.calcProperties.fullCalcOnLoad = true;
  workbook.calcProperties.forceFullCalc = true;
  workbook.calcProperties.calcMode = 'auto';

  log('GC_DB_DIRECT_WRITE_START', {
    reportRows,
    lastDataRow: dataRow - 1,
    columns: sheet.columnCount,
    originalSheetCount,
    unreliableCleared
  });
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  log('GC_DB_DIRECT_DONE', {
    reportCount: reports.length,
    reportRows,
    bytes: buffer.length,
    sharedFormulaConverted: formulaStats.converted,
    sharedFormulaCleared: formulaStats.cleared,
    elapsedMs: Date.now() - started
  });

  return {
    buffer,
    result: { code: 'GC', sheet: sheet.name, reportCount: reports.length },
    processCode: 'GC',
    processName: 'CẮT/LỒNG',
    fileName: `04_CAT_LONG_${String(args.date || '').slice(5, 7)}-${String(args.date || '').slice(0, 4)}.xlsx`,
    reportCount: reports.length,
    formulaReplacementCount: formulaStats.converted,
    templateKind: 'ONE_SHEET_GC_TEMPLATE_DB_DIRECT'
  };
}

function patchMonthly(mod) {
  if (!mod || mod.__ktcV3MonthlyPatched) return mod;
  const original = mod.buildProcessWorkbookLocal;
  if (typeof original !== 'function') {
    log('PATCH_FAILED', { reason: 'buildProcessWorkbookLocal_missing' });
    return mod;
  }

  mod.buildProcessWorkbookLocal = async (args = {}) => {
    const processCode = String(args?.processCode || '').trim().toUpperCase();
    return processCode === 'GC' ? buildGcFromApprovedDb(args) : original(args);
  };

  mod.buildSplitMonthlyWorkbooksLocal = async (args = {}) => {
    const processes = [];
    for (const [code, data] of Object.entries(args?.payload?.processes || {})) {
      if (!Array.isArray(data?.reports) || !data.reports.length) continue;
      processes.push(await mod.buildProcessWorkbookLocal({ ...args, processCode: code }));
    }
    return { summary: null, processes };
  };

  Object.defineProperty(mod, '__ktcV3MonthlyPatched', { value: true });
  log('MONTHLY_PATCH_INSTALLED_V3_GC_DB_DIRECT');
  return mod;
}

Module._load = function(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  if (typeof request === 'string' && /monthlyWorkbookLocal\.cjs$/.test(request)) return patchMonthly(loaded);
  return loaded;
};

log('EXCEL_EXPORT_V3_READY_GC_DB_DIRECT');
