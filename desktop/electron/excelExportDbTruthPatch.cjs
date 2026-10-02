'use strict';

const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const ExcelJS = require('exceljs');
const monthly = require('./monthlyWorkbookLocal.cjs');

const norm = (value) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[đĐ]/g, 'd')
  .replace(/[^A-Za-z0-9]+/g, '')
  .toUpperCase();

const num = (value) => {
  const n = Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
};

const dateKey = (value) => {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const detailValue = (item, kind) => num(kind === 'deduction'
  ? item?.deduction_hours ?? item?.duration_hours ?? item?.time_hours ?? item?.hours ?? item?.value
  : item?.defect_quantity ?? item?.ng_quantity ?? item?.quantity ?? item?.qty ?? item?.value);

const detailCode = (item, kind) => String(kind === 'deduction'
  ? item?.deduction_type_code ?? item?.deduction_code ?? item?.type_code ?? item?.code
  : item?.defect_type_code ?? item?.defect_code ?? item?.type_code ?? item?.code ?? '').trim();

const detailName = (item, kind) => String(kind === 'deduction'
  ? item?.deduction_type_name ?? item?.deduction_name ?? item?.type_name ?? item?.display_name ?? item?.name
  : item?.defect_type_name ?? item?.defect_name ?? item?.type_name ?? item?.display_name ?? item?.name ?? '').trim();

const aliases = (item, kind) => [norm(detailCode(item, kind)), norm(detailName(item, kind))].filter(Boolean);

// Only translates identifiers/headers. Quantities always come from the DB detail rows.
const GC_HEADER_ALIASES = Object.freeze({
  CAT01: ['CAT01', 'Cao su khong dut', 'Cat khong dut'],
  CAT02: ['CAT02', 'Cat lem'],
  CAT03: ['CAT03', 'Cat pham'],
  CAT04: ['CAT04', 'Cao su ngan', 'Chan ngan dai'],
  CAT05: ['CAT05', 'Cao su dai', 'Chan ngan dai'],
  CAT06: ['CAT06', 'Bavia cao su', 'Bavia'],
  CAT07: ['CAT07', 'Phe pham chinh may', 'PPCM'],
  CAT08: ['CAT08', 'Loi cao su NCC', 'Loi cao su', 'LCS'],
  CAT09: ['CAT09', 'Lan cao su', 'Lan CS'],
  CAT10: ['CAT10', 'Khac'],
  LONG01: ['LONG01', 'Khong qua duong', 'KQD'],
  LONG02: ['LONG02', 'Cao su vo', 'Vo cao su'],
  LONG03: ['LONG03', 'Truc xuoc', 'Truc xước'],
  LONG04: ['LONG04', 'Truc gay cong', 'K xuoc cong gay'],
  LONG05: ['LONG05', 'Thieu cao su'],
  LONG06: ['LONG06', 'Lan truc'],
  LONG07: ['LONG07', 'Lan cao su', 'Lan CS'],
  LONG08: ['LONG08', 'Khac']
});

function reportList(payload) {
  return [...(payload?.processes?.GC?.reports || [])].sort((a, b) =>
    dateKey(a?.work_date).localeCompare(dateKey(b?.work_date)) ||
    String(a?.created_at ?? a?.approved_at ?? '').localeCompare(String(b?.created_at ?? b?.approved_at ?? '')) ||
    num(a?.id) - num(b?.id)
  );
}

function isGcSheet(sheet) {
  return sheet && /c[aă]t\s*l[oô]ng/i.test(String(sheet.name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
}

function findHeaderRow(sheet) {
  for (let r = 1; r <= Math.min(sheet.rowCount, 80); r += 1) {
    let hits = 0;
    for (let c = 1; c <= Math.min(sheet.columnCount, 120); c += 1) {
      const text = norm(sheet.getCell(r, c).value);
      if (text === 'MANV' || text === 'TENNV' || text === 'TONGNG' || text === 'ID') hits += 1;
    }
    if (hits >= 2) return r;
  }
  return 1;
}

function headerMap(sheet, headerRow) {
  const map = new Map();
  for (let c = 1; c <= sheet.columnCount; c += 1) {
    const text = norm(sheet.getCell(headerRow, c).value);
    if (text) map.set(text, c);
  }
  return map;
}

function findColumn(map, candidates) {
  for (const candidate of candidates || []) {
    const key = norm(candidate);
    if (map.has(key)) return map.get(key);
  }
  return null;
}

function detailColumn(map, item, kind) {
  const candidates = aliases(item, kind);
  for (const key of candidates) {
    if (map.has(key)) return map.get(key);
  }
  if (kind !== 'defect') return null;
  const code = detailCode(item, kind).toUpperCase();
  const names = GC_HEADER_ALIASES[code];
  return findColumn(map, names);
}

function rowKey(row, map) {
  const idCol = findColumn(map, ['ID']);
  const workerCol = findColumn(map, ['Mã NV', 'Worker Code', 'WorkerCode']);
  const dateCol = findColumn(map, ['Ngày', 'Ngày làm việc', 'Work Date']);
  const id = idCol ? num(row.getCell(idCol).value) : 0;
  if (id) return `id:${id}`;
  const worker = workerCol ? norm(row.getCell(workerCol).value) : '';
  const date = dateCol ? dateKey(row.getCell(dateCol).value) : '';
  return worker || date ? `wd:${worker}:${date}` : '';
}

function reportKey(report) {
  const id = num(report?.id);
  if (id) return `id:${id}`;
  return `wd:${norm(report?.worker_code)}:${dateKey(report?.work_date)}`;
}

async function patchGcWorkbook(buffer, payload) {
  if (!Buffer.isBuffer(buffer)) return buffer;
  const reports = reportList(payload);
  if (!reports.length) return buffer;

  const tmp = path.join(os.tmpdir(), `ktc-gc-db-truth-${process.pid}-${Date.now()}.xlsx`);
  fs.writeFileSync(tmp, buffer);
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(tmp);
    const sheet = wb.worksheets.find(isGcSheet) || wb.getWorksheet('Cắt lồng') || wb.getWorksheet('CẮT LỒNG') || wb.worksheets[0];
    if (!sheet) return buffer;

    const headerRow = findHeaderRow(sheet);
    const map = headerMap(sheet, headerRow);
    const reportRows = new Map();
    for (let r = headerRow + 1; r <= sheet.rowCount; r += 1) {
      const row = sheet.getRow(r);
      const key = rowKey(row, map);
      if (key && !reportRows.has(key)) reportRows.set(key, row);
    }

    let patchedReports = 0;
    let patchedDeductionCells = 0;
    let patchedDefectCells = 0;
    let deductionTotal = 0;
    let defectTotal = 0;

    for (const report of reports) {
      const row = reportRows.get(reportKey(report));
      if (!row) continue;

      const deductions = Array.isArray(report?.deductions) ? report.deductions : [];
      const defects = Array.isArray(report?.defects) ? report.defects : [];
      const touched = new Set();

      for (const item of deductions) {
        const value = detailValue(item, 'deduction');
        const col = detailColumn(map, item, 'deduction');
        if (!col || !value) continue;
        row.getCell(col).value = value;
        touched.add(`d:${col}`);
        deductionTotal += value;
      }
      for (const item of defects) {
        const value = Math.round(detailValue(item, 'defect'));
        const col = detailColumn(map, item, 'defect');
        if (!col || !value) continue;
        row.getCell(col).value = value;
        touched.add(`f:${col}`);
        defectTotal += value;
      }

      if (touched.size) {
        patchedReports += 1;
        for (const key of touched) key.startsWith('d:') ? patchedDeductionCells += 1 : patchedDefectCells += 1;
      }
    }

    console.log('[KTC-EXCEL-DB-TRUTH] GC_DETAIL_PATCH', JSON.stringify({
      reports: reports.length,
      matchedRows: patchedReports,
      patchedDeductionCells,
      patchedDefectCells,
      deductionDetailTotal: deductionTotal,
      defectDetailTotal: defectTotal,
      headerRow
    }));

    return Buffer.from(await wb.xlsx.writeBuffer());
  } finally {
    try { fs.unlinkSync(tmp); } catch (_) {}
  }
}

const originalProcess = monthly.buildProcessWorkbookLocal;
if (typeof originalProcess === 'function') {
  monthly.buildProcessWorkbookLocal = async (args) => {
    const result = await originalProcess(args);
    if (String(args?.processCode || '').toUpperCase() === 'GC' && result?.buffer) {
      result.buffer = await patchGcWorkbook(result.buffer, args?.payload || {});
    }
    return result;
  };
}

const originalSplit = monthly.buildSplitMonthlyWorkbooksLocal;
if (typeof originalSplit === 'function') {
  monthly.buildSplitMonthlyWorkbooksLocal = async (args) => {
    const result = await originalSplit(args);
    for (const item of result?.processes || []) {
      if (String(item?.processCode || '').toUpperCase() === 'GC' && item?.buffer) {
        item.buffer = await patchGcWorkbook(item.buffer, args?.payload || {});
      }
    }
    return result;
  };
}

module.exports = monthly;
