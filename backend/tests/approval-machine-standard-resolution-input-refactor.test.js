'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../models/productionTempApprovalModel.js'), 'utf8');
const start = source.indexOf('function buildMachineStandardResolutionInput(');
const end = source.indexOf('async function validateApprovalSnapshot(', start);
assert.ok(start >= 0 && end > start, 'machine standard resolution helper exists');
const build = vm.runInNewContext(source.slice(start, end) + '\nbuildMachineStandardResolutionInput;', {});

function previousMapping(item, line) {
  return {
    processId: item.process_id,
    productCode: line.product_code,
    machineId: line.machine_id,
    machineCode: line.machine_code,
    workDate: item.work_date,
    standardVersionId: line.standard_version_id,
    machineStandardId: line.machine_standard_id,
  };
}

test('machine resolution preserves seven fields and saved standard identities', () => {
  const report = { process_id: 1, work_date: '2026-10-30', product_name: 'NOT_USED' };
  const line = { product_code: 'P1', machine_id: 5, machine_code: 'M05',
    standard_version_id: 18, machine_standard_id: 20, standard_output: 99 };
  assert.deepEqual({ ...build(report, line) }, previousMapping(report, line));
  assert.equal(Object.keys(build(report, line)).length, 7);
});

test('machine resolution retains null, undefined, zero and string values', () => {
  const cases = [
    [{ process_id: 0, work_date: null }, { machine_id: 0, machine_code: '', product_code: null }],
    [{ process_id: '1', work_date: '2026-09-01' }, { machine_id: null, standard_version_id: '11' }],
    [{}, {}],
  ];
  for (const [report, line] of cases) {
    assert.deepEqual({ ...build(report, line) }, previousMapping(report, line));
  }
});

test('approval validates each machine line using extracted input mapping', () => {
  const a = source.indexOf('async function validateApprovalSnapshot(');
  const b = source.indexOf('async function createLegacyApprovedSnapshot(', a);
  const validate = source.slice(a, b);
  assert.match(validate, /standardResolver\.resolveStandard\(buildMachineStandardResolutionInput\(item, line\)\)/);
  assert.match(validate, /assertApprovedEventForTempLine\(/);
  assert.match(validate, /assertStandardSnapshotConsistency\(/);
});
