'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ExcelJS = require('exceljs');
const monthly = require('./monthlyWorkbookLocal.cjs');

// GC column contract. These columns are the DB contract and must NOT be
// discovered from template header text.
const GC = Object.freeze({
  DEDUCTION_TOTAL: 10, // J
  DEDUCTION_FIRST: 11, // K
  DEDUCTION_LAST: 26, // Z
  OK: 33,              // AG
  NG: 34,              // AH
  DEFECT_FIRST: 36,    // AJ
  DEFECT_LAST: 54      // BB
});

const DEDUCTION_COLUMNS = Object.freeze({
  THIEU_SP: 11,
  BAT_MAY: 12,
  CHUYEN_MA: 13,
  CHINH_MAY: 14,
  CHO_CHINH_MAY: 15,
  MAT_DIEN: 16,
  MAT_KHI: 17,
  CHO_HANG: 18,
  BAO_DUONG: 19,
  NGHI_GIAI_LAO: 20,
  GIAO_CA: 21,
  HO_TRO: 22,
  GIAT_CAN_TUOT: 23,
  '5S': 24,
  HOC_VIEC: 25,
  DI_MUON_VE_SOM: 26
});

const DEFECT_COLUMNS = Object.freeze({
  KQD: 36,
  VO_CAO_SU: 37,
  K_XUOC_CONG_GAY: 38,
  CAO_SU_XOAY: 39,
  CAT_KHONG_DUT: 40,
  BAVIA: 41,
  CSH: 42,
  PPCM: 43,
  KT_LON: 44,
  KT_NHO: 45,
  LCS: 46,
  CAT_LEM: 47,
  RACH_NVL: 48,
  CHAN_NGAN_DAI: 49,
  SOT_VIA: 50,
  FURE_TRUC: 51,
  LAN_CS: 52,
  BAVIA_CAT_HUT: 53,
  THIEU_CAO_SU: 54
});

const norm = (value) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[đĐ]/g, 'd')
  .replace(/[^A-Za-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '')
  .toUpperCase();

const num = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const n = Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
};

function detailValue(item, kind) {
  const value = kind === 'deduction'
    ? (item?.hours ?? item?.deduction_hours ?? item?.duration_hours ?? item?.time_hours ?? item?.value)
    : (item?.quantity ?? item?.defect_quantity ?? item?.ng_quantity ?? item?.qty ?? item?.count ?? item?.value);
  return num(value);
}

function itemKeys(item, type, kind) {
  const values = kind === 'deduction'
    ? [
        item?.deduction_type_id,
        item?.deduction_type_code,
        item?.deduction_code,
        item?.deduction_type_name,
        item?.deduction_name,
        item?.type_code,
        item?.type_name,
        item?.code,
        item?.name,
        type?.id,
        type?.code,
        type?.deduction_code,
        type?.name,
        type?.deduction_name
      ]
    : [
        item?.defect_type_id,
        item?.defect_type_code,
        item?.defect_code,
        item?.defect_type_name,
        item?.defect_name,
        item?.type_code,
        item?.type_name,
        item?.code,
        item?.name,
        type?.id,
        type?.code,
        type?.defect_code,
        type?.name,
        type?.defect_name
      ];
  return values.filter((v) => v !== null && v !== undefined && String(v) !== '').map(norm);
}

function findType(processData, item, kind) {
  const id = kind === 'deduction'
    ? item?.deduction_type_id
    : item?.defect_type_id;
  if (id == null) return null;
  const list = kind === 'deduction' ? processData?.deductionTypes : processData?.defectTypes;
  return (Array.isArray(list) ? list : []).find((x) => Number(x?.id) === Number(id)) || null;
}

