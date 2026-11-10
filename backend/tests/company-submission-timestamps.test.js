'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { attachSubmissionTimestamps, DEFAULT_BATCH_SIZE } =
  require('../services/companySubmissionTimestamps');

test('monthly Excel timestamps query at most 400 source IDs per TiDB request', async () => {
  const reports = Array.from({ length: 901 }, (_, i) => ({
    id: i + 1,
    source_temp_id: 10000 + i,
    submitted_at: null,
  }));
  const calls = [];
  const data = { GC: { reports: reports.slice(0, 601) }, MAI: { reports: reports.slice(601) } };
  await attachSubmissionTimestamps(data, ['GC', 'MAI'], async (sql, params) => {
    calls.push({ sql, params });
    assert.match(sql, /DATE_FORMAT\(created_at, '%Y-%m-%d %H:%i:%s'\)/);
    assert.ok(params.length <= DEFAULT_BATCH_SIZE);
    assert.equal((sql.match(/\?/g) || []).length, params.length);
    return params.map((id) => ({ id, submitted_at: '2026-10-30 08:09:10' }));
  });

  assert.deepEqual(calls.map((x) => x.params.length), [400, 400, 101]);
  assert.equal(new Set(calls.flatMap((x) => x.params)).size, 901);
  assert.ok(reports.every((r) => r.submitted_at === '2026-10-30 08:09:10'));
});

test('duplicate source links are queried only once without dropping approved report timestamps', async () => {
  const data = {
    GC: { reports: [{ source_temp_id: 51 }, { source_temp_id: 51 }] },
    DO: { reports: [{ source_temp_id: 52 }] },
  };
  const calls = [];
  await attachSubmissionTimestamps(data, ['GC', 'DO'], async (_, params) => {
    calls.push(params);
    return params.map((id) => ({ id, submitted_at: String(id) }));
  });
  assert.deepEqual(calls, [[51, 52]]);
  assert.equal(data.GC.reports[0].submitted_at, '51');
  assert.equal(data.GC.reports[1].submitted_at, '51');
  assert.equal(data.DO.reports[0].submitted_at, '52');
});

test('reports without a source link retain previous valid timestamp and do not cause DB queries', async () => {
  const data = {
    GC: { reports: [
      { source_temp_id: null, submitted_at: '2026-10-30 07:00:00' },
      { source_temp_id: 0, submitted_at: '2026-10-30 07:01:00' },
      { source_temp_id: 'invalid', submitted_at: '2026-10-30 07:02:00' },
    ] }
  };
  await attachSubmissionTimestamps(data, ['GC'], async () => {
    throw new Error('SQL should not execute');
  });
  assert.deepEqual(data.GC.reports.map((r) => r.submitted_at),
    ['2026-10-30 07:00:00', '2026-10-30 07:01:00', '2026-10-30 07:02:00']);
});

test('missing source row never wipes an existing historical timestamp', async () => {
  const report = { source_temp_id: 77, submitted_at: '2026-09-01 08:00:00' };
  const data = { GC: { reports: [report] } };
  await attachSubmissionTimestamps(data, ['GC'], async () => []);
  assert.equal(report.submitted_at, '2026-09-01 08:00:00');
});

test('query errors fail closed; company Excel is never silently returned partially enriched', async () => {
  const reports = Array.from({ length: 450 }, (_, i) => ({
    source_temp_id: i + 1, submitted_at: 'unchanged'
  }));
  let calls = 0;
  await assert.rejects(
    attachSubmissionTimestamps({ GC: { reports } }, ['GC'], async () => {
      if (++calls === 2) throw new Error('connection temporarily unavailable');
      return [];
    }),
    /connection temporarily unavailable/
  );
  assert.equal(calls, 2);
  assert.ok(reports.every((r) => r.submitted_at === 'unchanged'));
});

test('query chunk sizes must remain within safe deterministic bounds', async () => {
  for (const batchSize of [0, -1, 501, NaN, 1.5]) {
    await assert.rejects(
      attachSubmissionTimestamps({}, [], async () => [], { batchSize }),
      /invalid submission timestamp batch size/
    );
  }
});
