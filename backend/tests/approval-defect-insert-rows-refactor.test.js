'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../models/productionTempApprovalModel.js'), 'utf8');
const begin = source.indexOf('function buildApprovedMachineDefectRows(');
const end = source.indexOf('// Copies the temp machine lines', begin);
assert.ok(begin >= 0 && end > begin, 'defect row builder exists');
const buildRows = vm.runInNewContext(source.slice(begin, end) + '\nbuildApprovedMachineDefectRows;', {});

function previousRows(tempLines, approvedLines) {
  const pendingDefects = [];
  tempLines.forEach((line, index) => {
    const approvedLineId = Number(approvedLines[index].id);
    for (const defect of line.defects || []) {
      pendingDefects.push([
        approvedLineId,
        defect.defect_type_id || null,
        defect.defect_code || null,
        defect.defect_name || null,
        defect.quantity || 0,
      ]);
    }
  });
  return pendingDefects;
}

test('approved defect rows preserve order, ids, and all SQL values', () => {
  const tempLines = [
    { id: 1, defects: [
      { defect_type_id: 9, defect_code: 'NG01', defect_name: 'Xước', quantity: 5 },
      { defect_type_id: 0, defect_code: '', defect_name: null, quantity: 0 },
    ] },
    { id: 2, defects: [{ defect_type_id: 11, defect_code: 'NG02', quantity: 2 }] },
  ];
  const approvedLines = [{ id: '701' }, { id: 702 }];
  assert.deepEqual(JSON.parse(JSON.stringify(buildRows(tempLines, approvedLines))), previousRows(tempLines, approvedLines));
  assert.equal(buildRows(tempLines, approvedLines).length, 3);
});

test('approved defect rows preserve empty and missing defects', () => {
  for (const [tempLines, approvedLines] of [
    [[], []],
    [[{ id: 1 }], [{ id: 7 }]],
    [[{ id: 1, defects: [] }, { id: 2, defects: [{ quantity: null }] }], [{ id: 7 }, { id: 8 }]],
  ]) {
    assert.deepEqual(JSON.parse(JSON.stringify(buildRows(tempLines, approvedLines))), previousRows(tempLines, approvedLines));
  }
});

test('approval copy calls extracted row builder and keeps single bulk defect insert', () => {
  const start = source.indexOf('async function copyMachineLinesToApproved(');
  const endCopy = source.indexOf('function getExtraDataObject(', start);
  const copy = source.slice(start, endCopy);
  assert.match(copy, /buildApprovedMachineDefectRows\(tempLines, byInsertOrder\)/);
  assert.match(copy, /INSERT INTO production_report_machine_defects/);
  assert.match(copy, /pendingDefects\.flat\(\)/);
  assert.equal((copy.match(/INSERT INTO production_report_machine_defects/g) || []).length, 1);
});
