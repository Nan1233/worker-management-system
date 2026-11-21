const test = require('node:test');
const assert = require('node:assert/strict');
const { validateProductionReport } = require('../utils/reportValidation');

// The validator only accepts reports from the last 14 days (Vietnam date), so a hard-coded
// date makes this test fail as time passes. Use a date two days ago in UTC+7.
const RECENT_WORK_DATE = new Date(Date.now() + 7 * 3600e3 - 2 * 86400e3).toISOString().slice(0, 10);

test('deduction detail minutes matches deduction_time in hours', () => {
  const result = validateProductionReport({
    work_date: RECENT_WORK_DATE,
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
    work_date: RECENT_WORK_DATE,
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


test('zero-standard long-work codes are not an exemption outside GC', () => {
  const result = validateProductionReport({
    process_id: 2,
    process_code: 'MAI',
    work_date: '2026-10-14',
    shift: 'A',
    work_type: 'XUATNHAP',
    operation_type: 'LONG',
    operation_mode: 'MANUAL',
    total_time: 8,
    actual_time: 8,
    deduction_time: 0,
    standard_output: 0,
    actual_output: 0,
    tt_ok: 0,
    tt_ng: 0,
    defects: [],
    deductions: [],
    machine_lines: [],
  }, { skipActualOutputFormula: true });

  assert.equal(result.valid, false);
  assert.equal(typeof result.errors.standard_output, 'string');
  assert.equal(result.errors.actual_time, undefined);
});

test('zero-standard long-work codes remain allowed for GC', () => {
  const result = validateProductionReport({
    process_id: 1,
    process_code: 'GC',
    work_date: '2026-10-14',
    shift: 'A',
    work_type: 'XUATNHAP',
    operation_type: 'LONG',
    operation_mode: 'MANUAL',
    total_time: 8,
    actual_time: 8,
    deduction_time: 0,
    standard_output: 0,
    actual_output: 0,
    tt_ok: 0,
    tt_ng: 0,
    defects: [],
    deductions: [],
    machine_lines: [],
  }, { skipActualOutputFormula: true });

  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(result.normalized.standard_output, 0);
});
