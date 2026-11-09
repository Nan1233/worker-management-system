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

test('normalization preserves primitive IDs and cannot erase duplicate version guard', () => {
  const timestamp = '2026-10-30T01:00:00Z';
  const selection = build([{ id: 4, expected_updated_at: timestamp }, 8,
    { id: '4', expected_updated_at: '' }]);
  assert.deepEqual(Array.from(selection.reportIds), [4, 8]);
  assert.equal(selection.expectedById.get(4), timestamp);
  assert.equal(selection.expectedById.get(8), null);
  assert.throws(() => versions([{ id: 4, updated_at: '2026-10-30T02:00:00Z' }], selection.expectedById),
    (error) => error.code === 'TEMP_REPORT_VERSION_CONFLICT');
  const withLaterTimestamp = build([{ id: 4 }, { id: '4', expected_updated_at: timestamp }]);
  assert.equal(withLaterTimestamp.expectedById.get(4), timestamp);
});

test('conflicting duplicate timestamps fail closed before acquiring a connection', () => {
  const first = '2026-10-30T01:00:00Z';
  const second = '2026-10-30T02:00:00Z';
  assert.throws(() => build([
    { id: 7, expected_updated_at: first },
    { id: '7', expected_updated_at: second },
  ]), (error) => error.code === 'TEMP_REPORT_VERSION_CONFLICT' && error.status === 409);
  assert.doesNotThrow(() => build([
    { id: 7, expected_updated_at: first },
    { id: 7, expected_updated_at: '2026-10-30T01:00:00.000Z' },
  ]));
});

test('invalid selections keep existing message', () => {
  for (const value of [null, {}, [], [0], ['bad'], [null], [undefined], [null, undefined]]) {
    assert.throws(() => build(value), (error) => error.message === 'Danh sách báo cáo không hợp lệ');
  }
});

test('selection rejects unsafe integer report IDs before database access', () => {
  for (const value of [
    [Number.MAX_SAFE_INTEGER + 1],
    [Number.POSITIVE_INFINITY],
    [Number.NaN],
    ['9007199254740993'],
    [1.5],
    [-2],
    [1, Number.MAX_SAFE_INTEGER + 1],
    [1, 'not-a-report'],
  ]) {
    assert.throws(() => build(value), (error) => error.message === 'Danh sách báo cáo không hợp lệ');
  }
  assert.deepEqual(Array.from(build([Number.MAX_SAFE_INTEGER]).reportIds), [Number.MAX_SAFE_INTEGER]);
});

test('selection rejects coerced non-decimal IDs rather than approving another report', () => {
  for (const value of [[true], [false], ['0x10'], ['1e2'], [' 1 '], ['1.0'], [1, true], [1, '0x2']]) {
    assert.throws(() => build(value), (error) => error.message === 'Danh sách báo cáo không hợp lệ');
  }
  assert.deepEqual(Array.from(build([1, '002']).reportIds), [1, 2]);
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

test('visibility check rejects same-length wrong IDs and duplicate rows', () => {
  assert.throws(() => visible([{ id: 99 }], [1]), (error) =>
    error.code === 'APPROVAL_SELECTION_STALE'
    && Array.from(error.details.missing_ids).join(',') === '1');
  assert.throws(() => visible([{ id: 1 }, { id: 1 }], [1, 2]), (error) =>
    error.code === 'APPROVAL_SELECTION_STALE'
    && Array.from(error.details.missing_ids).join(',') === '2');
  assert.throws(() => visible([], [1]), (error) => error.code === 'APPROVAL_SELECTION_STALE');
  assert.doesNotThrow(() => visible([{ id: '2' }, { id: 1 }], [1, 2]));
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
