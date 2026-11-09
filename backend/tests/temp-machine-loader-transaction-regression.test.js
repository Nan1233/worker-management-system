'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../models/productionTempApprovalModel.js'), 'utf8');
const queryStart = source.indexOf('function buildTempMachineLineDefectsQuery(');
const queryEnd = source.indexOf('function buildApprovedMachineDefectsInsert(', queryStart);
const start = source.indexOf('function attachMachineLineDefects(');
const end = source.indexOf('// Build approved defect rows', start);
assert.ok(queryStart >= 0 && queryEnd > queryStart && start >= 0 && end > start, 'temp machine loader and builders must exist');

function createLoader({ lines, defects = [], failRead = false }) {
  const connection = { transaction: true };
  const calls = [];
  const context = {
    qRows: async (conn, sql, params) => {
      assert.strictEqual(conn, connection, 'reads must share the transaction connection');
      calls.push({ sql, params: Array.from(params) });
      if (failRead && calls.length === 2) throw new Error('defect read failed');
      return calls.length === 1 ? lines : defects;
    },
  };
  vm.runInNewContext(source.slice(queryStart, queryEnd) + '\n' + source.slice(start, end), context);
  return { load: vm.runInNewContext('getTempMachineLines', context), calls, connection };
}

test('loader reads lines then defects in the same transaction and preserves machine associations', async () => {
  const lines = [{ id: 9, machine_code: 'M9' }, { id: 10, machine_code: 'M10' }];
  const defects = [
    { id: 1, machine_line_id: 9, quantity: 2 },
    { id: 2, machine_line_id: 10, quantity: 3 },
    { id: 3, machine_line_id: 9, quantity: 4 },
  ];
  const { load, calls, connection } = createLoader({ lines, defects });
  const result = await load(45, connection);
  assert.equal(calls.length, 2);
  assert.match(calls[0].sql, /FROM production_temp_machine_lines/);
  assert.deepEqual(calls[0].params, [45]);
  assert.match(calls[1].sql, /FROM production_temp_machine_defects/);
  assert.deepEqual(calls[1].params, [9, 10]);
  assert.deepEqual(Array.from(result[0].defects, (row) => row.id), [1, 3]);
  assert.deepEqual(Array.from(result[1].defects, (row) => row.id), [2]);
  assert.equal(result[0].machine_code, 'M9');
});

test('loader skips defect read for empty machine-line list', async () => {
  const { load, calls, connection } = createLoader({ lines: [] });
  const result = await load(45, connection);
  assert.deepEqual(Array.from(result), []);
  assert.equal(calls.length, 1);
});

test('loader rejects invalid line ID before querying defects', async () => {
  for (const id of [0, null, 'invalid', -4, 1.25]) {
    const { load, calls, connection } = createLoader({ lines: [{ id: 9 }, { id }] });
    await assert.rejects(load(45, connection), (error) => {
      assert.equal(error.code, 'TEMP_MACHINE_LINE_INVALID_ID');
      assert.equal(error.status, 500);
      return true;
    });
    assert.equal(calls.length, 1, 'no defect SQL should execute after invalid line ID');
  }
});

test('loader propagates defect read errors without returning partial lines', async () => {
  const { load, calls, connection } = createLoader({ lines: [{ id: 9 }], failRead: true });
  await assert.rejects(load(45, connection), /defect read failed/);
  assert.equal(calls.length, 2);
});

test('loader retains empty defect arrays for machines without defects', async () => {
  const { load, connection } = createLoader({ lines: [{ id: 9 }, { id: 10 }], defects: [{ id: 2, machine_line_id: 9 }] });
  const result = await load(45, connection);
  assert.deepEqual(Array.from(result[1].defects), []);
  assert.deepEqual(Array.from(result[0].defects, (row) => row.id), [2]);
});

test('loader rejects orphan defect from database before returning any machine lines', async () => {
  const { load, calls, connection } = createLoader({
    lines: [{ id: 9 }, { id: 10 }],
    defects: [{ id: 33, machine_line_id: 999, quantity: 4 }],
  });
  await assert.rejects(load(45, connection), error =>
    error.code === 'TEMP_MACHINE_DEFECT_LINEAGE_MISMATCH' && error.status === 500);
  assert.equal(calls.length, 2);
});

test('loader rejects normalized duplicate machine-line IDs before defect query', async () => {
  const { load, calls, connection } = createLoader({
    lines: [{ id: '009' }, { id: 9 }],
  });
  await assert.rejects(load(45, connection), error =>
    error.code === 'TEMP_MACHINE_LINE_DUPLICATE_ID' && error.status === 500);
  assert.equal(calls.length, 1);
});

test('loader preserves decimal defect quantities and does not modify database rows', async () => {
  const lines = [{ id: 9, machine_code: 'M9' }, { id: 10, machine_code: 'M10' }];
  const defects = [{ id: 1, machine_line_id: 9, quantity: '2.000000' },
    { id: 2, machine_line_id: 10, quantity: '0.250000' }];
  const { load, connection } = createLoader({ lines, defects });
  const result = await load(45, connection);
  assert.equal(result[0].defects[0].quantity, '2.000000');
  assert.equal(result[1].defects[0].quantity, '0.250000');
  assert.equal(lines[0].defects, undefined);
  assert.strictEqual(result[0].defects[0], defects[0]);
});
