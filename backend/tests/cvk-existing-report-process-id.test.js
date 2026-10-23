'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function loadController(queries) {
  const target = require.resolve('../controllers/productionTempController');
  delete require.cache[target];
  const original = Module._load;
  const stub = (exports) => exports;
  Module._load = function (request, parent, ...rest) {
    if (/config\/db$/.test(request)) {
      return { promise: () => ({ query: async (sql, params) => { queries.push({ sql, params }); return [[]]; } }) };
    }
    if (/productionTempWorkerController$/.test(request)) return { createTempReport: async () => 'worker' };
    if (/productionTempManagementController$/.test(request)) return {};
    if (/models\/productionTempModel$/.test(request)) return {};
    if (/standardResolutionService$/.test(request)) return { resolveStandard: async () => ({}) };
    if (/rejectSelectedTempReportsService$/.test(request)) return { rejectSelectedTempReports: async () => ({}) };
    if (/duplicateConfirmationService$/.test(request)) return { issueDuplicateConfirmation: () => 't' };
    if (/logicalDuplicateReportService$/.test(request)) return { buildLogicalDuplicateKey: () => 'k' };
    return original.call(this, request, parent, ...rest);
  };
  try { return stub(require(target)); } finally { Module._load = original; }
}

test('CVK duplicate pre-check covers the real (30002) and legacy (60006) process ids', async () => {
  const queries = [];
  const controller = loadController(queries);
  const res = { status() { return this; }, json() { return this; } };
  await controller.createTempReport({
    user: { worker_id: 5 },
    body: { process_id: 30002, process_code: 'CVK', work_date: '2026-10-01', shift: 'DAY', extra_data: { work_type: 'VỆ SINH' } },
  }, res, () => {});
  assert.ok(queries.length >= 2, 'both temp and approved tables are checked');
  for (const q of queries) {
    assert.match(q.sql, /process_id IN \(30002, 60006\)/);
    assert.doesNotMatch(q.sql, /process_id=60006/);
  }
});
