'use strict';

// Shared coercion, date keys and number formats for monthly Excel rendering.
const asText = (value) => String(value ?? '').trim();
const asNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
const asInteger = (value) => {
  const number = asNumber(value);
  return number === null ? null : Math.round(number);
};

const NUMBER_FORMATS = Object.freeze({
  // Ba phần dương;âm;0 giúp Excel 2016/WPS không hiển thị số 0 thành "0.".
  INTEGER: '#,##0;-#,##0;0',
  DECIMAL: '#,##0.##;-#,##0.##;0',
 STANDARD: '#,##0.##;-#,##0.##;0',
RATE: '#,##0.##;-#,##0.##;0',
  PERCENT: '0.##%;-0.##%;0%',
  DATE: 'dd/mm/yyyy',
  DATETIME: 'dd/mm/yyyy hh:mm'
});

function isWholeNumber(value) {
  return typeof value === 'number'
    && Number.isFinite(value)
    && Math.abs(value - Math.round(value)) < 1e-9;
}

function resolvedNumberFormat(value, requestedFormat) {
  if (
    requestedFormat === NUMBER_FORMATS.DECIMAL
    || requestedFormat === NUMBER_FORMATS.RATE
  ) {
    return isWholeNumber(value) ? NUMBER_FORMATS.INTEGER : requestedFormat;
  }
  return requestedFormat;
}
const asDate = (value) => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const source = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(source)) return null;
  const [year, month, day] = source.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toISOString().slice(0,10) === source ? date : null;
};
const asDateTime = (value) => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};
const normalize = (value) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .replace(/Đ/g, 'D')
  .replace(/[^a-zA-Z0-9]+/g, ' ')
  .trim()
  .toUpperCase();
function pad2(value) {
  return String(value).padStart(2, '0');
}

function localDateKey(value) {
  const date = asDate(value);
  if (!date || Number.isNaN(date.getTime())) return '';

  return [
    date.getUTCFullYear(),
    pad2(date.getUTCMonth() + 1),
    pad2(date.getUTCDate())
  ].join('-');
}

const dateKey = localDateKey;


module.exports = {
  asText, asNumber, asInteger, NUMBER_FORMATS, isWholeNumber, resolvedNumberFormat,
  asDate, asDateTime, normalize, pad2, localDateKey, dateKey,
};
