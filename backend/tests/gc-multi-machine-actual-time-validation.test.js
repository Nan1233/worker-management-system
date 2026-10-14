'use strict';
// Regression test: GC (Gia công / Cắt-Lồng) reports that use machine_lines no
// longer collect a worker-entered actual_time (frontend: processReportSubmission.ts
// -> isGiaCongMachine zeroes total_time/actual_time/deduction_time; ProcessPage.tsx
// -> usesGiaCongMachineAccounting hides the field and skips the client-side
// actualTime > 0 check). The authoritative work-time source for these reports is
// machine_lines[].machine_time_hours (validated independently in
// machineLineValidationService.js: each line must be > 0 and <= 12 hours).
//
// reportValidation.js must not reject such a report just because the
// report-level actual_time is 0. Every other process/mode that still collects
// a worker-entered actual_time must keep requiring actual_time > 0.
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateProductionReport } = require('../utils/reportValidation');

const baseGcPayload = (overrides = {}) => ({
  process_id: 1, // GC
  work_date: new Date().toISOString().slice(0, 10),
  shift: 'A',
  machine_no: 'C5',
  product_name: 'P1',
  operation_mode: 'MACHINE',
  total_time: 0,
  actual_time: 0,
  deduction_time: 0,
  standard_output: 10,
  actual_output: 0,
  tt_ok: 0,
  tt_ng: 0,
  defects: [],
  deductions: [],
  training_percent: 100,
  machine_lines: [
    { machine_code: 'C5', product_code: 'P1', machine_time_hours: 8, ok_quantity: 10, ng_quantity: 0 }
  ],
  ...overrides,
});

test('GC single machine line: valid machine_time_hours with report-level actual_time=0 is accepted', () => {
  const result = validateProductionReport(baseGcPayload(), { skipActualOutputFormula: true });
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(result.errors.actual_time, undefined);
});

test('GC multi machine lines: two machines with valid hours, report-level actual_time=0 is accepted', () => {
  const payload = baseGcPayload({
    machine_no: 'C5, C6',
    product_name: 'P1, P2',
    machine_lines: [
      { machine_code: 'C5', product_code: 'P1', machine_time_hours: 4, ok_quantity: 5, ng_quantity: 0 },
      { machine_code: 'C6', product_code: 'P2', machine_time_hours: 6, ok_quantity: 5, ng_quantity: 0 },
    ],
  });
  const result = validateProductionReport(payload, { skipActualOutputFormula: true });
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(result.errors.actual_time, undefined);
  assert.equal(result.normalized.actual_time, 0);
  assert.equal(result.normalized.total_time, 0);
});

test('manual report (no machine_lines) still rejects actual_time <= 0', () => {
  const payload = baseGcPayload({ machine_lines: [], operation_mode: 'MANUAL', machine_no: 'M1', product_name: 'P1' });
  const result = validateProductionReport(payload, { skipActualOutputFormula: true });
  assert.equal(result.valid, false);
  assert.equal(result.errors.actual_time, 'Thời gian làm thực tế phải lớn hơn 0');
});

test('GC flagged as MACHINE mode but with an empty machine_lines array still rejects actual_time <= 0', () => {
  const payload = baseGcPayload({ machine_lines: [] });
  const result = validateProductionReport(payload, { skipActualOutputFormula: true });
  assert.equal(result.valid, false);
  assert.equal(result.errors.actual_time, 'Thời gian làm thực tế phải lớn hơn 0');
});

test('Mài (also multi-machine capable, process_id=2) still requires report-level actual_time > 0', () => {
  const payload = baseGcPayload({
    process_id: 2, // MAI — frontend still collects worker actual_time for this process
    actual_time: 0,
    total_time: 0,
  });
  const result = validateProductionReport(payload, { skipActualOutputFormula: true });
  assert.equal(result.valid, false);
  assert.equal(result.errors.actual_time, 'Thời gian làm thực tế phải lớn hơn 0');
});

test('GC total_time/deduction_time stay consistent at zero (no mismatch error introduced)', () => {
  const result = validateProductionReport(baseGcPayload(), { skipActualOutputFormula: true });
  assert.equal(result.errors.total_time, undefined);
});

test('report-level total_time above 12h is still rejected for GC (the exemption only covers actual_time)', () => {
  // reportValidation.js does not itself validate individual machine lines;
  // machineLineValidationService.js does (0 < hours <= 12 per machine). This
  // test only documents that the GC exemption in reportValidation.js does not
  // relax the report-level numeric bounds for total_time/deduction_time.
  const payload = baseGcPayload({ total_time: 13 });
  const result = validateProductionReport(payload, { skipActualOutputFormula: true });
  assert.equal(result.valid, false);
  assert.equal(result.errors.total_time, 'total_time phải là số từ 0 đến 12');
});
