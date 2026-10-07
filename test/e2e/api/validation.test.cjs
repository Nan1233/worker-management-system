'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const dbh = require('../lib/db-helpers.cjs');
const { useApi, useWriteContext, needs } = require('./context.cjs');

const api = useApi('api');
const write = useWriteContext('api', { dayOffset: 2 });

test('authentication runs before payload validation (no validation detail to anonymous callers)', async () => {
  const r = await api.client().req('POST', '/api/production-temp', { process_id: 'x', machine_lines: 'not-an-array' });
  assert.equal(r.status, 401);
  assert.doesNotMatch(JSON.stringify(r.data), /machine_lines|process_id/);
});

test('oversized query string is refused with 414', async () => {
  const r = await api.client().req('GET', `/api/health/live?q=${'x'.repeat(5000)}`);
  assert.equal(r.status, 414);
});

async function expectRejected(client, payload, label) {
  const r = await client.req('POST', '/api/production-temp', payload);
  assert.ok(r.status >= 400 && r.status < 500, `${label}: expected 4xx, got ${r.status} ${JSON.stringify(r.data)?.slice(0, 200)}`);
  return r;
}

test('GC payload validation: bad inputs are 4xx, never 5xx or 201', needs(write, async () => {
  const worker = await write.worker();
  const { fixture, db } = write.ctx;
  const master = await dbh.gcMasterData(db, fixture.gcProcessId);
  const lines = dbh.gcTwoMachineScenario({ machines: fixture.gcMachines, product: fixture.gcProduct, deductionTypes: master.deductions, defectTypes: master.defects });
  const base = (extra = {}) => ({ ...dbh.gcPayload({ processId: fixture.gcProcessId, lines, runId: `${write.runId}-invalid`, workDate: dbh.localDate(-2), shift: 'C' }), ...extra });

  await expectRejected(worker, base({ process_id: undefined }), 'missing process_id');
  await expectRejected(worker, base({ work_date: dbh.localDate(1) }), 'future work_date');
  await expectRejected(worker, base({ work_date: dbh.localDate(-15) }), 'work_date older than 14 days');
  await expectRejected(worker, base({ machine_lines: [{ ...lines[0], ok_quantity: -1 }] }), 'negative OK');
  await expectRejected(worker, base({ machine_lines: Array.from({ length: 5 }, () => lines[0]) }), 'more than 4 machine lines');
  await expectRejected(worker, base({ machine_lines: [{ ...lines[0], machine_code: 'E2E-NO-SUCH-MACHINE' }] }), 'unknown machine');

  const temps = await dbh.tempReportByNote(db, `${write.runId}-invalid`);
  assert.equal(temps.length, 0, 'rejected payloads left no rows behind');
}));

test('same machine twice in one report is rejected as 4xx (not a DB unique-key 500)', needs(write, async () => {
  const worker = await write.worker();
  const { fixture, db } = write.ctx;
  const master = await dbh.gcMasterData(db, fixture.gcProcessId);
  const [first] = dbh.gcTwoMachineScenario({ machines: fixture.gcMachines, product: fixture.gcProduct, deductionTypes: master.deductions, defectTypes: master.defects });
  const payload = dbh.gcPayload({ processId: fixture.gcProcessId, lines: [first, { ...first, ok_quantity: 1, ng_quantity: 0, defects: [] }], runId: `${write.runId}-dup-machine`, workDate: dbh.localDate(-2), shift: 'D' });
  const r = await worker.req('POST', '/api/production-temp', payload);
  assert.ok(r.status < 500, `server error ${r.status}: ${JSON.stringify(r.data)?.slice(0, 200)}`);
  if (r.status === 201) {
    const [temp] = await dbh.tempReportByNote(db, `${write.runId}-dup-machine`);
    const stored = await dbh.tempMachineLines(db, temp.id);
    assert.equal(stored.length, 2, 'if accepted, both lines must be stored');
  }
}));

test('manager approve-selected validates ids', needs(write, async () => {
  const manager = await write.manager();
  assert.equal((await manager.req('POST', '/api/production-temp/approve-selected', { ids: [] })).status, 400);
  assert.equal((await manager.req('POST', '/api/production-temp/approve-selected', { ids: ['abc'] })).status, 400);
}));
