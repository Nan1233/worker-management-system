'use strict';

const safeText = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) return value.richText.map((x) => String(x?.text ?? '')).join('');
    if (value.text !== undefined) return String(value.text ?? '');
    if (value.result !== undefined) return String(value.result ?? '');
    if (value.formula !== undefined) return String(value.result ?? '');
  }
  return String(value);
};

const num = (value) => {
  const parsed = Number(safeText(value ?? 0).replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
};

function reportExtraValue(report, key) {
  const extra = report?.extra_data;
  if (!extra) return '';
  try {
    const parsed = typeof extra === 'string' ? JSON.parse(extra) : extra;
    const value = parsed && typeof parsed === 'object' ? parsed[key] : '';
    return value == null ? '' : String(value).trim();
  } catch (_) {
    return '';
  }
}

const normalizeCode = (value) => safeText(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .replace(/Đ/g, 'D')
  .replace(/[^A-Za-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '')
  .toUpperCase();

const dateKey = (value) => {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const toExcelDate = (value) => {
  const key = dateKey(value);
  if (!key) return null;
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const isFormulaValue = (value) => Boolean(value && typeof value === 'object' &&
  (typeof value.formula === 'string' || typeof value.sharedFormula === 'string' ||
   (typeof value.ref === 'string' && value.shareType === 'array')));

const setCell = (row, column, value, format) => {
  if (!column) return;
  const cell = row.getCell(column);
  // Formula cells belong to the template. Let Excel calculate them rather
  // than replacing their formulas with static values from the exporter.
  if (isFormulaValue(cell.value)) return;
  cell.value = value;
  // Prefer the number format authored in the source template. The fallback
  // format is applied only to genuinely unformatted cells.
  if (format && (!cell.numFmt || cell.numFmt === 'General')) cell.numFmt = format;
};

const uniqueBy = (items, keyFn) => {
  const result = [];
  const seen = new Set();
  for (const item of items || []) {
    const key = keyFn(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
};

module.exports = {safeText,num,reportExtraValue,normalizeCode,dateKey,toExcelDate,isFormulaValue,setCell,uniqueBy};
