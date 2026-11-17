'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyGiaCongMachineSource } = require('../services/giaCongMachineSource');
const { buildGiaCongMachineAccounting } = require('../services/giaCongMachineAccounting');

test('machine provenance classification preserves every event/line combination', () => {
  const cases = [
    [{ hasPhysicalEvent: false, hasMissingLinkedEvent: false, hasMachineLines: false }, 'MACHINE_DATA_MISSING'],
    [{ hasPhysicalEvent: false, hasMissingLinkedEvent: false, hasMachineLines: true }, 'MACHINE_LINE'],
    [{ hasPhysicalEvent: false, hasMissingLinkedEvent: true, hasMachineLines: true }, 'MACHINE_EVENT_MISSING'],
    [{ hasPhysicalEvent: true, hasMissingLinkedEvent: false, hasMachineLines: true }, 'MACHINE_EVENT'],
    [{ hasPhysicalEvent: true, hasMissingLinkedEvent: true, hasMachineLines: true }, 'MACHINE_EVENT_PARTIAL'],
  ];
  for (const [flags, expected] of cases) assert.equal(classifyGiaCongMachineSource(flags), expected);
});

test('machine accounting reports partial event provenance without double-counting known events', () => {
  const result = buildGiaCongMachineAccounting({ machineLines: [
    { id: 1, machine_event_id: 101, deduction_time_hours: 1 },
    { id: 2, machine_event_id: 101, deduction_time_hours: 1 },
    { id: 3, machine_event_id: 999, machine_time_hours: 8 },
  ] }, new Map([[101, { machine_time_hours: 10 }]]));
  assert.equal(result.source, 'MACHINE_EVENT_PARTIAL');
  assert.equal(result.grossHours, 10);
  assert.equal(result.deductionHours, 1);
  assert.equal(result.netHours, 9);
});
