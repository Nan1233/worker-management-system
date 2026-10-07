'use strict';

// Shared, header-driven column mapping for the company Excel exports.
//
// The company workbooks are the source of truth for which column holds which
// deduction type / defect. Writing by array position (the old behaviour) breaks
// as soon as the set or order of active DB types differs from the template, and
// silently puts values under the wrong header. This module resolves every DB
// type to a template column by its header label instead, and reports anything
// it cannot place rather than guessing.

const { normalizeLabel } = require('./excelTemplateContractService');
const { LAYOUT_EXPECTED_LABELS, DEFECT_NAME_ALIASES } = require('../config/excelColumnContracts');

// Summary / helper headers that sit in the same row as detail columns but are
// not input columns (e.g. the OK / NG / % blocks to the right of Đo defects).
const RESERVED_LABELS = new Set(['ok', 'ng', '%', 'tg', 'tong ng', 'tong pp', 'tong loi']);
const MIN_PREFIX_MATCH_LENGTH = 8;

const cellText = (cell) => {
  const value = cell?.value;
  if (value == null) return '';
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text).join('');
    if (value.result != null) return String(value.result);
    return '';
  }
  return String(value);
};

// "CAT02 - Cắt không đứt" -> "Cắt không đứt": DB master rows carry a code prefix
// that the company sheets never print.
const stripCodePrefix = (name) => String(name ?? '').replace(/^\s*[A-Za-z]+\s*\d+\s*[-–:]\s*/, '');
const keyOf = (name) => normalizeLabel(stripCodePrefix(name));

/**
 * Read the labelled input columns of one range from the template header row.
 * Blank labels are filled from the contract (the company sample) when the
 * template copy lost them, and reserved summary labels are skipped.
 */
function readRangeColumns(sheet, labelRow, range, kind, layoutCode) {
  const [start, end] = range;
  const expected = LAYOUT_EXPECTED_LABELS[layoutCode]?.[kind];
  const columns = [];
  for (let column = start; column <= end; column += 1) {
    let label = cellText(sheet.getRow(labelRow).getCell(column)).trim();
    let filledFromContract = false;
    if (!label && expected && expected.start <= column) {
      label = expected.labels[column - expected.start] || '';
      filledFromContract = Boolean(label);
    }
    const key = normalizeLabel(label);
    if (!key || RESERVED_LABELS.has(key)) continue;
    columns.push({ column, label, key, filledFromContract });
  }
  return columns;
}

function createColumnResolver(columns, aliases = {}) {
  const byKey = new Map();
  for (const entry of columns) if (!byKey.has(entry.key)) byKey.set(entry.key, entry.column);
  const aliasByKey = new Map(Object.entries(aliases).map(([from, to]) => [normalizeLabel(from), normalizeLabel(to)]));

  const lookup = (key) => {
    if (!key) return null;
    if (byKey.has(key)) return byKey.get(key);
    // Headers are sometimes shortened or lengthened relative to the master name
    // ("Bẩn NCC" vs "Bẩn NCC, THIẾU LIỆU"). Accept a prefix match only when it
    // is long enough and unambiguous.
    const hits = [...byKey.entries()].filter(([header]) => {
      const shorter = header.length < key.length ? header : key;
      return shorter.length >= MIN_PREFIX_MATCH_LENGTH && (header.startsWith(key) || key.startsWith(header));
    });
    return hits.length === 1 ? hits[0][1] : null;
  };

  return (item) => {
    const name = item?.deduction_name ?? item?.defect_name ?? item?.name ?? '';
    const key = keyOf(name);
    const direct = lookup(key);
    if (direct) return direct;
    const aliased = aliasByKey.get(key);
    return aliased ? lookup(aliased) : null;
  };
}

/** Sum report detail rows into { column -> value }, collecting what could not be placed. */
function sumByColumn(items, resolver, valueKey) {
  const totals = new Map();
  const unmapped = [];
  for (const item of Array.isArray(items) ? items : []) {
    const value = Number(String(item?.[valueKey] ?? 0).replace(/,/g, ''));
    if (!Number.isFinite(value) || value === 0) continue;
    const column = resolver(item);
    if (!column) { unmapped.push(item); continue; }
    totals.set(column, (totals.get(column) || 0) + value);
  }
  return { totals, unmapped };
}

function buildLayoutResolvers(sheet, layout, layoutCode) {
  const deductionColumns = readRangeColumns(sheet, layout.labelRow, layout.deductions, 'deductions', layoutCode);
  const defectColumns = readRangeColumns(sheet, layout.labelRow, layout.defects, 'defects', layoutCode);
  return {
    deductionColumns,
    defectColumns,
    resolveDeduction: createColumnResolver(deductionColumns),
    resolveDefect: createColumnResolver(defectColumns, DEFECT_NAME_ALIASES[layoutCode] || {})
  };
}

const setCell = (row, column, value, numFmt) => {
  if (!column) return;
  const cell = row.getCell(column);
  cell.value = value;
  if (numFmt) cell.numFmt = numFmt;
};

// Deduction / defect values are written by header label, never by position.
const withTypeName = (items, nameById, idKey, nameKey) => (Array.isArray(items) ? items : []).map((item) => (
  item?.[nameKey] || !nameById.has(Number(item?.[idKey]))
    ? item
    : { ...item, [nameKey]: nameById.get(Number(item[idKey])) }
));

function writeDetailColumns(row, report, mapping) {
  const { deductionColumns, defectColumns, resolveDeduction, resolveDefect, deductionNameById, defectNameById, unmapped } = mapping;
  const deductions = sumByColumn(withTypeName(report.deductions, deductionNameById, 'deduction_type_id', 'deduction_name'), resolveDeduction, 'hours');
  const defects = sumByColumn(withTypeName(report.defects, defectNameById, 'defect_type_id', 'defect_name'), resolveDefect, 'quantity');
  for (const { column } of deductionColumns) setCell(row, column, deductions.totals.get(column) || 0, '0.00');
  for (const { column } of defectColumns) setCell(row, column, defects.totals.get(column) || 0, '#,##0');
  for (const item of deductions.unmapped) unmapped.push({ kind: 'deduction', reportId: report.id, name: item.deduction_name || item.name || '', value: item.hours });
  for (const item of defects.unmapped) unmapped.push({ kind: 'defect', reportId: report.id, name: item.defect_name || item.name || '', value: item.quantity });
}

module.exports = {
  writeDetailColumns,
  buildLayoutResolvers,
  createColumnResolver,
  readRangeColumns,
  sumByColumn,
  stripCodePrefix,
  RESERVED_LABELS
};
