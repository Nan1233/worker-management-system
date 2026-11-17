'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { findExistingCvkReport } = require('../models/productionCvkLookupModel');

const selection = {
  workerId: 49,
  workDate: '2026-11-11',
  shift: 'A',
  workType: 'Kiểm tra'
};

test('CVK lookup returns pending report without querying approved reports', async () => {
  const queries = [];
  const pending = { id: 7, report_type: 'temp' };
  const result = await findExistingCvkReport(selection, async (sql, params) => {
    queries.push({ sql, params });
    return [[pending]];
  });

  assert.strictEqual(result, pending);
  assert.equal(queries.length, 1);
  assert.match(queries[0].sql, /production_reports_temp/);
  assert.deepEqual(queries[0].params, [49, '2026-11-11', 'A', 'Kiểm tra']);
});

test('CVK lookup falls back to approved report when no active temporary report exists', async () => {
  const queries = [];
  const approved = { id: 8, report_type: 'approved' };
  const result = await findExistingCvkReport(selection, async (sql) => {
    queries.push(sql);
    return queries.length === 1 ? [[]] : [[approved]];
  });

  assert.strictEqual(result, approved);
  assert.match(queries[0], /production_reports_temp/);
  assert.match(queries[1], /FROM production_reports\s/);
});

test('CVK lookup rejects incomplete selection before any database query', async () => {
  let calls = 0;
  const query = async () => { calls += 1; return [[]]; };
  assert.equal(await findExistingCvkReport({ ...selection, workerId: 0 }, query), null);
  assert.equal(await findExistingCvkReport({ ...selection, workDate: 'bad-date' }, query), null);
  assert.equal(await findExistingCvkReport({ ...selection, workType: '' }, query), null);
  assert.equal(calls, 0);
});
