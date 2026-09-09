const test = require('node:test');
const assert = require('node:assert/strict');
const { validateProductionReport } = require('../utils/reportValidation');

test('CVK report accepts zero standard and zero production output', () => {
  const result = validateProductionReport({
    process_id: 60006,
    process_code: 'CVK',
    work_date: new Date().toISOString().slice(0, 10),
    shift: 'C',
    machine_no: '',
    product_name: '',
    total_time: 7.5,
    actual_time: 7.5,
    deduction_time: 0,
    standard_output: 0,
    actual_output: 0,
    tt_ok: 0,
    tt_ng: 0,
    defects: [],
    deductions: [],
    training_percent: 100,
  }, { skipActualOutputFormula: true });

  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(result.normalized.standard_output, 0);
  assert.equal(result.normalized.actual_output, 0);
});

test('normal production report still rejects zero standard', () => {
  const result = validateProductionReport({
    process_id: 1,
    work_date: new Date().toISOString().slice(0, 10),
    shift: 'A',
    machine_no: 'M1',
    product_name: 'P1',
    total_time: 8,
    actual_time: 8,
    deduction_time: 0,
    standard_output: 0,
    actual_output: 0,
    tt_ok: 0,
    tt_ng: 0,
    defects: [],
    deductions: [],
    training_percent: 100,
  }, { skipActualOutputFormula: true });

  assert.equal(result.valid, false);
  assert.ok(result.errors.standard_output);
});
