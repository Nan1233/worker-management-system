'use strict';
// Regression test: validateMachineWorkerCapacity() referenced a bare `db`
// identifier that was never declared in its own scope (unlike loadMachineRows,
// which does `const db = getDb();`). Every call that reached the per-machine
// usage query threw "ReferenceError: db is not defined", which crashed
// createTempReport with an unhandled 500 and surfaced to the worker as a
// generic network-error toast (Cloudflare log: "CREATE TEMP REPORT ERROR: at
// validateMachineWorkerCapacity ... at createTempReport").
//
// This test mocks ../config/db (the same require.cache pattern already used
// by logical-duplicate-transaction.test.js) so it runs without a real
// database connection, and exercises the exact code path that previously
// crashed: at least one machine line, a resolvable machine row, and a
// worker/workDate/shift set (the only combination that reaches the
// `db.promise().query(...)` usage-lookup inside the function).
const test = require('node:test');
const assert = require('node:assert/strict');

function loadWithFakeDb(queryResults) {
  const dbPath = require.resolve('../config/db');
  const servicePath = require.resolve('../services/factoryMachineRuleService');

  let callIndex = 0;
  const calls = [];
  const fakeDb = {
    promise() {
      return {
        query: async (sql, params) => {
          calls.push({ sql, params });
          const result = queryResults[callIndex] ?? [];
          callIndex += 1;
          return [result];
        },
      };
    },
  };

  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakeDb };
  delete require.cache[servicePath];
  const service = require(servicePath);
  return { service, calls };
}

test('validateMachineWorkerCapacity no longer throws "db is not defined" and actually runs the usage query', async () => {
  const { service, calls } = loadWithFakeDb([
    // 1st call: loadMachineRows -> the active machine row for GC machine "5"
    [{ id: 10, process_id: 1, machine_code: '5', is_automatic: 0, max_workers_per_machine: 2, output_basis: 'PRODUCT' }],
    // 2nd call: the per-machine worker-usage lookup that previously crashed
    [],
  ]);

  const result = await service.validateMachineWorkerCapacity({
    processCode: 'GC',
    processId: 1,
    machineLines: [{ machine_code: '5' }],
    workerId: 42,
    workDate: '2026-10-09',
    shift: 'A',
  });

  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(calls.length, 2, 'both the machine-row lookup and the usage query must have run without throwing');
});

test('validateMachineWorkerCapacity still rejects when a machine is already at capacity (no false negative introduced by the fix)', async () => {
  // DO is not in MULTI_MACHINE_PROCESS_CODES, so getProcessMachineRule() uses
  // the DB row's max_workers_per_machine directly (1 here) instead of the
  // GC/MAI shared-machine default of 4.
  const { service } = loadWithFakeDb([
    [{ id: 10, process_id: 3, machine_code: 'D1', is_automatic: 0, max_workers_per_machine: 1, output_basis: 'PRODUCT' }],
    [{ worker_id: 7, machine_code: 'D1' }],
  ]);

  const result = await service.validateMachineWorkerCapacity({
    processCode: 'DO',
    processId: 3,
    machineLines: [{ machine_code: 'D1' }],
    workerId: 42,
    workDate: '2026-10-09',
    shift: 'A',
  });

  assert.equal(result.valid, false);
  assert.match(result.errors.machine_lines, /chỉ cho phép tối đa 1 người/);
});
