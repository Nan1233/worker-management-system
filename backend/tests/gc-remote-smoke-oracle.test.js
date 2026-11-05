const test = require('node:test');
const assert = require('node:assert/strict');
const { expectedAccounting } = require('../../scripts/gcMachineTimeRemoteSmoke.cjs');

test('GC smoke oracle ignores Worker deductions and report-level Worker deduction time', () => {
  const result = expectedAccounting({
    operation_mode: 'MACHINE',
    deductions: [{ deduction_type_id: 9, hours: 2 }],
    deduction_time: 2,
    machineLines: [{
      id: 1,
      machine_event_id: null,
      machine_time_hours: 6,
      deduction_time_hours: 0.5,
      deductions_json: JSON.stringify([{ deduction_type_id: 7, hours: 0.25 }])
    }],
    eventLines: []
  });

  assert.equal(result.grossHours, 6);
  assert.equal(result.deductionHours, 0.5);
  assert.equal(result.netHours, 5.5);
});

test('GC smoke oracle counts one shared physical event and its deduction once', () => {
  const result = expectedAccounting({
    operation_mode: 'MACHINE',
    deductions: [{ deduction_type_id: 9, hours: 4 }],
    deduction_time: 4,
    machineLines: [
      {
        id: 11,
        machine_event_id: 501,
        machine_time_hours: 2,
        deduction_time_hours: 0.5
      },
      {
        id: 12,
        machine_event_id: 501,
        machine_time_hours: 3,
        deduction_time_hours: 0.5
      }
    ],
    eventLines: [{ id: 501, machine_time_hours: 6 }]
  });

  assert.equal(result.source, 'MACHINE_EVENT');
  assert.equal(result.grossHours, 6);
  assert.equal(result.deductionHours, 0.5);
  assert.equal(result.netHours, 5.5);
});

test('GC smoke oracle never falls back to Worker hours when a linked event is missing', () => {
  const result = expectedAccounting({
    operation_mode: 'MACHINE',
    actual_time: 7,
    machineLines: [{
      id: 21,
      machine_event_id: 701,
      machine_time_hours: 7,
      excel_machine_time_hours: 9
    }],
    eventLines: []
  });

  assert.equal(result.source, 'MACHINE_EVENT_MISSING');
  assert.equal(result.grossHours, 0);
  assert.equal(result.deductionHours, 0);
  assert.equal(result.netHours, 0);
});
