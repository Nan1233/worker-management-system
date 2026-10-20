const test = require('node:test');
const assert = require('node:assert/strict');
const { validateProductionReport } = require('../utils/reportValidation');

test('deduction detail minutes matches deduction_time in hours', () => {
  const result = validateProductionReport({
    // A hardcoded date goes stale once it falls outside the 14-day submission
    // window and starts failing on an unrelated work_date check; use "today"
    // like the other validateProductionReport tests (e.g.
    // decimal-standard-precision.test.js, non-product-work-validation.test.js).
    work_date: new Date().toISOString().slice(0, 10),
    shift: 'A',
    total_time: 10 + 20 / 60,
    actual_time: 10,
    deduction_time: 20 / 60,
    standard_output: 100,
    actual_output: 100,
    tt_ok: 100,
    tt_ng: 0,
    defects: [],
    deductions: [
      { deduction_type_id: 1, deduction_name: 'Chỉnh máy', minutes: 10 },
      { deduction_type_id: 2, deduction_name: 'Nghỉ giải lao', minutes: 10 },
    ],
  }, { skipActualOutputFormula: true });

  assert.equal(result.valid, true);
  assert.equal(result.errors.deduction_time, undefined);
  assert.equal(Math.round(result.normalized.deductions.reduce((sum, item) => sum + item.hours, 0) * 60), 20);
});

test('canonical deduction hours still works', () => {
  const result = validateProductionReport({
    work_date: new Date().toISOString().slice(0, 10),
    shift: 'A',
    total_time: 10 + 20 / 60,
    actual_time: 10,
    deduction_time: 20 / 60,
    standard_output: 100,
    actual_output: 100,
    tt_ok: 100,
    tt_ng: 0,
    defects: [],
    deductions: [
      { deduction_type_id: 1, deduction_name: 'Chỉnh máy', hours: 10 / 60 },
      { deduction_type_id: 2, deduction_name: 'Nghỉ giải lao', hours: 10 / 60 },
    ],
  }, { skipActualOutputFormula: true });

  assert.equal(result.valid, true);
  assert.equal(result.errors.deduction_time, undefined);
});
