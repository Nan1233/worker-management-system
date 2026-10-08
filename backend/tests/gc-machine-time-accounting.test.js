const test = require('node:test');
const assert = require('node:assert/strict');

const { buildGiaCongMachineAccounting } = require('../services/giaCongMachineAccounting');

test('GC machine accounting uses each physical machine event once and moves deductions to machine time', () => {
  const report = {
    machineLines: [
      {
        id: 101,
        machine_event_id: 9001,
        machine_time_hours: 8,
        deduction_time_hours: 1.5,
        deductions_json: JSON.stringify([
          { deduction_type_id: 7, deduction_code: 'CHO_HANG', deduction_name: 'Chờ hàng', hours: 1.5 }
        ])
      },
      {
        id: 102,
        machine_event_id: 9001,
        machine_time_hours: 8,
        deduction_time_hours: 0,
        deductions_json: '[]'
      }
    ]
  };

  const physicalEvents = new Map([
    [9001, { id: 9001, machine_time_hours: 8 }]
  ]);

  const result = buildGiaCongMachineAccounting(report, physicalEvents);

  assert.equal(result.source, 'MACHINE_EVENT');
  assert.equal(result.grossHours, 8);
  assert.equal(result.deductionHours, 1.5);
  assert.equal(result.netHours, 6.5);
  assert.equal(result.deductions.length, 1);
  assert.equal(result.deductions[0].hours, 1.5);
});

test('GC machine accounting falls back to machine-line time when no physical event is linked', () => {
  const result = buildGiaCongMachineAccounting({
    machineLines: [
      {
        id: 201,
        machine_event_id: null,
        machine_time_hours: 7.5,
        deduction_time_hours: 0.5,
        deductions_json: JSON.stringify([
          { deduction_type_id: 8, deduction_code: 'BAO_DUONG', deduction_name: 'Bảo dưỡng', hours: 0.5 }
        ])
      }
    ]
  }, new Map());

  assert.equal(result.source, 'MACHINE_LINE');
  assert.equal(result.grossHours, 7.5);
  assert.equal(result.deductionHours, 0.5);
  assert.equal(result.netHours, 7);
});


test('GC machine accounting falls back to legacy report total time and deduction time when no machine lines exist', () => {
  const result = buildGiaCongMachineAccounting({
    total_time: 4.5,
    actual_time: 3.5,
    deduction_time: 1,
    machineLines: []
  }, new Map());

  assert.equal(result.source, 'LEGACY_REPORT');
  assert.equal(result.grossHours, 4.5);
  assert.equal(result.deductionHours, 1);
  assert.equal(result.netHours, 3.5);
});

test('GC machine accounting uses legacy report deduction when machine line has no deduction rows', () => {
  const result = buildGiaCongMachineAccounting({
    total_time: 4.5,
    actual_time: 3.5,
    deduction_time: 1,
    machineLines: [
      {
        id: 301,
        machine_event_id: null,
        machine_time_hours: 4.5,
        deduction_time_hours: 0,
        deductions_json: '[]'
      }
    ]
  }, new Map());

  assert.equal(result.source, 'MACHINE_LINE');
  assert.equal(result.grossHours, 4.5);
  assert.equal(result.deductionHours, 1);
  assert.equal(result.netHours, 3.5);
});

test('H2: two lines share machine_event_id but event not in map — grossHours counted once', () => {
  const result = buildGiaCongMachineAccounting({
    machineLines: [
      { id: 401, machine_event_id: 5555, machine_time_hours: 8, deduction_time_hours: 0, deductions_json: '[]' },
      { id: 402, machine_event_id: 5555, machine_time_hours: 8, deduction_time_hours: 0, deductions_json: '[]' }
    ]
  }, new Map());

  assert.equal(result.grossHours, 8, 'should be 8 not 16 — same physical event must not double-count');
  assert.equal(result.netHours, 8);
  assert.equal(result.source, 'MACHINE_LINE');
});
