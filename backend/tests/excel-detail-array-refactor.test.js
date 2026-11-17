'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseExcelDetailArray } = require('../services/excelDetailArray');
const { parseArray: parseMachineLineArray, buildMachineExcelRows } = require('../services/machineLineExcelRows');

test('Excel parser preserves legacy arrays and wrapped defects', () => {
  const details = [{ quantity: 2 }];
  assert.strictEqual(parseExcelDetailArray(details), details);
  assert.deepEqual(parseExcelDetailArray(JSON.stringify(details)), details);
  assert.deepEqual(parseExcelDetailArray(JSON.stringify({ defects: details })), details);
  for (const invalid of [null, '', 'bad json', '{}', '123']) {
    assert.deepEqual(parseExcelDetailArray(invalid), []);
  }
  assert.strictEqual(parseMachineLineArray, parseExcelDetailArray);
});

test('Excel machine rows keep each machine credit separate from parent aggregate', () => {
  const reports = [{ id: 1, actual_output: 999, machinePerformance: { counted_output: 999 },
    machineLines: [{ id: 11, machine_code: 'M1', machine_time_hours: 2, ok_quantity: 5, ng_quantity: 0 },
      { id: 12, machine_code: 'M2', machine_time_hours: 3, ok_quantity: 6, ng_quantity: 0 }] }];
  const rows = buildMachineExcelRows(reports);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(x => x.machine_no), ['M1', 'M2']);
  assert.ok(rows.every(x => x.machinePerformance === null));
  assert.deepEqual(rows.map(x => x.total_time), [2, 3]);
});
