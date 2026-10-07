'use strict';

// Deductions are stored per machine line (deductions_json + deduction_time_hours)
// and never leak from one line into the other.

const test = require('node:test');
const assert = require('node:assert/strict');
const dbh = require('../lib/db-helpers.cjs');
const { writeArtifact } = require('../lib/reporter.cjs');
const { useWriteContext, needs } = require('../api/context.cjs');

const write = useWriteContext('db', { dayOffset: 5 });

const simplify = (items) => items
  .map((d) => ({ id: Number(d.deduction_type_id), hours: Number(d.hours) }))
  .sort((a, b) => a.id - b.id);

test('each machine line keeps exactly its own deduction types and hours', needs(write, async () => {
  const worker = await write.worker();
  const { response, lines } = await write.submitGc(worker);
  assert.equal(response.status, 201, JSON.stringify(response.data)?.slice(0, 300));
  const [temp] = await dbh.tempReportByNote(write.ctx.db, write.runId);
  const stored = await dbh.tempMachineLines(write.ctx.db, temp.id);
  writeArtifact('db', 'temp-line-deductions.json', stored.map((l) => ({ machine: l.machine_code, deduction_time_hours: l.deduction_time_hours, deductions: l.deductions })));
  for (const expected of lines) {
    const line = stored.find((l) => String(l.machine_code) === String(expected.machine_code));
    assert.deepEqual(simplify(line.deductions), simplify(expected.deductions), `machine ${expected.machine_code}`);
    assert.equal(Number(line.deduction_time_hours), expected.deduction_time_hours);
    const sum = line.deductions.reduce((s, d) => s + Number(d.hours), 0);
    assert.ok(Math.abs(sum - Number(line.deduction_time_hours)) < 1e-6, 'breakdown sums to the line total');
  }
  const typesA = new Set(stored[0].deductions.map((d) => Number(d.deduction_type_id)));
  for (const d of stored[1].deductions) assert.ok(!typesA.has(Number(d.deduction_type_id)), 'no deduction type copied across lines');
}));
