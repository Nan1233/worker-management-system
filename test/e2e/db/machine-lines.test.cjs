'use strict';

// Two machine lines in, two machine lines stored — each with its own numbers,
// before and after approval.

const test = require('node:test');
const assert = require('node:assert/strict');
const dbh = require('../lib/db-helpers.cjs');
const { writeArtifact } = require('../lib/reporter.cjs');
const { useWriteContext, needs } = require('../api/context.cjs');

const write = useWriteContext('db', { dayOffset: 4 });

function assertLine(stored, expected) {
  assert.equal(String(stored.machine_code), String(expected.machine_code));
  assert.equal(String(stored.product_code), String(expected.product_code));
  assert.equal(Number(stored.machine_time_hours), expected.machine_time_hours, `${expected.machine_code} time`);
  assert.equal(Number(stored.deduction_time_hours), expected.deduction_time_hours, `${expected.machine_code} deduction`);
  assert.equal(Number(stored.ok_quantity), expected.ok_quantity, `${expected.machine_code} OK`);
  assert.equal(Number(stored.ng_quantity), expected.ng_quantity, `${expected.machine_code} NG`);
}

test('temp report stores exactly 2 machine lines, each with its own data, no duplicates', needs(write, async () => {
  const worker = await write.worker();
  const { response, lines } = await write.submitGc(worker);
  assert.equal(response.status, 201, JSON.stringify(response.data)?.slice(0, 300));
  const [temp] = await dbh.tempReportByNote(write.ctx.db, write.runId);
  const stored = await dbh.tempMachineLines(write.ctx.db, temp.id);
  writeArtifact('db', 'temp-machine-lines.json', stored);
  assert.equal(stored.length, 2);
  assert.equal(new Set(stored.map((l) => l.machine_code)).size, 2, 'no duplicated machine');
  assert.deepEqual(stored.map((l) => Number(l.sort_order)), [1, 2]);
  assertLine(stored[0], lines[0]);
  assertLine(stored[1], lines[1]);
}));

test('approval copies the 2 lines once, values unchanged', needs(write, async () => {
  const worker = await write.worker();
  const { response, lines } = await write.submitGc(worker, '-approve');
  assert.equal(response.status, 201);
  const tempId = response.data?.id || response.data?.data?.id;
  const manager = await write.manager();
  const approval = await manager.req('POST', '/api/production-temp/approve-selected', { ids: [tempId] });
  assert.equal(approval.status, 200, JSON.stringify(approval.data)?.slice(0, 300));
  const reports = await dbh.approvedReportForTemp(write.ctx.db, tempId);
  assert.equal(reports.length, 1);
  const stored = await dbh.approvedMachineLines(write.ctx.db, reports[0].id);
  writeArtifact('db', 'approved-machine-lines.json', stored);
  assert.equal(stored.length, 2, 'approval does not duplicate or drop machine lines');
  assertLine(stored.find((l) => String(l.machine_code) === String(lines[0].machine_code)), lines[0]);
  assertLine(stored.find((l) => String(l.machine_code) === String(lines[1].machine_code)), lines[1]);
}));
