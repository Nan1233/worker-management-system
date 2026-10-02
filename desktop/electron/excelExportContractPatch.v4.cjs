'use strict';

// v3 is the canonical GC exporter. It patches/loads the real workbook template.
// This v4 wrapper works on the actual monthlyWorkbookLocal exports so it remains
// effective even though v3 itself does not expose build* functions.
const ExcelJS = require('exceljs');
require('./excelExportContractPatch.v3.cjs');
const monthly = require('./monthlyWorkbookLocal.cjs');

function asDbNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const n = Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

function normalizeCode(value) {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function sortedGcReports(payload) {
  const reports = Array.isArray(payload?.processes?.GC?.reports)
    ? [...payload.processes.GC.reports]
    : [];
  reports.sort((a, b) => {
    const ad = String(a?.work_date || '');
    const bd = String(b?.work_date || '');
    if (ad !== bd) return ad.localeCompare(bd);
    return String(a?.approved_at || a?.created_at || '').localeCompare(
      String(b?.approved_at || b?.created_at || '')
    );
  });
  return reports;
}

function reportDetails(report, kind) {
  const direct = kind === 'deduction' ? report?.deductions : report?.defects;
  if (Array.isArray(direct)) return direct;

  const extra = report?.extra_data;
  let parsed = extra;
  if (typeof extra === 'string') {
    try { parsed = JSON.parse(extra); } catch (_) { parsed = {}; }
  }
  if (!parsed || typeof parsed !== 'object') return [];

  const candidates = kind === 'deduction'
    ? [parsed.deductions, parsed.deductionDetails, parsed.timeDeductions]
    : [parsed.defects, parsed.defectDetails, parsed.ngDetails];

  return candidates.find(Array.isArray) || [];
}

function detailCode(item, kind) {
  return normalizeCode(
    kind === 'deduction'
      ? item?.deduction_code ?? item?.deduction_type_code ?? item?.code
      : item?.defect_code ?? item?.defect_type_code ?? item?.code
  );
}

function detailValue(item, kind) {
  const keys = kind === 'deduction'
    ? ['hours', 'deduction_hours', 'duration_hours', 'time_hours', 'value']
    : ['quantity', 'defect_quantity', 'ng_quantity', 'qty', 'count', 'value'];

  for (const key of keys) {
    if (item?.[key] == null || item[key] === '') continue;
    const n = asDbNumber(item[key]);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

/*
 * These are the actual columns of the supplied GC template.
 * Mapping is deliberately by DB code, not by display name.
 *
 * K:Z = deduction detail
 * AJ:BB = defect/NG detail
 *
 * Some legacy DB types are retained as aliases because old approved reports
 * can still reference inactive type IDs/codes.
 */
const GC_DEDUCTION_CODE_MAP = Object.freeze([
  ['THIEU_SAN_LUONG'],
  ['BAT_MAY_XET_MAY_AU_GIO'],
  ['CHUYEN_MA'],
  ['CHINH_MAY'],
  ['CHO_CHINH_MAY'],
  ['MAT_IEN'],
  ['MAT_KHI'],
  ['CHO_HANG_HET_HANG'],
  ['BAO_DUONG'],
  ['NGHI_GIAI_LAO'],
  ['GIAO_CA'],
  ['DUNG_MAY_HO_TRO'],
  ['GIAT_CS_CAN_CS_TUOT_TAI_PP_GL'],
  ['5S', '5S_O_BUI_XI_BUI_LAY_BUI'],
  ['HOC_VIEC_DAO_TAO', 'HOC_VIEC'],
  ['DI_MUON_VE_SOM']
]);

const GC_DEFECT_CODE_MAP = Object.freeze([
  ['KQD'],
  ['VO_CAO_SU', 'LONG02'],
  ['XUOC_DO_LONG', 'CONG_GAY', 'LONG03', 'LONG04'],
  ['XOAY'],
  ['CAT_KHONG_UT', 'CAT01'],
  ['BAVIA', 'BAVIA_HUT'],
  ['CSH'],
  ['PPCM'],
  ['KICH_THUOC_LON'],
  ['KICH_THUOC_NHO'],
  ['LCS'],
  ['CAT_LEM', 'CAT02'],
  ['RACH_NGUYEN_VAT_LIEU'],
  ['CHAN_KHONG'],
  ['SOT_VIA'],
  ['FURE_TRUC'],
  ['CAT09', 'LONG07', 'LAN_CS'],
  ['BAVIA_HUT'],
  ['LONG05', 'THIEU_CAO_SU']
]);

function buildCodeTotals(items, kind) {
  const totals = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const code = detailCode(item, kind);
    if (!code) continue;
    totals.set(code, (totals.get(code) || 0) + detailValue(item, kind));
  }
  return totals;
}

function valueForCodes(totals, codes) {
  return codes.reduce((sum, code) => sum + (totals.get(normalizeCode(code)) || 0), 0);
}

function dataRows(sheet) {
  const rows = [];
  for (const row of sheet._rows || []) {
    const stt = row?.getCell?.(1)?.value;
    const worker = row?.getCell?.(2)?.value;
    if (typeof stt === 'number' && Number.isFinite(stt) && worker != null && String(worker) !== '') {
      rows.push(row);
    }
  }
  rows.sort((a, b) => a.number - b.number);
  return rows;
}

function patchGcDetailColumns(sheet, reports) {
  const rows = dataRows(sheet);
  const count = Math.min(rows.length, reports.length);
  let deductionCellsPatched = 0;
  let defectCellsPatched = 0;

  for (let i = 0; i < count; i += 1) {
    const row = rows[i];
    const report = reports[i];

    const deductionTotals = buildCodeTotals(reportDetails(report, 'deduction'), 'deduction');
    const defectTotals = buildCodeTotals(reportDetails(report, 'defect'), 'defect');

    for (let j = 0; j < GC_DEDUCTION_CODE_MAP.length; j += 1) {
      row.getCell(11 + j).value = valueForCodes(deductionTotals, GC_DEDUCTION_CODE_MAP[j]);
      deductionCellsPatched += 1;
    }

    for (let j = 0; j < GC_DEFECT_CODE_MAP.length; j += 1) {
      row.getCell(37 + j).value = valueForCodes(defectTotals, GC_DEFECT_CODE_MAP[j]);
      defectCellsPatched += 1;
    }

    // The template's total columns must be authoritative DB values.
    row.getCell(9).value = asDbNumber(report?.deduction_time);
    row.getCell(34).value = asDbNumber(report?.tt_ng);
  }

  console.log('[KTC-EXCEL-TEMPLATE] DB_DETAIL_PATCHED', JSON.stringify({
    reports: reports.length,
    worksheetRows: rows.length,
    patchedReports: count,
    deductionCellsPatched,
    defectCellsPatched
  }));
}

async function patchGcWorkbook(buffer, payload) {
  if (!buffer) return buffer;

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const reports = sortedGcReports(payload);
  if (!reports.length) return buffer;

  const sheet = workbook.getWorksheet('Cắt lồng') || workbook.worksheets[0];
  if (!sheet) return buffer;

  patchGcDetailColumns(sheet, reports);

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function writeDbAuthoritativeTotals(buffer, payload) {
  return patchGcWorkbook(buffer, payload);
}

async function wrapResult(result, args) {
  if (!result?.buffer) return result;
  if (String(args?.processCode || '').toUpperCase() !== 'GC') return result;
  result.buffer = await writeDbAuthoritativeTotals(result.buffer, args?.payload || {});
  return result;
}

if (typeof monthly.buildProcessWorkbookLocal === 'function') {
  const original = monthly.buildProcessWorkbookLocal;
  monthly.buildProcessWorkbookLocal = async (args = {}) => {
    const result = await original(args);
    return wrapResult(result, args);
  };
}

if (typeof monthly.buildSplitMonthlyWorkbooksLocal === 'function') {
  const original = monthly.buildSplitMonthlyWorkbooksLocal;
  monthly.buildSplitMonthlyWorkbooksLocal = async (args = {}) => {
    const result = await original(args);
    if (result?.processes) {
      for (const item of result.processes) {
        if (String(item?.processCode || '').toUpperCase() !== 'GC' || !item?.buffer) continue;
        item.buffer = await writeDbAuthoritativeTotals(item.buffer, args?.payload || {});
      }
    }
    return result;
  };
}

module.exports = monthly;
