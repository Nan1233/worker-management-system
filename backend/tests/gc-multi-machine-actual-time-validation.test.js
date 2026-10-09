const test = require('node:test');
const assert = require('node:assert/strict');
const { validateProductionReport } = require('../utils/reportValidation');

// Regression tests for the bug where Gia công (GC) multi-machine reports could
// not be submitted after the frontend stopped collecting actual_time for this
// flow (see processReportSubmission.ts: isGiaCongMachine zeroes total_time,
// actual_time and deduction_time, relying on machine_lines[].machine_time_hours
// instead). Backend validation must only waive actual_time > 0 for GC reports
// that actually carry machine_lines; every other flow keeps the old rule.

const GC_PROCESS_ID = 1; // processMachinePolicy.js PROCESS_IDS.GC
const MAI_PROCESS_ID = 2; // PROCESS_IDS.MAI (also multi-machine, but NOT GC)

const baseGcMachinePayload = (overrides = {}) => ({
  work_date: '2026-10-01',
  shift: 'A',
  process_id: GC_PROCESS_ID,
  operation_type: 'CUT',
  operation_mode: 'MACHINE',
  total_time: 0,
  actual_time: 0,
  deduction_time: 0,
  // Frontend sends the sum of each machine_lines[].standard_output here
  // (processReportSubmission.ts), never 0, for a normal GC machine report.
  standard_output: 2,
  actual_output: 16,
  tt_ok: 15,
  tt_ng: 1,
  defects: [],
  deductions: [],
  machine_lines: [
    { machine_code: 'M01', product_code: 'ABC', machine_time_hours: 8, standard_output: 2, ok_quantity: 15, ng_quantity: 1 },
  ],
  ...overrides,
});

test('GC multi-machine report with valid per-machine time and no worker actual_time submits successfully', () => {
  const result = validateProductionReport(baseGcMachinePayload(), { skipActualOutputFormula: true });
  assert.equal(result.valid, true);
  assert.equal(result.errors.actual_time, undefined);
  assert.equal(result.normalized.actual_time, 0);
});

test('GC multi-machine report with two machine lines and zero worker actual_time is still valid', () => {
  const result = validateProductionReport(baseGcMachinePayload({
    tt_ok: 30,
    tt_ng: 2,
    actual_output: 32,
    standard_output: 4,
    machine_lines: [
      { machine_code: 'M01', product_code: 'ABC', machine_time_hours: 8, standard_output: 2, ok_quantity: 15, ng_quantity: 1 },
      { machine_code: 'M02', product_code: 'ABC', machine_time_hours: 6.5, standard_output: 2, ok_quantity: 15, ng_quantity: 1 },
    ],
  }), { skipActualOutputFormula: true });
  assert.equal(result.valid, true);
  assert.equal(result.errors.actual_time, undefined);
});

test('manual report (no machine_lines) without actual_time is still rejected', () => {
  const result = validateProductionReport({
    work_date: '2026-10-01',
    shift: 'A',
    process_id: GC_PROCESS_ID,
    operation_mode: 'MANUAL',
    total_time: 0,
    actual_time: 0,
    deduction_time: 0,
    standard_output: 100,
    actual_output: 0,
    tt_ok: 0,
    tt_ng: 0,
    defects: [],
    deductions: [],
    machine_lines: [],
  });
  assert.equal(result.valid, false);
  assert.equal(result.errors.actual_time, 'Thời gian làm thực tế phải lớn hơn 0');
});

test('GC report flagged MACHINE but with an empty machine_lines array is still rejected for actual_time', () => {
  const result = validateProductionReport(baseGcMachinePayload({ machine_lines: [] }), { skipActualOutputFormula: true });
  assert.equal(result.valid, false);
  assert.equal(result.errors.actual_time, 'Thời gian làm thực tế phải lớn hơn 0');
});

test('other multi-machine processes (Mài) still require worker actual_time > 0', () => {
  const result = validateProductionReport(baseGcMachinePayload({
    process_id: MAI_PROCESS_ID,
    operation_type: 'MAI',
  }), { skipActualOutputFormula: true });
  assert.equal(result.valid, false);
  assert.equal(result.errors.actual_time, 'Thời gian làm thực tế phải lớn hơn 0');
});

test('GC multi-machine total_time/deduction_time stay internally consistent at zero', () => {
  const result = validateProductionReport(baseGcMachinePayload(), { skipActualOutputFormula: true });
  assert.equal(result.valid, true);
  assert.equal(result.normalized.total_time, 0);
  assert.equal(result.normalized.deduction_time, 0);
  assert.equal(result.errors.total_time, undefined);
  assert.equal(result.errors.deduction_time, undefined);
});
