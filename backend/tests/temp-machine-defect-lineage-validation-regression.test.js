'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../models/productionTempApprovalModel.js'), 'utf8');
const start = source.indexOf('function attachMachineLineDefects(');
const end = source.indexOf('function buildTempMachineLinesRead(', start);
assert.ok(start >= 0 && end > start);
const context = {};
vm.runInNewContext(source.slice(start, end), context);
const attach = vm.runInNewContext('attachMachineLineDefects', context);

test('defects remain attached to correct machine and retain per-line order', () => {
  const lines = [{ id: 8, machine_code: 'A' }, { id: '9', machine_code: 'B' }];
  const defects = [{ id: 1, machine_line_id: '9' }, { id: 2, machine_line_id: 8 }, { id: 3, machine_line_id: 8 }];
  const result = attach(lines, defects);
  assert.deepEqual(Array.from(result[0].defects, d => d.id), [2, 3]);
  assert.deepEqual(Array.from(result[1].defects, d => d.id), [1]);
  assert.equal(result[0].machine_code, 'A');
});

test('orphan defect cannot be silently omitted from approval', () => {
  assert.throws(() => attach([{ id: 8 }], [{ id: 1, machine_line_id: 9 }]), err => {
    assert.equal(err.status, 500);
    assert.equal(err.code, 'TEMP_MACHINE_DEFECT_LINEAGE_MISMATCH');
    assert.equal(err.isPublic, true);
    return true;
  });
});

test('invalid machine references are rejected instead of coerced', () => {
  for (const id of [null, undefined, '', 0, -1, 1.5, '1e1', true, {}, [], Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => attach([{ id: 8 }], [{ id: 1, machine_line_id: id }]), err => err.code === 'TEMP_MACHINE_DEFECT_LINEAGE_MISMATCH');
  }
});

test('machines with no defects retain an empty list', () => {
  const result = attach([{ id: 8 }, { id: 9 }], [{ machine_line_id: 8 }]);
  assert.deepEqual(Array.from(result[1].defects), []);
  assert.equal(result[0].defects.length, 1);
});

test('empty defects remain valid for an empty machine list', () => {
  assert.deepEqual(Array.from(attach([], [])), []);
});
