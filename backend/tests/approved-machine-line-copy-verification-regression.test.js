'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../models/productionTempApprovalModel.js'), 'utf8');
const start = source.indexOf('function verifyApprovedMachineLineCopy(');
const end = source.indexOf('// Copies the temp machine lines', start);
assert.ok(start >= 0 && end > start, 'machine line copy verifier must exist');
const verify = vm.runInNewContext(source.slice(start, end) + '\nverifyApprovedMachineLineCopy;', {});
const temp = [
  { machine_code: 'C2556-2', product_code: 'P-A' },
  { machine_code: 'C2556-8', product_code: 'P-B' },
];
const approved = [
  { id: 101, machine_code: 'C2556-2', product_code: 'P-A' },
  { id: 102, machine_code: 'C2556-8', product_code: 'P-B' },
];
function fails(rows, expected = temp) {
  assert.throws(() => verify(rows, expected, 9),
    (error) => error.code === 'APPROVED_MACHINE_LINES_COPY_MISMATCH'
      && error.status === 500 && error.isPublic === true);
}

test('valid approved machine lines are paired by insert ID order without mutating input', () => {
  const reversed = [...approved].reverse();
  const result = verify(reversed, temp, 9);
  assert.deepEqual(Array.from(result, (row) => row.id), [101, 102]);
  assert.deepEqual(reversed.map((row) => row.id), [102, 101]);
});

test('missing, extra, duplicate, invalid and unsafe approved line IDs fail closed', () => {
  fails(approved.slice(0, 1));
  fails([...approved, { id: 103, machine_code: 'C2556-9', product_code: 'P-C' }]);
  fails([{ ...approved[0] }, { ...approved[1], id: 101 }]);
  for (const id of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    fails([{ ...approved[0], id }, approved[1]]);
  }
});

test('swapped machine or product codes fail closed even when row counts match', () => {
  fails([{ ...approved[0], machine_code: 'C2556-8' }, approved[1]]);
  fails([{ ...approved[0], product_code: 'P-B' }, approved[1]]);
  fails([{ ...approved[1], id: 101 }, { ...approved[0], id: 102 }]);
});

test('same machine and product codes cannot hide a swapped event lineage', () => {
  const saved = [
    { machine_code: 'M1', product_code: 'P1', machine_event_id: 700, machine_id: 4 },
    { machine_code: 'M1', product_code: 'P1', machine_event_id: 701, machine_id: 4 },
  ];
  const persisted = [
    { id: 101, ...saved[1] },
    { id: 102, ...saved[0] },
  ];
  fails(persisted, saved);
  const correct = [{ id: 101, ...saved[0] }, { id: 102, ...saved[1] }];
  assert.equal(verify(correct, saved, 9).length, 2);
});

test('persisted standard identity mismatches fail closed even when codes match', () => {
  const saved = [{ machine_code: 'M1', product_code: 'P1',
    product_standard_id: 5, standard_version_id: 6, machine_standard_id: 7 }];
  const persisted = [{ id: 101, ...saved[0] }];
  assert.equal(verify(persisted, saved, 9).length, 1);
  for (const field of ['product_standard_id', 'standard_version_id', 'machine_standard_id']) {
    fails([{ ...persisted[0], [field]: 999 }], saved);
  }
});

test('missing optional source identities in legacy test fixtures remain compatible', () => {
  assert.equal(verify([{ id: 101, machine_code: 'M1', product_code: 'P1' }],
    [{ machine_code: 'M1', product_code: 'P1' }], 9).length, 1);
});

test('same machine, product and event cannot conceal swapped sort order', () => {
  const saved = [
    { machine_code: 'M1', product_code: 'P1', machine_event_id: 20, sort_order: 1 },
    { machine_code: 'M1', product_code: 'P1', machine_event_id: 20, sort_order: 2 },
  ];
  const persisted = [
    { id: 101, ...saved[1] },
    { id: 102, ...saved[0] },
  ];
  fails(persisted, saved);
  assert.equal(verify([{ id: 101, ...saved[0] }, { id: 102, ...saved[1] }], saved, 9).length, 2);
});

test('legacy sort order zero and null use the persisted default one', () => {
  const saved = [{ machine_code: 'M1', product_code: 'P1', sort_order: 0 }];
  assert.equal(verify([{ id: 101, machine_code: 'M1', product_code: 'P1', sort_order: 1 }], saved, 9).length, 1);
  fails([{ id: 101, machine_code: 'M1', product_code: 'P1', sort_order: 2 }], saved);
});

test('sort order identity is optional for legacy rows without the column', () => {
  assert.equal(verify([{ id: 101, machine_code: 'M1', product_code: 'P1' }],
    [{ machine_code: 'M1', product_code: 'P1', sort_order: 1 }], 9).length, 1);
});
