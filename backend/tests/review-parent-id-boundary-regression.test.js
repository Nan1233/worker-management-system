'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../models/productionTempApprovalModel.js'), 'utf8');
const start = source.indexOf('        const approvedReportId = Number(insertResult.insertId);');
const end = source.indexOf('        approvedIds.push(approvedReportId);', start);
assert.ok(start >= 0 && end > start);
const snippet = source.slice(start, end);

function validate(insertId) {
  const context = { insertResult: { insertId }, item: { id: 42 } };
  vm.runInNewContext(snippet + '\nthis.resultId = approvedReportId;', context);
  return context.resultId;
}

test('approved parent ID accepts positive safe integer boundaries', () => {
  for (const value of [1, '1', 123, String(Number.MAX_SAFE_INTEGER)]) {
    assert.equal(validate(value), Number(value));
  }
});

test('approved parent ID rejects invalid numeric boundaries and absent IDs', () => {
  for (const value of [0, '0', -1, '-1', 0.5, '1.1', NaN, Infinity, -Infinity, undefined, null, '', 'abc', Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => validate(value), (error) =>
      error.status === 500
      && error.code === 'APPROVED_PARENT_INSERT_ID_INVALID'
      && error.isPublic === true
      && error.message.includes('#42'));
  }
});

test('invalid parent ID throws before recording approved IDs and copying snapshots', () => {
  const flow = source.slice(source.indexOf('async approveSelected('), source.indexOf('async rejectSelected('));
  const checks = [
    'const approvedReportId = Number(insertResult.insertId)',
    'if (!Number.isSafeInteger(approvedReportId) || approvedReportId <= 0)',
    'approvedIds.push(approvedReportId)',
    'copyApprovedReportDetails(connection, approvedReportId, item.id)',
    'copyMachineLinesToApproved(item.id, approvedReportId, connection',
    'createLegacyApprovedSnapshot(item, approvedReportId, reviewerId, connection',
    'createApprovedReportVersion(',
  ];
  const positions = checks.map((marker) => flow.indexOf(marker));
  assert.ok(positions.every((position) => position >= 0), JSON.stringify(positions));
  assert.ok(positions.every((position, index) => index === 0 || positions[index - 1] < position));
});
