'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../models/productionTempApprovalModel.js'), 'utf8');
const begin = source.indexOf('function attachMachineLineDefects(');
const end = source.indexOf('async function getTempMachineLines(', begin);
assert.ok(begin !== -1 && end > begin, 'grouping helper must exist');
const attachMachineLineDefects = vm.runInNewContext(
  source.slice(begin, end) + '\nattachMachineLineDefects;',
  {},
);

function originalMapping(lines, defects) {
  const byLine = new Map();
  for (const defect of defects) {
    const key = Number(defect.machine_line_id);
    if (!byLine.has(key)) byLine.set(key, []);
    byLine.get(key).push(defect);
  }
  return lines.map((line) => ({ ...line, defects: byLine.get(Number(line.id)) || [] }));
}

test('machine defect grouping matches previous mapping for mixed ids and ordering', () => {
  const lines = [{ id: 102, machine_code: 'M06' }, { id: '101', machine_code: 'M05' }, { id: 103 }];
  const defects = [
    { id: 3, machine_line_id: '101', quantity: 2 },
    { id: 1, machine_line_id: 102, quantity: 4 },
    { id: 2, machine_line_id: 101, quantity: 5 },
  ];
  assert.deepEqual(JSON.parse(JSON.stringify(attachMachineLineDefects(lines, defects))), originalMapping(lines, defects));
  assert.deepEqual(attachMachineLineDefects(lines, defects)[1].defects.map((d) => d.id).join(','), '3,2');
  assert.equal(lines[0].defects, undefined);
});

test('machine defect grouping preserves empty inputs and duplicate line ids', () => {
  const samples = [
    { lines: [], defects: [] },
    { lines: [{ id: 1 }], defects: [] },
    { lines: [{ id: 1 }, { id: '1' }], defects: [{ machine_line_id: '1', quantity: 3 }] },
  ];
  for (const { lines, defects } of samples) {
    assert.deepEqual(JSON.parse(JSON.stringify(attachMachineLineDefects(lines, defects))), originalMapping(lines, defects));
  }
});

test('orphan defects now fail closed rather than being silently discarded', () => {
  assert.throws(
    () => attachMachineLineDefects([{ id: 1 }], [{ machine_line_id: 999 }]),
    (error) => error.code === 'TEMP_MACHINE_DEFECT_LINEAGE_MISMATCH',
  );
  assert.throws(
    () => attachMachineLineDefects([], [{ machine_line_id: 1 }]),
    (error) => error.code === 'TEMP_MACHINE_DEFECT_LINEAGE_MISMATCH',
  );
});

test('approval loader uses the pure grouping helper without additional SQL', () => {
  const loader = source.slice(source.indexOf('async function getTempMachineLines('), source.indexOf('// Copies the temp machine lines'));
  assert.match(loader, /return attachMachineLineDefects\(lines, defects\);/);
  assert.equal((loader.match(/await qRows\(/g) || []).length, 2);
});
