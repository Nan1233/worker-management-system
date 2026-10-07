'use strict';

// NG detail is stored per machine line, both as defects_json and as
// production_*_machine_defects rows, and survives approval unchanged.

const test = require('node:test');
const assert = require('node:assert/strict');
const dbh = require('../lib/db-helpers.cjs');
const { writeArtifact } = require('../lib/reporter.cjs');
const { useWriteContext, needs } = require('../api/context.cjs');

const write = useWriteContext('db', { dayOffset: 6 });

const simplify = (items) => items
  .map((d) => ({ id: Number(d.defect_type_id), quantity: Number(d.quantity) }))
  .filter((d) => d.quantity > 0)
  .sort((a, b) => a.id - b.id);

function assertDefects(stored, lines, label) {
  for (const expected of lines) {
    const line = stored.find((l) => String(l.machine_code) === String(expected.machine_code));
    assert.ok(line, `${label}: line ${expected.machine_code}`);
    assert.deepEqual(simplify(line.defectRows), simplify(expected.defects), `${label}: defect rows of machine ${expected.machine_code}`);
    assert.deepEqual(simplify(line.defectsJson), simplify(expected.defects), `${label}: defects_json of machine ${expected.machine_code}`);
    const total = line.defectRows.reduce((s, d) => s + Number(d.quantity), 0);
    assert.equal(total, Number(line.ng_quantity), `${label}: NG detail equals ng_quantity`);
  }
}

test('temp: each line stores only its own defects; detail equals NG', needs(write, async () => {
  const worker = await write.worker();
  const { response, lines } = await write.submitGc(worker);
  assert.equal(response.status, 201, JSON.stringify(response.data)?.slice(0, 300));
  const [temp] = await dbh.tempReportByNote(write.ctx.db, write.runId);
  const stored = await dbh.tempMachineLines(write.ctx.db, temp.id);
  writeArtifact('db', 'temp-line-defects.json', stored.map((l) => ({ machine: l.machine_code, ng: l.ng_quantity, rows: l.defectRows, json: l.defectsJson })));
  assertDefects(stored, lines, 'temp');
}));

test('approved: defects per line are copied once, unchanged', needs(write, async () => {
  const worker = await write.worker();
  const { response, lines } = await write.submitGc(worker, '-approve');
  assert.equal(response.status, 201);
  const tempId = response.data?.id || response.data?.data?.id;
  const manager = await write.manager();
  assert.equal((await manager.req('POST', '/api/production-temp/approve-selected', { ids: [tempId] })).status, 200);
  const [report] = await dbh.approvedReportForTemp(write.ctx.db, tempId);
  const stored = await dbh.approvedMachineLines(write.ctx.db, report.id);
  writeArtifact('db', 'approved-line-defects.json', stored.map((l) => ({ machine: l.machine_code, ng: l.ng_quantity, rows: l.defectRows, json: l.defectsJson })));
  assertDefects(stored, lines, 'approved');
}));
