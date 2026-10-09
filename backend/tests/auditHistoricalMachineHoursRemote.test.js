'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyReport, monthList } = require('../scripts/auditHistoricalMachineHoursRemote.cjs');

test('monthList includes the cutoff month and spans year boundaries', () => {
  assert.deepEqual(monthList('2025-11', '2026-10-08'), [
    '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04',
    '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'
  ]);
});

test('monthList rejects invalid start month', () => {
  assert.throws(() => monthList('2026-13', '2026-10-08'), /month must be 01-12/);
});

test('single machine line with missing hours is eligible only with valid worker time', () => {
  const result = classifyReport({
    id: 10, work_date: '2026-09-01', total_time: 8, deduction_time: 1,
    operation_mode: 'MACHINE', machineLines: [{ id: 20, machine_code: 'GC01', machine_time_hours: 0 }]
  });
  assert.equal(result.action, 'ELIGIBLE_SINGLE_MACHINE');
  assert.equal(result.reason, 'ONE_MACHINE_LINE_MISSING_TIME_WITH_VALID_WORKER_TIME');
});

test('multi-machine allocation is flagged for review, not auto-split', () => {
  const result = classifyReport({
    id: 11, work_date: '2026-09-02', total_time: 8, deduction_time: 1,
    operation_mode: 'MACHINE', machineLines: [
      { id: 21, machine_code: 'GC01', machine_time_hours: 0 },
      { id: 22, machine_code: 'GC02', machine_time_hours: 0 }
    ]
  });
  assert.equal(result.action, 'REVIEW');
  assert.equal(result.reason, 'MULTI_MACHINE_ALLOCATION_REQUIRES_CONFIRMATION');
});

test('machine report without machine lines is flagged for review', () => {
  const result = classifyReport({ id: 12, work_date: '2026-09-03', total_time: 8, operation_mode: 'MACHINE', machineLines: [] });
  assert.equal(result.action, 'REVIEW');
  assert.equal(result.reason, 'MACHINE_REPORT_WITHOUT_MACHINE_LINES');
});

test('machine hours over 12 are preserved and flagged for review', () => {
  const result = classifyReport({
    id: 13, work_date: '2026-09-04', total_time: 8, deduction_time: 0,
    operation_mode: 'MACHINE', machineLines: [{ id: 23, machine_code: 'GC01', machine_time_hours: 13 }]
  });
  assert.equal(result.action, 'REVIEW');
  assert.equal(result.reason, 'EXISTING_MACHINE_TIME_OVER_12_HOURS');
});
