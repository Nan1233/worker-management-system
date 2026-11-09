'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../models/productionTempApprovalModel.js'), 'utf8');
const start = source.indexOf('function hasNonProductSnapshotMismatch(');
const end = source.indexOf('async function validateApprovalSnapshot(', start);
assert.ok(start >= 0 && end > start, 'non-product snapshot helpers exist');
const helpers = vm.runInNewContext(source.slice(start, end) + '\n({hasNonProductSnapshotMismatch, assertNonProductWorkSnapshot});', {});
const { hasNonProductSnapshotMismatch, assertNonProductWorkSnapshot } = helpers;

function previousMismatch(item) {
  const output = Number(item?.standard_output || 0);
  const versionId = Number(item?.standard_version_id || 0);
  const machineStandardId = Number(item?.machine_standard_id || 0);
  return output !== 0 || versionId !== 0 || machineStandardId !== 0;
}

test('non-product snapshot predicate preserves previous coercion and zero rules', () => {
  const cases = [
    {}, { standard_output: 0, standard_version_id: 0, machine_standard_id: 0 },
    { standard_output: '0.00', standard_version_id: null, machine_standard_id: '' },
    { standard_output: 0.1 }, { standard_version_id: '1' },
    { machine_standard_id: -1 }, { standard_output: 'invalid' },
    { standard_output: false, standard_version_id: false },
    { standard_output: '  ' }, { standard_output: -0 },
  ];
  for (const item of cases) assert.equal(hasNonProductSnapshotMismatch(item), previousMismatch(item));
});

test('parent non-product snapshot retains public 422 error contract', () => {
  assert.doesNotThrow(() => assertNonProductWorkSnapshot({ standard_output: '0' }));
  assert.throws(() => assertNonProductWorkSnapshot({ standard_output: 1 }), (error) =>
    error.status === 422 && error.code === 'NON_PRODUCT_WORK_SNAPSHOT_MISMATCH'
    && error.isPublic === true && error.message.includes('trong công đoạn'));
});

test('CVK non-product branch reuses predicate and keeps distinct error message', () => {
  const validate = source.slice(source.indexOf('async function validateApprovalSnapshot('), source.indexOf('async function createLegacyApprovedSnapshot('));
  assert.match(validate, /if \(hasNonProductSnapshotMismatch\(item\)\)/);
  assert.match(validate, /Ảnh chụp công việc khác không hợp lệ/);
  assert.match(validate, /createNonProductSnapshotMismatchError\(/);
  const helper = source.slice(source.indexOf('function createNonProductSnapshotMismatchError('), source.indexOf('function assertNonProductWorkSnapshot('));
  assert.match(helper, /NON_PRODUCT_WORK_SNAPSHOT_MISMATCH/);
});
