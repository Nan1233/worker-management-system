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


test('GC machine accounting does not substitute worker time when machine lines are missing', () => {
  const result = buildGiaCongMachineAccounting({
    total_time: 4.5,
    actual_time: 3.5,
    deduction_time: 1,
    machineLines: []
  }, new Map());

  assert.equal(result.source, 'MACHINE_DATA_MISSING');
  assert.equal(result.grossHours, 0);
  assert.equal(result.deductionHours, 0);
  assert.equal(result.netHours, 0);
});

test('GC machine accounting does not substitute worker deduction when machine line has no deduction rows', () => {
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
  assert.equal(result.deductionHours, 0);
  assert.equal(result.netHours, 4.5);
});

test('linked machine event missing from map does not fall back to worker participation time', () => {
  const result = buildGiaCongMachineAccounting({
    machineLines: [
      { id: 401, machine_event_id: 5555, machine_time_hours: 8, deduction_time_hours: 0, deductions_json: '[]' },
      { id: 402, machine_event_id: 5555, machine_time_hours: 8, deduction_time_hours: 0, deductions_json: '[]' }
    ]
  }, new Map());

  assert.equal(result.grossHours, 0, 'missing physical event must not fall back to worker participation time');
  assert.equal(result.netHours, 0);
  assert.equal(result.source, 'MACHINE_EVENT_MISSING');
});

test('monthly Excel delegates GC accounting to the canonical shared implementation', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(
    path.join(__dirname, '../services/monthlyExcelService.js'),
    'utf8'
  );
  assert.match(source, /require\(["']\.\/giaCongMachineAccounting["']\)/);
  assert.match(source, /buildSharedGiaCongMachineAccounting\(\{ \.\.\.report, machineLines \}, eventMap\)/);
  assert.match(source, /deduction_type_code:\s*item\.deduction_code/);
});

test('GC worker credit uses MAX for parallel automatic machines 5, 6, 7 and 11, but SUM for ordinary machines', () => {
  const physicalEvents = new Map([
    [9101, { id: 9101, machine_id: 5, machine_time_hours: 5 }],
    [9102, { id: 9102, machine_id: 6, machine_time_hours: 5 }],
    [9103, { id: 9103, machine_id: 2, machine_time_hours: 5 }],
    [9104, { id: 9104, machine_id: 3, machine_time_hours: 5 }]
  ]);

  const automaticResult = buildGiaCongMachineAccounting({
    machineLines: [
      { id: 501, machine_event_id: 9101, machine_id: 5, deductions_json: '[]' },
      { id: 502, machine_event_id: 9102, machine_id: 6, deductions_json: '[]' }
    ]
  }, physicalEvents);
  assert.equal(automaticResult.grossHours, 5, 'two automatic machines running in parallel count once for worker credit');

  const mixedResult = buildGiaCongMachineAccounting({
    machineLines: [
      { id: 503, machine_event_id: 9101, machine_id: 5, deductions_json: '[]' },
      { id: 504, machine_event_id: 9103, machine_id: 2, deductions_json: '[]' }
    ]
  }, physicalEvents);
  assert.equal(mixedResult.grossHours, 10, 'ordinary machine hours are added to the automatic-machine maximum');

  const ordinaryResult = buildGiaCongMachineAccounting({
    machineLines: [
      { id: 505, machine_event_id: 9103, machine_id: 2, deductions_json: '[]' },
      { id: 506, machine_event_id: 9104, machine_id: 3, deductions_json: '[]' }
    ]
  }, physicalEvents);
  assert.equal(ordinaryResult.grossHours, 10, 'different ordinary machines are summed');
});

test('GC automatic machine fallback lines use the maximum across machine IDs 5, 6, 7 and 11', () => {
  const result = buildGiaCongMachineAccounting({
    machineLines: [
      { id: 601, machine_id: 7, machine_time_hours: 5, deductions_json: '[]' },
      { id: 602, machine_id: 11, machine_time_hours: 4, deductions_json: '[]' }
    ]
  }, new Map());
  assert.equal(result.grossHours, 5);
});
