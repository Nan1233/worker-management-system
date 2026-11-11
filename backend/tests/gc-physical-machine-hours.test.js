'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { addGiaCongPhysicalMachineHours } = require('../services/giaCongPhysicalMachineHours');
const { buildGiaCongMachineAccounting } = require('../services/giaCongMachineAccounting');

test('GC physical event time is counted once across shared worker lines', () => {
  const events = new Map([[7, { machine_time_hours: 8 }]]);
  const seenEvents = new Set();
  const line = { machine_event_id: 7, machine_time_hours: 4 };
  const first = addGiaCongPhysicalMachineHours({ line, events, seenEvents, grossHours: 0 });
  const second = addGiaCongPhysicalMachineHours({ line, events, seenEvents, grossHours: first.grossHours });
  assert.equal(first.grossHours, 8);
  assert.equal(second.grossHours, 8);
  assert.equal(second.hasPhysicalEvent, true);
});

test('GC missing linked event never falls back to worker machine hours', () => {
  const missing = addGiaCongPhysicalMachineHours({ line: { machine_event_id: 999, machine_time_hours: 8 },
    events: new Map(), seenEvents: new Set(), grossHours: 0 });
  assert.equal(missing.grossHours, 0);
  assert.equal(missing.hasPhysicalEvent, false);
  const result = buildGiaCongMachineAccounting({ machineLines: [{ machine_event_id: 999, machine_time_hours: 8 }] }, new Map());
  assert.equal(result.source, 'MACHINE_EVENT_MISSING');
  assert.equal(result.grossHours, 0);
});

test('GC unlinked legacy line uses Excel machine hours when available', () => {
  const result = addGiaCongPhysicalMachineHours({ line: { machine_time_hours: 4, excel_machine_time_hours: 6 },
    events: new Map(), seenEvents: new Set(), grossHours: 1 });
  assert.equal(result.grossHours, 7);
});
