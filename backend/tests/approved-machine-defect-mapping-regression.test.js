'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../models/productionTempApprovalModel.js'), 'utf8');
const start = source.indexOf('function buildApprovedMachineDefectRows(');
const end = source.indexOf('// Keep the approved machine-line INSERT', start);
assert.ok(start >= 0 && end > start, 'approved machine defect mapper must exist');
const map = vm.runInNewContext(source.slice(start, end) + '\nbuildApprovedMachineDefectRows;', {});

test('machine defects retain their originating approved line identity and order', () => {
  const rows = map([
    { defects: [
      { defect_type_id: 8, defect_code: 'NG-A', defect_name: 'A', quantity: 3 },
      { defect_type_id: 9, defect_code: 'NG-B', defect_name: 'B', quantity: 1 },
    ] },
    { defects: [{ defect_type_id: 10, defect_code: 'NG-C', defect_name: 'C', quantity: 5 }] },
  ], [{ id: 501 }, { id: 502 }]);
  assert.deepEqual(Array.from(rows, (row) => Array.from(row)), [
    [501, 8, 'NG-A', 'A', 3],
    [501, 9, 'NG-B', 'B', 1],
    [502, 10, 'NG-C', 'C', 5],
  ]);
});

test('machine lines without defects do not create synthetic defect records', () => {
  const rows = map([{ defects: [] }, {}, { defects: [{ defect_type_id: 2, quantity: 4 }] }],
    [{ id: 11 }, { id: 12 }, { id: 13 }]);
  assert.deepEqual(Array.from(rows, (row) => Array.from(row)), [
    [13, 2, null, null, 4],
  ]);
  assert.equal(map([{ defects: [] }], [{ id: 11 }]).length, 0);
});

test('optional defect fields use legacy null and zero defaults without changing quantities', () => {
  const rows = map([{ defects: [
    { defect_type_id: null, defect_code: '', defect_name: '', quantity: 0 },
    { defect_type_id: 3, defect_code: 'NG-X', defect_name: 'X', quantity: 7 },
  ] }], [{ id: 77 }]);
  assert.deepEqual(Array.from(rows, (row) => Array.from(row)), [
    [77, null, null, null, 0],
    [77, 3, 'NG-X', 'X', 7],
  ]);
});
