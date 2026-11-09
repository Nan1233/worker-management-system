'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../models/productionTempApprovalModel.js'), 'utf8');
const start = source.indexOf('function createReviewTransitionConflictError(');
const end = source.indexOf('function buildApprovedTempSnapshotOptions(', start);
const rejectStart = source.indexOf('function assertRejectedTempTransition(');
const rejectEnd = source.indexOf('function buildRejectionBatchResult(', rejectStart);
assert.ok(start >= 0 && end > start && rejectStart >= 0 && rejectEnd > rejectStart);
const ctx = {};
vm.runInNewContext(source.slice(start, end) + '\n' + source.slice(rejectStart, rejectEnd), ctx);
const approved = vm.runInNewContext('assertApprovedTempTransition', ctx);
const rejected = vm.runInNewContext('assertRejectedTempTransition', ctx);

for (const [name, verify, code] of [
  ['approval', approved, 'APPROVAL_SELECTION_STALE'],
  ['rejection', rejected, 'TEMP_REPORT_VERSION_CONFLICT'],
]) {
  test(name + ' accepts exactly one affected row', () => {
    assert.doesNotThrow(() => verify({ affectedRows: 1 }, { id: 42 }));
  });

  test(name + ' fails closed on missing, zero or multiple affected rows', () => {
    for (const result of [undefined, null, {}, { affectedRows: 0 }, { affectedRows: 2 }, { affectedRows: -1 }]) {
      assert.throws(() => verify(result, { id: 42 }), (error) => {
        assert.equal(error.status, 409);
        assert.equal(error.code, code);
        assert.equal(error.isPublic, true);
        assert.match(error.message, /#42/);
        return true;
      });
    }
  });
}
