'use strict';

/**
 * Clone mutable ExcelJS style objects without JSON serialization.
 * Preserves undefined properties, dates and byte buffers, and prevents
 * worksheets from sharing nested styles by reference.
 */
function cloneExcelStyle(value, seen = new WeakMap()) {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return seen.get(value);
  if (value instanceof Date) return new Date(value.getTime());
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) return Buffer.from(value);
  if (ArrayBuffer.isView(value)) return new value.constructor(value);
  if (Array.isArray(value)) {
    const copy = [];
    seen.set(value, copy);
    for (const item of value) copy.push(cloneExcelStyle(item, seen));
    return copy;
  }
  const copy = {};
  seen.set(value, copy);
  for (const key of Object.keys(value)) copy[key] = cloneExcelStyle(value[key], seen);
  return copy;
}

module.exports = { cloneExcelStyle };
