'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../models/productionTempApprovalModel.js'), 'utf8');
const start = source.indexOf('async function copyMachineLinesToApproved(');
const end = source.indexOf('function getExtraDataObject(', start);
assert.ok(start >= 0 && end > start, 'approved machine copy function must exist');
const copy = source.slice(start, end);

function inOrder(markers) {
  const positions = markers.map((marker) => copy.indexOf(marker));
  assert.ok(positions.every((position) => position >= 0),
    'missing copy step: ' + markers.filter((_, index) => positions[index] < 0).join(', '));
  assert.ok(positions.every((position, index) => index === 0 || positions[index - 1] < position),
    'machine copy ordering changed: ' + JSON.stringify(positions));
}

test('machine line copy verifies persisted rows before creating or inserting defects', () => {
  inOrder([
    'buildApprovedMachineLinesInsert(tempLines, approvedReportId)',
    'await query(connection, machineInsertSql, machineInsertParams)',
    'buildApprovedMachineLinesRead(approvedReportId)',
    'await qRows(connection, approvedLinesSql, approvedLinesParams)',
    'verifyApprovedMachineLineCopy(approvedRows, tempLines, tempReportId)',
    'buildApprovedMachineDefectRows(tempLines, byInsertOrder)',
    'buildApprovedMachineDefectsInsert(pendingDefects)',
    'await query(connection, defectInsertSql, defectInsertParams)',
  ]);
});

test('approved machine defects and line rows use the same transaction connection', () => {
  assert.match(copy, /await query\(connection, machineInsertSql, machineInsertParams\)/);
  assert.match(copy, /await qRows\(connection, approvedLinesSql, approvedLinesParams\)/);
  assert.match(copy, /await query\(connection, defectInsertSql, defectInsertParams\)/);
  assert.doesNotMatch(copy, /await (?:commit|beginTransaction)\(/);
});

test('empty machine line input skips all inserts and defect writes', () => {
  inOrder([
    'const tempLines = preloadedTempLines || await getTempMachineLines(tempReportId, connection)',
    'if (!tempLines.length) return { ids: [], rows: [] }',
    'buildApprovedMachineLinesInsert(tempLines, approvedReportId)',
  ]);
  assert.match(copy, /if \(pendingDefects\.length\) \{/);
});
