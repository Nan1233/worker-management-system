const {
  KQD_EXCLUSION_CODES,
  isKqdDefect,
  calculateProductionOutput
} = require('../../shared/kqdPolicy.cjs');

const KQD_CODES = new Set(KQD_EXCLUSION_CODES);

const calculateCountedNg = (defects = [], excludeKqdFromTt = false) =>
  calculateProductionOutput({ ok: 0, defects, excludeKqdFromTt }).countedNg;

const calculateActualOutput = ({ ttOk, defects, excludeKqdFromTt = false }) =>
  calculateProductionOutput({ ok: ttOk, defects, excludeKqdFromTt }).actualOutput;

module.exports = {
  KQD_CODES,
  isKqdDefect,
  calculateProductionOutput,
  calculateCountedNg,
  calculateActualOutput
};
