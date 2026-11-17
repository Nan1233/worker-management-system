'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseJsonArray } = require('../services/machineAccountingJson');
const { buildGiaCongMachineAccounting } = require('../services/giaCongMachineAccounting');

test('machine accounting JSON decoder retains arrays and safely ignores malformed input', () => {
  const input = [{ hours: 1 }];
  assert.strictEqual(parseJsonArray(input), input);
  assert.deepEqual(parseJsonArray('[{"hours":2}]'), [{ hours: 2 }]);
  for (const value of [null, '', 'not-json', '{}', '0', '{} garbage', 3]) {
    assert.deepEqual(parseJsonArray(value), []);
  }
});

test('machine accounting deduplicates physical event time and deduction hours', () => {
  const event = { machine_time_hours: 8 };
  const line = { machine_event_id: 42, deductions_json: '[{"deduction_code":"BREAK","hours":1}]' };
  const result = buildGiaCongMachineAccounting(
    { machineLines: [{ ...line, id: 1 }, { ...line, id: 2 }], operation_mode: 'MACHINE' },
    new Map([[42, event]])
  );
  assert.equal(result.grossHours, 8);
  assert.equal(result.deductionHours, 1);
  assert.equal(result.netHours, 7);
  assert.equal(result.deductions.length, 1);
  assert.equal(result.deductions[0].hours, 1);
});
