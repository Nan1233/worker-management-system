const { calculateProductionOutput } = require('../../shared/kqdPolicy.cjs');

const calculateCountedNg = (defects = []) =>
  calculateProductionOutput({ ok: 0, defects }).countedNg;

const calculateActualOutput = ({ ttOk, defects }) =>
  calculateProductionOutput({ ok: ttOk, defects }).actualOutput;

module.exports = {
  calculateCountedNg,
  calculateActualOutput,
  calculateProductionOutput
};
