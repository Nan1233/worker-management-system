'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../models/productionTempApprovalModel.js'), 'utf8');
const start = source.indexOf('function byApprovedTypeThenId(');
const end = source.indexOf('function buildApprovedPostCommitActivities(', start);
assert.ok(start >= 0 && end > start, 'approved version snapshot builders must exist');
const ctx = {};
vm.runInNewContext(source.slice(start, end), ctx);
const build = vm.runInNewContext('buildApprovedVersionPreloaded', ctx);

test('approved snapshot sorts defects by type then row ID and retains quantities', () => {
  const input = [
    { id: 9, defect_type_id: 3, quantity: 5, defect_name: 'not snapshotted' },
    { id: 7, defect_type_id: 2, quantity: 4 },
    { id: 2, defect_type_id: 3, quantity: 8 },
  ];
  const original = [...input];
  const result = build([], input, []);
  assert.deepEqual(Array.from(result.defects, (r) => [r.defect_type_id, r.quantity]),
    [[2, 4], [3, 8], [3, 5]]);
  assert.deepEqual(input, original);
  assert.deepEqual(Object.keys(result.defects[0]).sort(), ['defect_type_id', 'quantity']);
});

test('approved snapshot sorts deductions by type then ID without altering hours', () => {
  const input = [
    { id: 4, deduction_type_id: 8, hours: '0.125000' },
    { id: 2, deduction_type_id: 4, hours: '1.500000' },
    { id: 1, deduction_type_id: 8, hours: '0.250000' },
  ];
  const result = build([], [], input);
  assert.deepEqual(Array.from(result.deductions, (r) => [r.deduction_type_id, r.hours]),
    [[4, '1.500000'], [8, '0.250000'], [8, '0.125000']]);
  assert.equal(input[0].id, 4);
  assert.deepEqual(Object.keys(result.deductions[0]).sort(), ['deduction_type_id', 'hours']);
});

test('approved snapshot preserves machine-line collection identity and empty details', () => {
  const lines = [{ id: 71, machine_code: 'C2556-2', counted_output: '100.000000' }];
  const result = build(lines, [], []);
  assert.strictEqual(result.machineLines, lines);
  assert.equal(result.defects.length, 0);
  assert.equal(result.deductions.length, 0);
});
