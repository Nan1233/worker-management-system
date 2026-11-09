'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../models/productionTempApprovalModel.js'), 'utf8');
const start = source.indexOf('function buildApprovedDetailCopyQuery(');
const end = source.indexOf('function buildApprovedVersionRequest(', start);
const copyStart = source.indexOf('async function copyApprovedReportDetails(');
const copyEnd = source.indexOf('async function recordApprovedTempVersion(', copyStart);
assert.ok(start >= 0 && end > start && copyStart >= 0 && copyEnd > copyStart);

function setup(failAt = -1) {
  const calls = [];
  const connection = { tag: 'single-review-transaction' };
  const ctx = {
    query: async (conn, sql, params) => {
      calls.push({ kind: 'write', conn, sql, params });
      if (calls.length === failAt) throw new Error('simulated detail write failure');
    },
    qRows: async (conn, sql, params) => {
      calls.push({ kind: 'read', conn, sql, params });
      if (calls.length === failAt) throw new Error('simulated detail read failure');
      return [{ id: calls.length }];
    },
  };
  vm.runInNewContext(source.slice(start, end) + '\n' + source.slice(copyStart, copyEnd), ctx);
  return { copy: vm.runInNewContext('copyApprovedReportDetails', ctx), calls, connection };
}

test('detail copy executes both writes before reads on one transaction connection', async () => {
  const { copy, calls, connection } = setup();
  const result = await copy(connection, 111, 222);
  assert.deepEqual(calls.map((call) => call.kind), ['write', 'write', 'read', 'read']);
  assert.ok(calls.every((call) => call.conn === connection));
  assert.deepEqual(calls.map((call) => Array.from(call.params)), [
    [111, 222], [111, 222], [111], [111],
  ]);
  assert.match(calls[0].sql, /INSERT INTO production_report_defects/);
  assert.match(calls[1].sql, /INSERT INTO production_report_deductions/);
  assert.match(calls[2].sql, /FROM production_report_defects/);
  assert.match(calls[3].sql, /FROM production_report_deductions/);
  assert.equal(result.approvedDefects[0].id, 3);
  assert.equal(result.approvedDeductions[0].id, 4);
});

test('failed deduction write stops all reads and propagates error to caller rollback', async () => {
  const { copy, calls, connection } = setup(2);
  await assert.rejects(copy(connection, 111, 222), /simulated detail write failure/);
  assert.deepEqual(calls.map((call) => call.kind), ['write', 'write']);
});

test('failed defect read stops deduction read and propagates error to caller rollback', async () => {
  const { copy, calls, connection } = setup(3);
  await assert.rejects(copy(connection, 111, 222), /simulated detail read failure/);
  assert.deepEqual(calls.map((call) => call.kind), ['write', 'write', 'read']);
});
