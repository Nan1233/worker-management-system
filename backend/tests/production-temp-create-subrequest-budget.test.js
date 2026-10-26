'use strict';
// Behavioural guard for the Cloudflare Workers subrequest budget: every SQL statement (and every
// BEGIN/COMMIT/ROLLBACK) of POST /api/production-temp is one TiDB HTTP subrequest.
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function setup({ supportsBeginIsolation, dailyHours = 0, existingRequest = false, processCode = 'EP' }) {
  const log = [];
  let nextId = 1000;
  const answer = (rawSql) => {
    const sql = String(rawSql).replace(/\s+/g, ' ');
    if (/LAST_INSERT_ID/i.test(sql)) return [{ insertId: nextId }];
    if (/SUM\((?:group_hours|counted_hours)\)/i.test(sql)) return [{ counted_hours: dailyHours }];
    if (/training_percent FROM workers/i.test(sql)) return [{ training_percent: 100 }];
    if (/FROM processes/i.test(sql)) return [{ process_code: processCode }];
    if (existingRequest && /FROM production_reports_temp WHERE worker_id = \? AND client_request_id/i.test(sql)) return [{ id: 77, status: 'pending' }];
    if (/^\s*INSERT/i.test(sql)) { nextId += 1; return { insertId: /duplicate_locks/.test(sql) ? 0 : nextId, affectedRows: 1 }; }
    return [];
  };
  const record = (sql) => log.push(String(sql).replace(/\s+/g, ' ').trim());
  const conn = {
    supportsBeginIsolation,
    query(sql, params, cb) { if (typeof params === 'function') cb = params; record(sql); const r = answer(sql); setImmediate(() => cb(null, r, [])); },
    beginTransaction(a, b) { const cb = typeof a === 'function' ? a : b; record(`BEGIN${a && typeof a === 'object' ? ` ${a.isolation}` : ''}`); setImmediate(() => cb(null)); },
    commit(cb) { record('COMMIT'); setImmediate(() => cb(null)); },
    rollback(cb) { record('ROLLBACK'); setImmediate(() => cb(null)); },
    release() {},
  };
  const fakeDb = { getConnection(cb) { setImmediate(() => cb(null, conn)); }, query(sql, p, cb) { record(sql); (typeof p === 'function' ? p : cb)(null, answer(sql), []); } };
  const target = require.resolve('../models/productionTempCreateModel');
  // These modules capture config/db at require time, so each scenario needs a fresh copy.
  for (const name of ['../models/productionTempCreateModel', '../models/productionTempModelShared', '../services/factoryMachineRuleService', '../services/trainingSnapshotService', '../services/auditService']) {
    try { delete require.cache[require.resolve(name)]; } catch { /* optional module */ }
  }
  const original = Module._load;
  Module._load = function (request, parent, ...rest) {
    if (/config\/db$/.test(request)) return fakeDb;
    return original.call(this, request, parent, ...rest);
  };
  let Model;
  try { Model = require(target); } finally { Module._load = original; }
  return { Model, log };
}

const baseData = () => ({ worker_id: 7, process_id: 3, work_date: '2026-10-23', shift: 'DAY', client_request_id: 'req-1', actual_time: 4, total_time: 4, tt_ok: 10, tt_ng: 0, operation_mode: 'MANUAL', product_name: 'P1', extra_data: {} });
const machineLine = (i) => ({ machine_code: `M${i}`, product_code: 'P1', machine_time_hours: 1, ok_quantity: 5, ng_quantity: 1, defects: [{ defect_type_id: 1, defect_code: 'a', defect_name: 'a', quantity: 1 }], deductions: [] });
const run = (Model, extra = {}) => Model.createCompleteReport({ data: baseData(), defects: [{ defect_type_id: 1, quantity: 1 }], deductions: [{ deduction_type_id: 1, hours: 0.5 }], machineLines: [], audit: { userId: 9 }, ...extra });

test('Worker path: READ COMMITTED travels with BEGIN, no separate SET TRANSACTION subrequest', async () => {
  const { Model, log } = setup({ supportsBeginIsolation: true });
  await run(Model);
  assert.ok(log.includes('BEGIN READ COMMITTED'));
  assert.ok(!log.some((sql) => /SET TRANSACTION/i.test(sql)));
});

test('Non-Worker (pooled MySQL) path keeps SET TRANSACTION before BEGIN', async () => {
  const { Model, log } = setup({ supportsBeginIsolation: false });
  await run(Model);
  assert.match(log[0], /SET TRANSACTION ISOLATION LEVEL READ COMMITTED/);
  assert.equal(log[1], 'BEGIN');
});

test('no LAST_INSERT_ID lookup for hash-keyed duplicate locks, no cleanup queries for a new report, process_code read once', async () => {
  const { Model, log } = setup({ supportsBeginIsolation: true });
  await run(Model);
  assert.equal(log.filter((sql) => /LAST_INSERT_ID/i.test(sql)).length, 0);
  assert.equal(log.filter((sql) => /^(SELECT id, machine_event_id, machine_code|DELETE FROM production_temp_machine_(lines|defects))/i.test(sql)).length, 0);
  assert.equal(log.filter((sql) => /^SELECT process_code FROM processes/i.test(sql)).length, 1);
});

test('transaction subrequest budget stays bounded (<=24 without machine, <=30 with 4 machine lines)', async () => {
  const none = setup({ supportsBeginIsolation: true });
  await run(none.Model);
  assert.ok(none.log.length <= 24, `got ${none.log.length}`);
  const four = setup({ supportsBeginIsolation: true });
  await run(four.Model, { machineLines: [0, 1, 2, 3].map(machineLine) });
  assert.ok(four.log.length <= 30, `got ${four.log.length}`);
});

test('12-hour daily limit is still enforced and the transaction is rolled back without inserting', async () => {
  const { Model, log } = setup({ supportsBeginIsolation: true, dailyHours: 9 });
  await assert.rejects(() => run(Model), (error) => error.code === 'DAILY_WORKING_HOURS_LIMIT_EXCEEDED' && error.status === 422);
  assert.equal(log.at(-1), 'ROLLBACK');
  assert.ok(!log.some((sql) => /^INSERT INTO production_reports_temp/i.test(sql)));
});

test('GC daily cap counts machine_time_hours minus deductions when actual_time_hours is absent', async () => {
  const { Model, log } = setup({ supportsBeginIsolation: true, dailyHours: 9, processCode: 'GC' });
  const data = { ...baseData(), actual_time: 0, _daily_hours_machine_lines: [{ machine_time_hours: 4, deduction_time_hours: 0.5 }] };
  await assert.rejects(
    () => Model.createCompleteReport({ data, defects: [], deductions: [], machineLines: [], audit: { userId: 9 } }),
    (error) => error.code === 'DAILY_WORKING_HOURS_LIMIT_EXCEEDED' && error.status === 422
  );
  assert.equal(log.at(-1), 'ROLLBACK');
  assert.ok(!log.some((sql) => /^INSERT INTO production_reports_temp/i.test(sql)));
});

test('re-submitting the same client_request_id returns the existing report and writes nothing', async () => {
  const { Model, log } = setup({ supportsBeginIsolation: true, existingRequest: true });
  const result = await run(Model);
  assert.equal(result.duplicate, true);
  assert.equal(result.id, 77);
  assert.ok(!log.some((sql) => /^INSERT INTO production_reports_temp/i.test(sql)));
  assert.equal(log.at(-1), 'COMMIT');
});