function resolveColumn(processData, item, kind) {
  const type = findType(processData, item, kind);
  const keys = itemKeys(item, type, kind);
  const map = kind === 'deduction' ? DEDUCTION_COLUMNS : DEFECT_COLUMNS;

  // Prefer the DB code. Numeric IDs are intentionally not used as column
  // positions because IDs are database identifiers, not Excel positions.
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(map, key)) return map[key];
  }

  // Stable aliases for legacy DB names. Still independent of Excel headers.
  const aliases = kind === 'deduction'
    ? {
        THIEU_SAN_LUONG: 'THIEU_SP',
        THIEU_SAN_PHAM: 'THIEU_SP',
        BAT_MAY_XET_MAY: 'BAT_MAY',
        CHUYEN_MA_HANG: 'CHUYEN_MA',
        CHO_CHINH: 'CHO_CHINH_MAY',
        BAO_DUONG_MAY: 'BAO_DUONG',
        NGHI_GIAI_LAO: 'NGHI_GIAI_LAO',
        DUNG_MAY_DI_HO_TRO: 'HO_TRO',
        HOC_VIEC_DAO_TAO: 'HOC_VIEC',
        DI_MUON_VE_SOM: 'DI_MUON_VE_SOM'
      }
    : {
        VO_CAO_SU: 'VO_CAO_SU',
        K_XUOC_CONG_GAY: 'K_XUOC_CONG_GAY',
        CAO_SU_XOAY: 'CAO_SU_XOAY',
        CAT_KHONG_DUT: 'CAT_KHONG_DUT',
        BAVIA_HUT: 'BAVIA',
        LOI_CAO_SU: 'LCS',
        NG_KICH_THUOC_LON: 'KT_LON',
        NG_KICH_THUOC_NHO: 'KT_NHO',
        CAT_LEM: 'CAT_LEM',
        BAVIA_CAT_HUT: 'BAVIA_CAT_HUT',
        THIEU_CAO_SU: 'THIEU_CAO_SU'
      };

  for (const key of keys) {
    const alias = aliases[key];
    if (alias && map[alias]) return map[alias];
  }
  return null;
}

