const test = require('node:test');
const assert = require('node:assert/strict');

const { expectedAccounting } = require('../../scripts/gcMachineTimeRemoteSmoke.cjs');

test('remote smoke oracle counts a shared physical event once within one worker report', () => {
  const result = expectedAccounting({
    operation_mode: 'MACHINE',
    machineLines: [
      { id: 1, machine_event_id: 100, machine_time_hours: 4, deductions_json: '[{"hours":0.5}]' },
      { id: 2, machine_event_id: 100, machine_time_hours: 4, deductions_json: '[]' }
    ],
    eventLines: [{ id: 100, machine_time_hours: 4 }]
  });

  assert.equal(result.grossHours, 4);
  assert.equal(result.deductionHours, 0.5);
  assert.equal(result.netHours, 3.5);
  assert.equal(result.source, 'MACHINE_EVENT');
});

test('remote smoke oracle never projects worker-level deductions into physical accounting, even with one machine line', () => {
  const result = expectedAccounting({
    operation_mode: 'MACHINE',
    deduction_time: 1,
    deductions: [{ deduction_type_id: 7, hours: 0.75 }],
    machineLines: [
      { id: 10, machine_event_id: null, machine_time_hours: 8, deduction_time_hours: 0, deductions_json: '[]' }
    ],
    eventLines: []
  });

  assert.equal(result.grossHours, 8);
  assert.equal(result.deductionHours, 0);
  assert.equal(result.netHours, 8);
  assert.equal(result.source, 'MACHINE_LINE');
});

test('remote smoke oracle does not spread report-level deductions over multiple machine lines', () => {
  const result = expectedAccounting({
    operation_mode: 'MACHINE',
    deduction_time: 1,
    deductions: [{ deduction_type_id: 7, hours: 1 }],
    machineLines: [
      { id: 20, machine_event_id: null, machine_time_hours: 4, deduction_time_hours: 0, deductions_json: '[]' },
      { id: 21, machine_event_id: null, machine_time_hours: 4, deduction_time_hours: 0, deductions_json: '[]' }
    ],
    eventLines: []
  });

  assert.equal(result.grossHours, 8);
  assert.equal(result.deductionHours, 0);
  assert.equal(result.netHours, 8);
  assert.equal(result.source, 'MACHINE_LINE');
});

test('remote smoke oracle prefers machine-line breakdown when it exists', () => {
  const result = expectedAccounting({
    operation_mode: 'MACHINE',
    deduction_time: 2,
    deductions: [{ deduction_type_id: 9, hours: 2 }],
    machineLines: [
      { id: 30, machine_event_id: null, machine_time_hours: 5, deduction_time_hours: 0.5, deductions_json: '[{"hours":0.5}]' },
      { id: 31, machine_event_id: null, machine_time_hours: 3, deduction_time_hours: 0.25, deductions_json: '[{"hours":0.25}]' }
    ],
    eventLines: []
  });

  assert.equal(result.grossHours, 8);
  assert.equal(result.deductionHours, 0.75);
  assert.equal(result.netHours, 7.25);
});

test('remote smoke oracle never substitutes worker participation time for a missing event', () => {
  const result = expectedAccounting({
    operation_mode: 'MACHINE',
    machineLines: [
      { id: 40, machine_event_id: 999, machine_time_hours: 8, deduction_time_hours: 0, deductions_json: '[]' }
    ],
    eventLines: []
  });

  assert.equal(result.grossHours, 0);
  assert.equal(result.deductionHours, 0);
  assert.equal(result.netHours, 0);
  assert.equal(result.source, 'MACHINE_EVENT_MISSING');
});
