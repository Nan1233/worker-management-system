'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../models/productionTempApprovalModel.js'), 'utf8');
const start = source.indexOf('function buildTempMachineLineDefectsQuery(');
const end = source.indexOf('function buildApprovedMachineDefectsInsert(', start);
assert.ok(start >= 0 && end > start);
const ctx = {};
vm.runInNewContext(source.slice(start, end), ctx);
const build = vm.runInNewContext('buildTempMachineLineDefectsQuery', ctx);

test('valid machine line IDs are parameterized and ordered', () => {
  const { sql, params } = build([{ id: 12 }, { id: '13' }]);
  assert.deepEqual(Array.from(params), [12, 13]);
  assert.match(sql, /machine_line_id IN \(\?,\?\)/);
  assert.match(sql, /ORDER BY machine_line_id ASC, id ASC/);
});

test('invalid IDs fail closed instead of silently dropping machine defects', () => {
  for (const id of [null, undefined, '', 0, -1, 1.5, '1.5', '1e3', 'abc', true, [], {}, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => build([{ id: 12 }, { id }]), (error) => {
      assert.equal(error.status, 500);
      assert.equal(error.code, 'TEMP_MACHINE_LINE_INVALID_ID');
      assert.equal(error.isPublic, true);
      return true;
    });
  }
});

test('an invalid ID cannot be concealed by later valid machine lines', () => {
  assert.throws(() => build([{ id: 'bad' }, { id: 77 }]), /ID không hợp lệ/);
});

test('empty input retains an empty parameter list for caller-side empty guard', () => {
  const result = build([]);
  assert.deepEqual(Array.from(result.params), []);
});
