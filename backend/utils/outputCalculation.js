const {
  KQD_EXCLUSION_CODES,
  isKqdDefect,
  calculateProductionOutput
} = require('../../shared/kqdPolicy.cjs');

const KQD_CODES = new Set(KQD_EXCLUSION_CODES);

// Legacy parameter is intentionally ignored: KQD is no longer excluded from
// NG/output calculations.
const calculateCountedNg = (defects = []) =>
  calculateProductionOutput({ ok: 0, defects }).countedNg;

const calculateActualOutput = ({ ttOk, defects }) =>
  calculateProductionOutput({ ok: ttOk, defects }).actualOutput;

module.exports = {
  KQD_CODES,
  isKqdDefect,
  calculateProductionOutput,
  calculateCountedNg,
  calculateActualOutput
};