function isReportRow(row) {
  const stt = row?.getCell(1)?.value;
  const worker = row?.getCell(2)?.value;
  return typeof stt === 'number' && Number.isFinite(stt) && worker !== null && worker !== undefined && String(worker) !== '';
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

function copyRowStyle(source, target, columnCount) {
  target.height = source.height;
  for (let c = 1; c <= columnCount; c += 1) copyCellStyle(source.getCell(c), target.getCell(c));
}

function expandReportRows(sheet, requiredCount, existingRows) {
  if (requiredCount <= existingRows.length) return existingRows;
  const source = existingRows[existingRows.length - 1];
  if (!source) throw new Error('GC template không có dòng report mẫu để chèn thêm.');
  const result = [...existingRows];
  const columnCount = Math.max(sheet.columnCount, GC.DEFECT_LAST);
  for (let i = existingRows.length; i < requiredCount; i += 1) {
    const rowNumber = source.number + (i - existingRows.length + 1);
    const target = sheet.getRow(rowNumber);
    copyRowStyle(source, target, columnCount);
    result.push(target);
  }
  return result;
}

function reportsFromPayload(payload) {
  const list = Array.isArray(payload?.processes?.GC?.reports) ? [...payload.processes.GC.reports] : [];
  return list.sort((a, b) => String(a?.work_date || '').localeCompare(String(b?.work_date || ''))
    || String(a?.approved_at || a?.created_at || '').localeCompare(String(b?.approved_at || b?.created_at || ''))
    || Number(a?.id || 0) - Number(b?.id || 0));
}

async function patch(buffer, payload) {
  const input = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const tmp = path.join(os.tmpdir(), `ktc-gc-${process.pid}-${Date.now()}.xlsx`);
  fs.writeFileSync(tmp, input);
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(tmp);
    const sheet = wb.getWorksheet('Cắt lồng') || wb.worksheets[0];
    if (!sheet) return input;

    const reports = reportsFromPayload(payload);
    let rows = [...(sheet._rows || [])].filter(isReportRow).sort((a, b) => a.number - b.number);
    rows = expandReportRows(sheet, reports.length, rows);

    const totals = {
      deduction: 0,
      ng: 0,
      detailDeduction: 0,
      detailNg: 0,
      patched: 0,
      unmatchedDeduction: 0,
      unmatchedDefect: 0
    };

    for (let i = 0; i < reports.length; i += 1) {
      const report = reports[i];
      const row = rows[i];
      const processData = payload?.processes?.GC || {};
      const deductions = Array.isArray(report?.deductions) ? report.deductions : [];
      const defects = Array.isArray(report?.defects) ? report.defects : [];

      // Clear only the DB-detail region; keep template formulas/style elsewhere.
      for (let c = GC.DEDUCTION_FIRST; c <= GC.DEDUCTION_LAST; c += 1) row.getCell(c).value = 0;
      for (let c = GC.DEFECT_FIRST; c <= GC.DEFECT_LAST; c += 1) row.getCell(c).value = 0;

      for (const item of deductions) {
        const column = resolveColumn(processData, item, 'deduction');
        const value = detailValue(item, 'deduction');
        if (!column) {
          if (value) totals.unmatchedDeduction += value;
          continue;
        }
        row.getCell(column).value = num(row.getCell(column).value) + value;
        totals.detailDeduction += value;
      }

      for (const item of defects) {
        const column = resolveColumn(processData, item, 'defect');
        const value = detailValue(item, 'defect');
        if (!column) {
          if (value) totals.unmatchedDefect += value;
          continue;
        }
        row.getCell(column).value = num(row.getCell(column).value) + value;
        totals.detailNg += value;
      }

      // Totals are authoritative DB columns, not recalculated from template headers.
      const deductionTotal = num(report?.deduction_time);
      const ngTotal = num(report?.tt_ng);
      row.getCell(GC.DEDUCTION_TOTAL).value = deductionTotal;
      row.getCell(GC.NG).value = ngTotal;
      totals.deduction += deductionTotal;
      totals.ng += ngTotal;
      totals.patched += 1;
    }

    // Rebuild the visible total row from the DB-rendered rows.
    const totalRow = [...(sheet._rows || [])].find((row) => {
      const text = String(row?.getCell(1)?.value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
      return text.includes('TONG') && text.includes('CONG');
    });
    if (totalRow) {
      totalRow.getCell(GC.DEDUCTION_TOTAL).value = totals.deduction;
      totalRow.getCell(GC.NG).value = totals.ng;
      for (let c = GC.DEDUCTION_FIRST; c <= GC.DEDUCTION_LAST; c += 1) {
        totalRow.getCell(c).value = rows.slice(0, reports.length).reduce((sum, row) => sum + num(row.getCell(c).value), 0);
      }
      for (let c = GC.DEFECT_FIRST; c <= GC.DEFECT_LAST; c += 1) {
        totalRow.getCell(c).value = rows.slice(0, reports.length).reduce((sum, row) => sum + num(row.getCell(c).value), 0);
      }
    }

    console.log('[KTC-EXCEL-TEMPLATE] GC_DB_DIRECT_DETAIL_MAPPING', JSON.stringify({
      reports: reports.length,
      reportRows: rows.length,
      patched: totals.patched,
      deductionTotalFromDb: totals.deduction,
      ngTotalFromDb: totals.ng,
      detailDeductionFromDb: totals.detailDeduction,
      detailNgFromDb: totals.detailNg,
      unmatchedDeduction: totals.unmatchedDeduction,
      unmatchedDefect: totals.unmatchedDefect,
      totalRow: Boolean(totalRow)
    }));

    return Buffer.from(await wb.xlsx.writeBuffer());
  } finally {
    try { fs.unlinkSync(tmp); } catch (_) {}
  }
}

const originalBuildProcess = monthly.buildProcessWorkbookLocal;
const originalBuildSplit = monthly.buildSplitMonthlyWorkbooksLocal;

if (typeof originalBuildProcess === 'function') {
  monthly.buildProcessWorkbookLocal = async (args) => {
    const result = await originalBuildProcess(args);
    if (String(args?.processCode || '').toUpperCase() === 'GC' && result?.buffer) {
      result.buffer = await patch(result.buffer, args?.payload || {});
    }
    return result;
  };
}

if (typeof originalBuildSplit === 'function') {
  monthly.buildSplitMonthlyWorkbooksLocal = async (args) => {
    const result = await originalBuildSplit(args);
    for (const item of result?.processes || []) {
      if (String(item?.processCode || '').toUpperCase() === 'GC' && item?.buffer) {
        item.buffer = await patch(item.buffer, args?.payload || {});
      }
    }
    return result;
  };
}

module.exports = monthly;
