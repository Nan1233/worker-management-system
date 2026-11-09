'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../models/productionTempApprovalModel.js'), 'utf8');
const begin = source.indexOf('function verifyApprovedMachineLineCopy(');
const end = source.indexOf('// Copies the temp machine lines', begin);
assert.ok(begin >= 0 && end > begin, 'copy verification helper exists');
const verify = vm.runInNewContext(source.slice(begin, end) + '\nverifyApprovedMachineLineCopy;', {});

test('bulk machine copy sorts IDs and retains original row objects', () => {
  const approvedRows = [{ id: 52, machine_code: 'M2', product_code: 'P2' }, { id: '51', machine_code: 'M1', product_code: 'P1' }];
  const tempLines = [{ machine_code: 'M1', product_code: 'P1' }, { machine_code: 'M2', product_code: 'P2' }];
  const ordered = verify(approvedRows, tempLines, 77);
  assert.deepEqual(Array.from(ordered, (row) => Number(row.id)), [51, 52]);
  assert.strictEqual(ordered[0], approvedRows[1]);
  assert.equal(approvedRows[0].id, 52);
});

test('bulk machine copy fails closed for count and machine/product mismatches', () => {
  const cases = [
    { rows: [], lines: [{ machine_code: 'M1', product_code: 'P1' }] },
    { rows: [{ id: 1, machine_code: 'M1', product_code: 'P2' }], lines: [{ machine_code: 'M1', product_code: 'P1' }] },
    { rows: [{ id: 1, machine_code: 'M2', product_code: 'P1' }], lines: [{ machine_code: 'M1', product_code: 'P1' }] },
  ];
  for (const { rows, lines } of cases) {
    assert.throws(() => verify(rows, lines, 77), (error) =>
      error.code === 'APPROVED_MACHINE_LINES_COPY_MISMATCH'
      && error.status === 500 && error.isPublic === true && error.message.includes('#77'));
  }
});

test('bulk machine copy fails closed for duplicate or invalid returned IDs', () => {
  const tempLines = [
    { machine_code: 'M1', product_code: 'P1' },
    { machine_code: 'M1', product_code: 'P1' },
  ];
  for (const ids of [
    [1, 1], [null, 2], [0, 2], [-1, 2], ['not-an-id', 2],
    [1.5, 2], [Number.MAX_SAFE_INTEGER + 1, 2],
  ]) {
    const rows = ids.map((id) => ({ id, machine_code: 'M1', product_code: 'P1' }));
    assert.throws(() => verify(rows, tempLines, 77), (error) =>
      error.code === 'APPROVED_MACHINE_LINES_COPY_MISMATCH'
      && error.status === 500 && error.isPublic === true && error.message.includes('#77'),
    'IDs ' + JSON.stringify(ids) + ' should be rejected');
  }
});

test('bulk machine copy retains String comparisons for numeric codes', () => {
  const rows = [{ id: 5, machine_code: 123, product_code: null }, { id: 6, machine_code: '123', product_code: null }];
  const lines = [{ machine_code: '123', product_code: null }, { machine_code: 123, product_code: null }];
  assert.deepEqual(Array.from(verify(rows, lines, 8), (row) => row.id), [5, 6]);
});

test('approval copy verifies rows before inserting defects without extra SELECT', () => {
  const a = source.indexOf('async function copyMachineLinesToApproved(');
  const b = source.indexOf('function getExtraDataObject(', a);
  const copy = source.slice(a, b);
  assert.ok(copy.includes('verifyApprovedMachineLineCopy(approvedRows, tempLines, tempReportId, approvedReportId)'));
  assert.ok(copy.indexOf('verifyApprovedMachineLineCopy(') < copy.indexOf('buildApprovedMachineDefectRows('));
  const readBuilder = source.slice(source.indexOf('function buildApprovedMachineLinesRead('), source.indexOf('module.exports = {'));
  assert.match(copy, /buildApprovedMachineLinesRead\(approvedReportId\)/);
  assert.equal((readBuilder.match(/SELECT \* FROM production_report_machine_lines/g) || []).length, 1);
});
