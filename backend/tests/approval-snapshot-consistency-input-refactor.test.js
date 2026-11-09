'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../models/productionTempApprovalModel.js'), 'utf8');
const start = source.indexOf('function buildStandardSnapshotConsistencyInput(');
const end = source.indexOf('async function validateApprovalSnapshot(', start);
assert.ok(start >= 0 && end > start, 'snapshot consistency helper exists');
const build = vm.runInNewContext(source.slice(start, end) + '\nbuildStandardSnapshotConsistencyInput;', {});

function oldMapping(saved, resolved) {
  return {
    resolved,
    standardOutput: saved.standard_output,
    standardVersionId: saved.standard_version_id,
    machineStandardId: saved.machine_standard_id,
  };
}

test('machine-line snapshot retains exact fields and resolver reference', () => {
  const saved = { standard_output: '125.50', standard_version_id: 7, machine_standard_id: 9, machine_code: 'M05' };
  const resolved = { id: 5 };
  const actual = { ...build(saved, resolved) };
  assert.deepEqual(actual, oldMapping(saved, resolved));
  assert.strictEqual(actual.resolved, resolved);
  assert.deepEqual(Object.keys(actual), ['resolved', 'standardOutput', 'standardVersionId', 'machineStandardId']);
});

test('report snapshot retains null, undefined, zero and string identities', () => {
  const cases = [
    [{ standard_output: 0, standard_version_id: null, machine_standard_id: undefined }, null],
    [{ standard_output: '0.00', standard_version_id: '11', machine_standard_id: 0 }, undefined],
    [{}, {}],
  ];
  for (const [saved, resolved] of cases) {
    assert.deepEqual({ ...build(saved, resolved) }, oldMapping(saved, resolved));
  }
});

test('both approval snapshot paths call the shared consistency mapper', () => {
  const a = source.indexOf('async function validateMachineApprovalSnapshot(');
  const b = source.indexOf('async function createLegacyApprovedSnapshot(', a);
  const validate = source.slice(a, b);
  assert.match(validate, /assertStandardSnapshotConsistency\(buildStandardSnapshotConsistencyInput\(line, resolved\)\)/);
  assert.match(validate, /assertStandardSnapshotConsistency\(buildStandardSnapshotConsistencyInput\(item, resolved\)\)/);
  assert.equal((validate.match(/assertStandardSnapshotConsistency\(/g) || []).length, 2);
});
