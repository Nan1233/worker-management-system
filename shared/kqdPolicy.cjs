'use strict';

const KQD_EXCLUSION_CODES = Object.freeze(['KQD']);

function normalizeDefectCode(value) {
  return String(value || '').trim().toUpperCase();
}

function isKqdDefect(value) {
  const code = normalizeDefectCode(
    value && typeof value === 'object'
      ? (value.defect_code || value.defect_type_code || value.code)
      : value
  );
  return KQD_EXCLUSION_CODES.includes(code);
}

function safeQuantity(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function calculateProductionOutput({ ok = 0, defects = [], excludeKqdFromTt = false } = {}) {
  const ttOk = Math.max(0, safeQuantity(ok));
  let totalNg = 0;
  let excludedKqd = 0;

  for (const item of Array.isArray(defects) ? defects : []) {
    const quantity = safeQuantity(item?.quantity);
    totalNg += quantity;
    if (excludeKqdFromTt && isKqdDefect(item)) excludedKqd += quantity;
  }

  const countedNg = totalNg - excludedKqd;
  return {
    totalNg,
    countedNg,
    excludedKqd,
    actualOutput: ttOk + countedNg,
    ttOk
  };
}

module.exports = {
  KQD_EXCLUSION_CODES,
  normalizeDefectCode,
  isKqdDefect,
  calculateProductionOutput
};
