'use strict';

const configuredCodes = require('./kqdExclusionRegistry.json');

const KQD_EXCLUSION_CODES = Object.freeze(
  [...new Set((configuredCodes || []).map((value) => String(value || '').trim().toUpperCase()).filter(Boolean))]
);
const KQD_EXCLUSION_CODE_SET = new Set(KQD_EXCLUSION_CODES);

function normalizeDefectCode(value) {
  return String(value || '').trim().toUpperCase();
}

function defectCode(defect) {
  if (typeof defect === 'string') return normalizeDefectCode(defect);
  return normalizeDefectCode(defect?.defect_type_code || defect?.defect_code || defect?.code);
}

function isKqdDefect(defect) {
  return KQD_EXCLUSION_CODE_SET.has(defectCode(defect));
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
  const countedNg = Math.max(0, totalNg - excludedKqd);
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
