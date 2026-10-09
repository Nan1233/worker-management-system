'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { auditMachineDeductions } = require('../scripts/auditHistoricalMachineHoursRemote.cjs');

test('machine deduction audit recognizes persisted detail breakdown', () => {
  const result = auditMachineDeductions({
    deduction_time: 1,
    machineLines: [{
      id: 10,
      machine_code: '5',
      machine_time_hours: 8,
      deduction_time_hours: 1,
      deductions_json: JSON.stringify([{ deduction_code: 'SETUP', hours: 1 }])
    }]
  });
  assert.equal(result.status, 'RECORDED_WITH_DETAILS');
  assert.equal(result.machine_deduction_hours, 1);
  assert.equal(result.machine_deduction_detail_hours, 1);
  assert.equal(result.lines[0].deduction_status, 'DETAIL_RECORDED');
});

test('worker-only deduction is flagged for review, never copied to machine', () => {
  const result = auditMachineDeductions({
    deduction_time: 1.5,
    machineLines: [{ id: 11, machine_code: '5', machine_time_hours: 8, deduction_time_hours: 0, deductions_json: '[]' }]
  });
  assert.equal(result.status, 'REVIEW');
  assert.equal(result.reason, 'WORKER_HAS_DEDUCTION_BUT_MACHINE_HAS_NONE');
  assert.equal(result.machine_deduction_hours, 0);
});

test('a machine deduction total without details is marked incomplete', () => {
  const result = auditMachineDeductions({
    deduction_time: 0,
    machineLines: [{ id: 12, machine_code: '5', machine_time_hours: 8, deduction_time_hours: 0.5, deductions_json: '[]' }]
  });
  assert.equal(result.status, 'PARTIAL_OR_TOTAL_ONLY');
  assert.equal(result.reason, 'MACHINE_DEDUCTION_BREAKDOWN_INCOMPLETE');
  assert.equal(result.machine_deduction_hours, 0.5);
});

test('shared event deduction is counted once and flagged as ambiguous', () => {
  const result = auditMachineDeductions({
    deduction_time: 0.5,
    machineLines: [
      { id: 13, machine_event_id: 99, machine_code: '5', machine_time_hours: 8, deduction_time_hours: 0.5, deductions_json: '[{"deduction_code":"STOP","hours":0.5}]' },
      { id: 14, machine_event_id: 99, machine_code: '5', machine_time_hours: 8, deduction_time_hours: 0.5, deductions_json: '[{"deduction_code":"STOP","hours":0.5}]' }
    ]
  });
  assert.equal(result.status, 'REVIEW');
  assert.equal(result.reason, 'SHARED_EVENT_DEDUCTION_DUPLICATE_RISK');
  assert.equal(result.machine_deduction_hours, 0.5);
  assert.equal(result.duplicate_event_links, 1);
});

test('machine report without machine lines cannot infer machine deductions', () => {
  const result = auditMachineDeductions({ deduction_time: 2, machineLines: [] });
  assert.equal(result.status, 'REVIEW');
  assert.equal(result.reason, 'MACHINE_DEDUCTION_CANNOT_BE_AUDITED_WITHOUT_MACHINE_LINES');
  assert.equal(result.machine_deduction_hours, 0);
});
