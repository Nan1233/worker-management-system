'use strict';

// KQD is a normal NG detail. There is no longer a KQD exclusion rule for
// production-output / TT calculations. Keep the legacy exports temporarily
// so older callers do not break while the remaining snapshot/config fields
// are migrated away.
const KQD_EXCLUSION_CODES = Object.freeze([]);

function normalizeDefectCode(value) {
  return String(value || '').trim().toUpperCase();
}

function isKqdDefect() {
  return false;
}

function safeQuantity(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function calculateProductionOutput({ ok = 0, defects = [] } = {}) {
  const ttOk = Math.max(0, safeQuantity(ok));
  let totalNg = 0;

  for (const item of Array.isArray(defects) ? defects : []) {
    totalNg += safeQuantity(item?.quantity);
  }

  // All NG, including KQD, is counted uniformly.
  const countedNg = totalNg;
  return {
    totalNg,
    countedNg,
    excludedKqd: 0,
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
