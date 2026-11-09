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

test('approved machine lines must belong to the target approved report', () => {
  const saved = [{ machine_code: 'M1', product_code: 'P1' }];
  const valid = [{ id: 101, report_id: 5001, machine_code: 'M1', product_code: 'P1' }];
  assert.equal(verify(valid, saved, 9, 5001).length, 1);
  for (const report_id of [5002, null, 0, 'invalid']) {
    assert.throws(() => verify([{ ...valid[0], report_id }], saved, 9, 5001),
      (error) => error.code === 'APPROVED_MACHINE_LINES_COPY_MISMATCH');
  }
  const { report_id, ...missing } = valid[0];
  assert.throws(() => verify([missing], saved, 9, 5001),
    (error) => error.code === 'APPROVED_MACHINE_LINES_COPY_MISMATCH');
});

test('identical machine identity cannot conceal swapped output and NG quantities', () => {
  const originals = [
    { machine_code: 'M1', product_code: 'P1', sort_order: 1, ok_quantity: '100.000000', ng_quantity: '2.000000' },
    { machine_code: 'M1', product_code: 'P1', sort_order: 1, ok_quantity: '80.000000', ng_quantity: '4.000000' },
  ];
  const valid = originals.map((line, i) => ({ ...line, id: 101 + i, report_id: 5001 }));
  assert.equal(verify(valid, originals, 9, 5001).length, 2);
  fails(valid.map((row, i) => ({ ...row, ok_quantity: originals[1 - i].ok_quantity })), originals);
  fails(valid.map((row, i) => ({ ...row, ng_quantity: originals[1 - i].ng_quantity })), originals);
});

test('machine quantity verification accepts equivalent TiDB decimal representations', () => {
  const source = { machine_code: 'M1', product_code: 'P1', machine_time_hours: '01.500000',
    standard_output: '100', ok_quantity: 5, ng_quantity: '0.000000',
    counted_output: null, deduction_time_hours: null, earned_standard_hours: '0.50' };
  const persisted = { id: 101, report_id: 5001, machine_code: 'M1', product_code: 'P1',
    machine_time_hours: '1.5', standard_output: '100.000000', ok_quantity: '5.000000',
    ng_quantity: 0, counted_output: '0.000000', deduction_time_hours: 0,
    earned_standard_hours: '0.500000' };
  assert.equal(verify([persisted], [source], 9, 5001).length, 1);
});

test('machine quantity verification rejects fractional changes without floating-point rounding', () => {
  const source = [{ machine_code: 'M1', product_code: 'P1', ok_quantity: '9007199254740993.000001' }];
  fails([{ id: 101, machine_code: 'M1', product_code: 'P1', ok_quantity: '9007199254740993.000002' }], source);
  fails([{ id: 101, machine_code: 'M1', product_code: 'P1', ok_quantity: 'invalid' }], source);
});
