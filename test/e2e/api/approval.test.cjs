'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const dbh = require('../lib/db-helpers.cjs');
const { useWriteContext, needs } = require('./context.cjs');

const write = useWriteContext('api', { dayOffset: 1 });

test('manager approves the GC report; approved copy keeps both machine lines', needs(write, async () => {
  const worker = await write.worker();
  const { response, lines } = await write.submitGc(worker);
  assert.equal(response.status, 201);
  const tempId = response.data?.id || response.data?.data?.id;

  const manager = await write.manager();
  const pending = await manager.req('GET', `/api/production-temp/pending?process_id=${write.ctx.fixture.gcProcessId}`);
  assert.equal(pending.status, 200);
  assert.ok(JSON.stringify(pending.data).includes(String(tempId)), 'report visible in pending list');

  const approval = await manager.req('POST', '/api/production-temp/approve-selected', { ids: [tempId] });
  assert.equal(approval.status, 200, JSON.stringify(approval.data)?.slice(0, 300));

  const [approved] = await dbh.approvedReportForTemp(write.ctx.db, tempId);
  assert.ok(approved, 'production_reports row created from the temp report');
  const detail = await manager.req('GET', `/api/production/${approved.id}`);
  assert.equal(detail.status, 200);
  const stored = detail.data?.data?.machine_lines || detail.data?.data?.machineLines || [];
  assert.equal(stored.length, lines.length);

  const second = await manager.req('POST', '/api/production-temp/approve-selected', { ids: [tempId] });
  assert.ok(second.status < 500, `re-approve must not crash (HTTP ${second.status})`);
  assert.equal((await dbh.approvedReportForTemp(write.ctx.db, tempId)).length, 1, 're-approve does not duplicate the approved report');
}));

test('worker cannot approve their own report', needs(write, async () => {
  const worker = await write.worker();
  const { response } = await write.submitGc(worker, '-self');
  assert.equal(response.status, 201);
  const tempId = response.data?.id || response.data?.data?.id;
  const r = await worker.req('POST', '/api/production-temp/approve-selected', { ids: [tempId] });
  assert.equal(r.status, 403);
  assert.equal((await dbh.approvedReportForTemp(write.ctx.db, tempId)).length, 0);
}));
