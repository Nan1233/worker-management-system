'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ExcelJS = require('exceljs');
const monthly = require('./monthlyWorkbookLocal.cjs');

// GC workbook contract. Totals are fixed; detail columns are assigned from
// the DB master lists (deductionTypes / defectTypes), not from template text
// and not from the old hard-coded code list.
const GC = Object.freeze({
  DEDUCTION_TOTAL: 10, // J
  DEDUCTION_FIRST: 11, // K
  DEDUCTION_LAST: 26, // Z (16 legacy/template slots)
  OK: 33,              // AG
  NG: 34,              // AH
  DEFECT_FIRST: 36,    // AJ
  DEFECT_LAST: 54      // BB (19 legacy/template slots)
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

function sortedTypes(processData, kind) {
  const list = kind === 'deduction' ? processData?.deductionTypes : processData?.defectTypes;
  return (Array.isArray(list) ? [...list] : []).sort((a, b) => {
    const ao = Number.isFinite(Number(a?.sort_order)) ? Number(a.sort_order) : Number.MAX_SAFE_INTEGER;
    const bo = Number.isFinite(Number(b?.sort_order)) ? Number(b.sort_order) : Number.MAX_SAFE_INTEGER;
    return ao - bo || Number(a?.id || 0) - Number(b?.id || 0);
  });
}

function typeKeys(type, kind) {
  if (!type) return [];
  return (kind === 'deduction'
    ? [type.id, type.code, type.deduction_code, type.name, type.deduction_name]
    : [type.id, type.code, type.defect_code, type.name, type.defect_name]
  ).filter((v) => v !== null && v !== undefined && String(v) !== '').map(norm);
}

function itemKeys(item, kind) {
  return (kind === 'deduction'
    ? [item?.deduction_type_id, item?.deduction_type_code, item?.deduction_code,
       item?.deduction_type_name, item?.deduction_name, item?.type_code,
       item?.type_name, item?.code, item?.name]
    : [item?.defect_type_id, item?.defect_type_code, item?.defect_code,
       item?.defect_type_name, item?.defect_name, item?.type_code,
       item?.type_name, item?.code, item?.name]
  ).filter((v) => v !== null && v !== undefined && String(v) !== '').map(norm);
}

function findType(processData, item, kind) {
  const list = sortedTypes(processData, kind);
  const id = kind === 'deduction' ? item?.deduction_type_id : item?.defect_type_id;
  if (id != null) {
    const byId = list.find((x) => Number(x?.id) === Number(id));
    if (byId) return byId;
  }
  const keys = itemKeys(item, kind);
  return list.find((type) => {
    const keysForType = typeKeys(type, kind);
    return keys.some((key) => keysForType.includes(key));
  }) || null;
}

function buildDetailColumnMap(processData, kind, firstColumn) {
  const types = sortedTypes(processData, kind);
  const map = new Map();
  types.forEach((type, index) => {
    const column = firstColumn + index;
    for (const key of typeKeys(type, kind)) map.set(key, column);
  });
  return { types, map };
}

function resolveColumn(processData, item, kind, detailMap) {
  const type = findType(processData, item, kind);
  if (!type) return null;
  for (const key of typeKeys(type, kind)) {
    const column = detailMap.map.get(key);
    if (column) return column;
  }
  return null;
}

function isReportRow(row) {
  const stt = row?.getCell(1)?.value;
  const worker = row?.getCell(2)?.value;
  return typeof stt === 'number' && Number.isFinite(stt)
    && worker !== null && worker !== undefined && String(worker) !== '';
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

function copyColumnStyle(sheet, sourceColumn, targetColumn) {
  const source = sheet.getColumn(sourceColumn);
  const target = sheet.getColumn(targetColumn);
  if (source.width != null) target.width = source.width;
  for (let r = 1; r <= sheet.rowCount; r += 1) {
    copyCellStyle(sheet.getCell(r, sourceColumn), sheet.getCell(r, targetColumn));
  }
}

function ensureDetailColumns(sheet, requiredCount, firstColumn, legacyLastColumn) {
  const legacyCount = legacyLastColumn - firstColumn + 1;
  const extra = Math.max(0, requiredCount - legacyCount);
  if (!extra) return;

  const insertAt = legacyLastColumn + 1;
  const sourceColumn = legacyLastColumn;
  for (let i = 0; i < extra; i += 1) {
    sheet.spliceColumns(insertAt, 0, [[]]);
    copyColumnStyle(sheet, sourceColumn, insertAt);
  }
}

function expandReportRows(sheet, requiredCount, existingRows) {
  if (requiredCount <= existingRows.length) return existingRows;
  const source = existingRows[existingRows.length - 1];
  if (!source) throw new Error('GC template không có dòng report mẫu để chèn thêm.');
  const result = [...existingRows];
  const columnCount = Math.max(sheet.columnCount, GC.DEFECT_LAST);
  for (let i = existingRows.length; i < requiredCount; i += 1) {
    const target = sheet.getRow(source.number + (i - existingRows.length + 1));
    target.height = source.height;
    for (let c = 1; c <= columnCount; c += 1) copyCellStyle(source.getCell(c), target.getCell(c));
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
    const sheet = wb.getWorksheet('Cắt lồng') || wb.getWorksheet('CẮT LỒNG') || wb.worksheets[0];
    if (!sheet) return input;

    const processData = payload?.processes?.GC || {};
    const reports = reportsFromPayload(payload);
    const deductionMap = buildDetailColumnMap(processData, 'deduction', GC.DEDUCTION_FIRST);
    const defectMap = buildDetailColumnMap(processData, 'defect', GC.DEFECT_FIRST);

    // DB master controls the number/order of detail columns. If a future DB
    // master has more types than the old template, add columns instead of
    // dropping data. For the current GC master this is 10 + 19.
    ensureDetailColumns(sheet, deductionMap.types.length, GC.DEDUCTION_FIRST, GC.DEDUCTION_LAST);
    ensureDetailColumns(sheet, defectMap.types.length, GC.DEFECT_FIRST, GC.DEFECT_LAST);

    let rows = [...(sheet._rows || [])].filter(isReportRow).sort((a, b) => a.number - b.number);
    rows = expandReportRows(sheet, reports.length, rows);

    const totals = {
      deduction: 0,
      ng: 0,
      detailDeduction: 0,
      detailNg: 0,
      unmatchedDeduction: 0,
      unmatchedDefect: 0,
      matchedDeductionItems: 0,
      matchedDefectItems: 0
    };

    for (let i = 0; i < reports.length; i += 1) {
      const report = reports[i];
      const row = rows[i];
      const deductions = Array.isArray(report?.deductions) ? report.deductions : [];
      const defects = Array.isArray(report?.defects) ? report.defects : [];

      // Clear only the actual DB-detail slots. Do not rely on the template's
      // header names or formulas to populate these cells.
      for (let c = GC.DEDUCTION_FIRST; c < GC.DEDUCTION_FIRST + deductionMap.types.length; c += 1) row.getCell(c).value = 0;
      for (let c = GC.DEFECT_FIRST; c < GC.DEFECT_FIRST + defectMap.types.length; c += 1) row.getCell(c).value = 0;

      for (const item of deductions) {
        const value = detailValue(item, 'deduction');
        const column = resolveColumn(processData, item, 'deduction', deductionMap);
        if (!column) {
          if (value) totals.unmatchedDeduction += value;
          continue;
        }
        row.getCell(column).value = num(row.getCell(column).value) + value;
        totals.detailDeduction += value;
        totals.matchedDeductionItems += 1;
      }

      for (const item of defects) {
        const value = detailValue(item, 'defect');
        const column = resolveColumn(processData, item, 'defect', defectMap);
        if (!column) {
          if (value) totals.unmatchedDefect += value;
          continue;
        }
        row.getCell(column).value = num(row.getCell(column).value) + value;
        totals.detailNg += value;
        totals.matchedDefectItems += 1;
      }

      row.getCell(GC.DEDUCTION_TOTAL).value = num(report?.deduction_time);
      row.getCell(GC.NG).value = num(report?.tt_ng);
      totals.deduction += num(report?.deduction_time);
      totals.ng += num(report?.tt_ng);
    }

    const totalRow = [...(sheet._rows || [])].find((row) => {
      const text = String(row?.getCell(1)?.value ?? '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
      return text.includes('TONG') && text.includes('CONG');
    });

    if (totalRow) {
      totalRow.getCell(GC.DEDUCTION_TOTAL).value = totals.deduction;
      totalRow.getCell(GC.NG).value = totals.ng;
      for (let c = GC.DEDUCTION_FIRST; c < GC.DEDUCTION_FIRST + deductionMap.types.length; c += 1) {
        totalRow.getCell(c).value = rows.slice(0, reports.length).reduce((sum, row) => sum + num(row.getCell(c).value), 0);
      }
      for (let c = GC.DEFECT_FIRST; c < GC.DEFECT_FIRST + defectMap.types.length; c += 1) {
        totalRow.getCell(c).value = rows.slice(0, reports.length).reduce((sum, row) => sum + num(row.getCell(c).value), 0);
      }
    }

    console.log('[KTC-EXCEL-TEMPLATE] GC_DB_DIRECT_DETAIL_MAPPING', JSON.stringify({
      reports: reports.length,
      deductionTypes: deductionMap.types.length,
      defectTypes: defectMap.types.length,
      matchedDeductionItems: totals.matchedDeductionItems,
      matchedDefectItems: totals.matchedDefectItems,
      unmatchedDeductionValue: totals.unmatchedDeduction,
      unmatchedDefectValue: totals.unmatchedDefect,
      deductionTotalFromDb: totals.deduction,
      detailDeductionFromDb: totals.detailDeduction,
      ngTotalFromDb: totals.ng,
      detailNgFromDb: totals.detailNg,
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
