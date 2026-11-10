'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../models/productionTempApprovalModel.js'), 'utf8');
const start = source.indexOf('        const approvedReportId = Number(insertResult.insertId);');
const end = source.indexOf('        approvedIds.push(approvedReportId);', start);
assert.ok(start >= 0 && end > start, 'approved insert ID validation precedes detail copy');

function validate(insertId) {
  const ctx = { insertResult: { insertId }, item: { id: 51 }, Number, Error };
  const snippet = source.slice(start, end);
  vm.runInNewContext(snippet + '\nthis.validatedId = approvedReportId;', ctx);
  return ctx.validatedId;
}

test('valid positive safe integer approved parent insert IDs pass', () => {
  assert.equal(validate(1), 1);
  assert.equal(validate('123'), 123);
  assert.equal(validate(Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER);
});

test('invalid approved parent insert IDs fail closed with public 500 error', () => {
  for (const id of [undefined, null, 0, -1, 1.5, 'invalid', Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => validate(id), (error) =>
      error.status === 500
      && error.isPublic === true
      && error.code === 'APPROVED_PARENT_INSERT_ID_INVALID'
      && error.message.includes('#51'),
    );
  }
});

test('parent insert ID is checked before recording IDs or copying detail rows', () => {
  const flow = source.slice(source.indexOf('async approveSelected('), source.indexOf('async rejectSelected('));
  const insert = flow.indexOf('await query(connection, parentInsertSql, parentInsertParams)');
  const validation = flow.indexOf('if (!Number.isSafeInteger(approvedReportId)');
  const record = flow.indexOf('approvedIds.push(approvedReportId)');
  const copy = flow.indexOf('copyApprovedReportDetails(connection, approvedReportId, item.id)');
  assert.ok(insert >= 0 && validation > insert && record > validation && copy > record);
});
