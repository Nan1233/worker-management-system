'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../models/productionTempApprovalModel.js'), 'utf8');
const start = source.indexOf('async function copyMachineLinesToApproved(');
const end = source.indexOf('function getExtraDataObject(', start);
assert.ok(start >= 0 && end > start, 'machine-line copy function must exist');

function setup({ lines, persisted = [], defects = [], failOn = null }) {
  const calls = [];
  const connection = { tx: 1 };
  const context = {
    getTempMachineLines: async (id, conn) => {
      calls.push(['load', conn, id]);
      return lines;
    },
    buildApprovedMachineLinesInsert: (rows, id) => ({ sql: 'INSERT_LINES', params: [id, rows.length] }),
    buildApprovedMachineLinesRead: (id) => ({ sql: 'READ_LINES', params: [id] }),
    buildApprovedMachineDefectRows: (rows, approved) => {
      calls.push(['map_defects', connection]);
      assert.strictEqual(approved, persisted);
      return defects;
    },
    buildApprovedMachineDefectsInsert: (rows) => ({ sql: 'INSERT_DEFECTS', params: rows.flat() }),
    verifyApprovedMachineLineCopy: (rows, originals, tempId) => {
      calls.push(['verify', connection, tempId]);
      if (failOn === 'verify') throw new Error('machine copy mismatch');
      assert.strictEqual(rows, persisted);
      assert.strictEqual(originals, lines);
      return rows;
    },
    query: async (conn, sql, params) => {
      calls.push([sql, conn, params]);
      if (failOn === sql) throw new Error('write failed: ' + sql);
    },
    qRows: async (conn, sql, params) => {
      calls.push([sql, conn, params]);
      if (failOn === sql) throw new Error('read failed');
      return persisted;
    },
  };
  vm.runInNewContext(source.slice(start, end), context);
  return { copy: vm.runInNewContext('copyMachineLinesToApproved', context), calls, connection };
}

test('preloaded machine lines copy and verify before writing defects in same transaction', async () => {
  const lines = [{ id: 5, machine_code: 'M1' }];
  const persisted = [{ id: 205, machine_code: 'M1' }];
  const { copy, calls, connection } = setup({ lines, persisted, defects: [[205, 1, 'NG', 'Defect', 2]] });
  const result = await copy(9, 100, connection, lines);
  assert.deepEqual(Array.from(result.ids), [205]);
  assert.strictEqual(result.rows, persisted);
  assert.deepEqual(calls.map((c) => c[0]), ['INSERT_LINES', 'READ_LINES', 'verify', 'map_defects', 'INSERT_DEFECTS']);
  assert.ok(calls.every((c) => c[1] === connection));
  assert.deepEqual(calls[0][2], [100, 1]);
  assert.deepEqual(calls[4][2], [205, 1, 'NG', 'Defect', 2]);
});

test('no machine lines skips all database writes', async () => {
  const { copy, calls, connection } = setup({ lines: [] });
  const result = await copy(9, 100, connection, []);
  assert.deepEqual(Array.from(result.ids), []);
  assert.deepEqual(Array.from(result.rows), []);
  assert.deepEqual(calls.map((c) => c[0]), []);
});

test('verified lines without defects skip defect insert', async () => {
  const lines = [{ id: 5 }];
  const persisted = [{ id: 205 }];
  const { copy, calls, connection } = setup({ lines, persisted });
  await copy(9, 100, connection, lines);
  assert.deepEqual(calls.map((c) => c[0]), ['INSERT_LINES', 'READ_LINES', 'verify', 'map_defects']);
});

for (const failOn of ['INSERT_LINES', 'READ_LINES', 'verify', 'INSERT_DEFECTS']) {
  test('failure at ' + failOn + ' aborts subsequent copy steps', async () => {
    const lines = [{ id: 5 }];
    const persisted = [{ id: 205 }];
    const { copy, calls, connection } = setup({ lines, persisted, defects: [[205, 1, 'NG', 'Defect', 2]], failOn });
    await assert.rejects(copy(9, 100, connection, lines), /failed|mismatch/);
    const names = calls.map((c) => c[0]);
    assert.equal(names[names.length - 1], failOn);
    assert.ok(!names.slice(names.indexOf(failOn) + 1).includes('INSERT_DEFECTS'));
  });
}
