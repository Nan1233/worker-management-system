'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../models/productionTempApprovalModel.js'), 'utf8');
const start = source.indexOf('function buildMachineStandardWarmUpItems(');
const end = source.indexOf('async function validateApprovalSnapshot(', start);
assert.ok(start >= 0 && end > start, 'warm-up input helper exists');
const build = vm.runInNewContext(source.slice(start, end) + '\nbuildMachineStandardWarmUpItems;', {});

function previousMapping(lines) {
  return lines.map((line) => ({
    machineId: line.machine_id,
    machineCode: line.machine_code,
    productCode: line.product_code,
  }));
}

test('machine standard warm-up retains values, order and missing fields', () => {
  const lines = [
    { id: 7, machine_id: 5, machine_code: 'M05', product_code: 'P1', standard_output: 42 },
    { machine_id: null, machine_code: '', product_code: null },
    { machine_id: 0, machine_code: 123, product_code: undefined },
    {},
  ];
  assert.deepEqual(Array.from(build(lines), (x) => ({ ...x })), previousMapping(lines));
  assert.equal(build(lines).length, 4);
  assert.equal(lines[0].machineId, undefined);
});

test('machine standard warm-up preserves empty input', () => {
  assert.deepEqual(Array.from(build([])), []);
});

test('approval validation uses extracted mapping exactly once without new SQL', () => {
  const startValidate = source.indexOf('async function validateMachineApprovalSnapshot(');
  const endValidate = source.indexOf('async function createLegacyApprovedSnapshot(', startValidate);
  const validate = source.slice(startValidate, endValidate);
  assert.match(validate, /items: buildMachineStandardWarmUpItems\(tempLines\)/);
  assert.equal((validate.match(/buildMachineStandardWarmUpItems\(/g) || []).length, 1);
});
