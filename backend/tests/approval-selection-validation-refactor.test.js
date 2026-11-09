'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../models/productionTempApprovalModel.js'), 'utf8');
const start = source.indexOf('function buildApprovalSelection(');
const end = source.indexOf('module.exports = {', start);
assert.ok(start >= 0 && end > start);
const ctx = { normalizeIds: (ids) => [...new Set(ids.map(Number).filter((id) => Number.isInteger(id) && id > 0))] };
vm.runInNewContext(source.slice(start, end), ctx);
const build = vm.runInNewContext('buildApprovalSelection', ctx);
const visible = vm.runInNewContext('assertApprovalSelectionVisible', ctx);
const versions = vm.runInNewContext('assertApprovalSelectionVersions', ctx);

test('normalization preserves primitive IDs, duplicate last-write timestamp and falsy timestamp', () => {
  const selection = build([{ id: 4, expected_updated_at: '2026-10-30T01:00:00Z' }, 8,
    { id: '4', expected_updated_at: '' }]);
  assert.deepEqual(Array.from(selection.reportIds), [4, 8]);
  assert.equal(selection.expectedById.get(4), null);
  assert.equal(selection.expectedById.get(8), null);
});

test('invalid selections keep existing message', () => {
  for (const value of [null, {}, [], [0], ['bad']]) {
    assert.throws(() => build(value), (error) => error.message === 'Danh sách báo cáo không hợp lệ');
  }
});

test('stale selection preserves public 409 error, requested and missing IDs', () => {
  const requested = [2, 3, 4];
  assert.throws(() => visible([{ id: 2 }, { id: '4' }], requested), (error) => {
    assert.equal(error.status, 409);
    assert.equal(error.code, 'APPROVAL_SELECTION_STALE');
    assert.equal(error.isPublic, true);
    assert.match(error.message, /Hãy tải lại danh sách rồi chọn lại/);
    assert.strictEqual(error.details.requested_ids, requested);
    assert.deepEqual(Array.from(error.details.missing_ids), [3]);
    return true;
  });
  assert.doesNotThrow(() => visible([{ id: 2 }, { id: 3 }], [2, 3]));
});

test('visibility check preserves length-only acceptance and fail-closed mismatch', () => {
  assert.doesNotThrow(() => visible([{ id: 99 }], [1]));
  assert.throws(() => visible([], [1]), (error) => error.code === 'APPROVAL_SELECTION_STALE');
});

test('optimistic concurrency preserves exact timestamp comparison and error', () => {
  const expectedById = new Map([[7, '2026-10-30T01:00:00Z']]);
  assert.doesNotThrow(() => versions([{ id: '7', updated_at: '2026-10-30T01:00:00.000Z' }], expectedById));
  assert.throws(() => versions([{ id: 7, updated_at: '2026-10-30T02:00:00Z' }], expectedById), (error) => {
    assert.equal(error.status, 409);
    assert.equal(error.code, 'TEMP_REPORT_VERSION_CONFLICT');
    assert.equal(error.isPublic, true);
    assert.match(error.message, /Báo cáo #7 đã thay đổi/);
    return true;
  });
});

test('falsy expected timestamps and invalid-date comparisons remain unchanged', () => {
  assert.doesNotThrow(() => versions([{ id: 5, updated_at: 'bad' }], new Map([[5, null]])));
  assert.throws(() => versions([{ id: 5, updated_at: 'bad' }], new Map([[5, 'bad']])),
    (error) => error.code === 'TEMP_REPORT_VERSION_CONFLICT');
});

test('transaction approval calls checks in original order after SELECT FOR UPDATE', () => {
  const approval = source.slice(source.indexOf('async approveSelected('));
  const select = approval.indexOf('await query(connection, selectionSql, selectionParams)');
  const visibleCall = approval.indexOf('assertApprovalSelectionVisible(rows, reportIds)');
  const versionCall = approval.indexOf('assertApprovalSelectionVersions(rows, expectedById)');
  const standard = approval.indexOf('const standardResolver = createStandardResolver(');
  assert.ok(select >= 0 && select < visibleCall && visibleCall < versionCall && versionCall < standard);
  assert.match(approval, /const \{ reportIds, expectedById \} = buildApprovalSelection\(targets\)/);
});
