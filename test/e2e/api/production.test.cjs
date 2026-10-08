'use strict';

// Worker submits the GC 2-machine report through the real API and reads it back
// through the API (the DB layer verifies the same flow against the tables).

const test = require('node:test');
const assert = require('node:assert/strict');
const { useWriteContext, needs } = require('./context.cjs');

const write = useWriteContext('api');

const linesOf = (data) => {
  const report = data?.data || data;
  return report?.machine_lines || report?.machineLines || [];
};

test('worker submits GC report with 2 machine lines -> 201 and reads it back with 2 separate lines', needs(write, async () => {
  const worker = await write.worker();
  const { response, lines } = await write.submitGc(worker);
  assert.equal(response.status, 201, JSON.stringify(response.data)?.slice(0, 300));
  const id = response.data?.id || response.data?.data?.id;
  assert.ok(id, 'created id returned');

  const detail = await worker.req('GET', `/api/production-temp/${id}`);
  assert.equal(detail.status, 200);
  const stored = linesOf(detail.data);
  assert.equal(stored.length, 2);
  for (const expected of lines) {
    const line = stored.find((l) => String(l.machine_code) === String(expected.machine_code));
    assert.ok(line, `line for machine ${expected.machine_code}`);
    assert.equal(Number(line.machine_time_hours), expected.machine_time_hours);
    assert.equal(Number(line.ok_quantity), expected.ok_quantity);
    assert.equal(Number(line.ng_quantity), expected.ng_quantity);
  }

  const mine = await worker.req('GET', '/api/production-temp/my');
  assert.equal(mine.status, 200);
  assert.ok(JSON.stringify(mine.data).includes(String(id)), 'report listed in worker history');
}));

test('re-sending the same client_request_id does not create a second report', needs(write, async () => {
  const worker = await write.worker();
  const first = await write.submitGc(worker, '-idem');
  assert.equal(first.response.status, 201);
  const again = await worker.req('POST', '/api/production-temp', first.payload);
  assert.ok(again.status < 500, `HTTP ${again.status}`);
  const rows = await require('../lib/db-helpers.cjs').tempReportByNote(write.ctx.db, `${write.runId}-idem`);
  assert.equal(rows.length, 1, 'idempotent submit');
}));
