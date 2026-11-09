'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../models/productionTempApprovalModel.js'), 'utf8');
function extract(startToken, endToken) {
  const start = source.indexOf(startToken);
  const end = source.indexOf(endToken, start);
  assert.ok(start >= 0 && end > start, startToken + ' must exist');
  return source.slice(start, end);
}
const helpers = [
  extract('function buildApprovedMachineDefectsInsert(', 'function buildApprovedMachineLinesInsert('),
  extract('function buildApprovedMachineLinesRead(', 'function buildApprovedDetailCopyQuery('),
  extract('function verifyApprovedMachineLineCopy(', '// Copies the temp machine lines'),
  extract('function buildApprovedMachineDefectRows(', '// Keep the approved machine-line INSERT'),
  extract('async function copyMachineLinesToApproved(', 'function getExtraDataObject('),
].join('\n');

function setup({ approved, failAt = null }) {
  const connection = { transaction: true };
  const calls = [];
  const context = {
    buildApprovedMachineLinesInsert: (lines, reportId) => ({
      sql: 'INSERT_LINES', params: [reportId, lines.length],
    }),
    query: async (conn, sql, params) => {
      assert.strictEqual(conn, connection);
      calls.push({ sql, params: Array.from(params) });
      if (failAt && sql.includes(failAt)) throw new Error('SQL failure: ' + failAt);
    },
    qRows: async (conn, sql, params) => {
      assert.strictEqual(conn, connection);
      calls.push({ sql: 'READ_LINES', params: Array.from(params) });
      if (failAt === 'READ_LINES') throw new Error('SQL failure: READ_LINES');
      return approved;
    },
  };
  vm.runInNewContext(helpers, context);
  return { copy: vm.runInNewContext('copyMachineLinesToApproved', context), calls, connection };
}

const lines = [
  { id: 11, machine_code: 'M-1', product_code: 'P-1',
    defects: [{ defect_type_id: 8, defect_code: 'N8', defect_name: 'Scratch', quantity: '2.000000' }] },
  { id: 12, machine_code: 'M-2', product_code: 'P-2',
    defects: [{ defect_type_id: 9, defect_code: 'N9', defect_name: 'Crack', quantity: '3.000000' },
      { defect_type_id: 10, defect_code: 'N10', defect_name: 'Other', quantity: '1.000000' }] },
];
const approved = [
  { id: 501, report_id: 100, machine_code: 'M-1', product_code: 'P-1' },
  { id: 502, report_id: 100, machine_code: 'M-2', product_code: 'P-2' },
];

test('real verifier and defect mapper preserve parent lineage and decimal quantities', async () => {
  const { copy, calls, connection } = setup({ approved: [...approved].reverse() });
  const result = await copy(45, 100, connection, lines);
  assert.deepEqual(Array.from(result.ids), [501, 502]);
  assert.deepEqual(calls.map(c => c.sql), ['INSERT_LINES', 'READ_LINES', calls[2].sql]);
  assert.match(calls[2].sql, /INSERT INTO production_report_machine_defects/);
  assert.deepEqual(calls[2].params, [
    501, 8, 'N8', 'Scratch', '2.000000',
    502, 9, 'N9', 'Crack', '3.000000',
    502, 10, 'N10', 'Other', '1.000000',
  ]);
  assert.equal(calls[2].sql.split('?').length - 1, 15);
  assert.deepEqual(calls[1].params, [100]);
});

test('real verifier rejects missing approved line and never writes NG defects', async () => {
  const { copy, calls, connection } = setup({ approved: approved.slice(0, 1) });
  await assert.rejects(copy(45, 100, connection, lines), err =>
    err.code === 'APPROVED_MACHINE_LINES_COPY_MISMATCH' && err.status === 500);
  assert.deepEqual(calls.map(c => c.sql), ['INSERT_LINES', 'READ_LINES']);
});

test('real verifier rejects swapped product code before writing defects', async () => {
  const invalid = [{ ...approved[0], product_code: 'OTHER' }, approved[1]];
  const { copy, calls, connection } = setup({ approved: invalid });
  await assert.rejects(copy(45, 100, connection, lines), err =>
    err.code === 'APPROVED_MACHINE_LINES_COPY_MISMATCH');
  assert.equal(calls.length, 2);
});

test('NG defect insert failure propagates to caller for transaction rollback', async () => {
  const { copy, calls, connection } = setup({ approved, failAt: 'INSERT INTO production_report_machine_defects' });
  await assert.rejects(copy(45, 100, connection, lines), /SQL failure: INSERT INTO production_report_machine_defects/);
  assert.equal(calls.length, 3);
  assert.match(calls[2].sql, /INSERT INTO production_report_machine_defects/);
});
