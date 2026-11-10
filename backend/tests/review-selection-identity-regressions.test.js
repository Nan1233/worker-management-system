'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../models/productionTempApprovalModel.js'), 'utf8');
const start = source.indexOf('function createApprovalSelectionStaleError(');
const end = source.indexOf('function assertApprovalSelectionVersions(', start);
assert.ok(start >= 0 && end > start);
const ctx = {};
vm.runInNewContext(source.slice(start, end), ctx);
const visible = vm.runInNewContext('assertApprovalSelectionVisible', ctx);

function stale(rows, ids, missing) {
  assert.throws(() => visible(rows, ids), (error) => {
    assert.equal(error.code, 'APPROVAL_SELECTION_STALE');
    assert.equal(error.status, 409);
    assert.equal(error.isPublic, true);
    assert.strictEqual(error.details.requested_ids, ids);
    assert.deepEqual(Array.from(error.details.missing_ids), missing);
    return true;
  });
}

test('selection rejects duplicate rows even when every requested ID is present', () => {
  stale([{ id: 1 }, { id: 2 }, { id: 2 }], [1, 2], []);
});

test('selection rejects wrong rows even when returned count matches requested count', () => {
  stale([{ id: 1 }, { id: 9 }], [1, 2], [2]);
});

test('selection rejects an empty result and reports every missing ID', () => {
  stale([], [4, 5], [4, 5]);
});

test('selection accepts distinct rows in any order and numeric-string IDs', () => {
  assert.doesNotThrow(() => visible([{ id: '3' }, { id: 1 }, { id: 2 }], [1, 2, 3]));
});

test('selection rejects duplicate row IDs when the count matches but an ID is missing', () => {
  stale([{ id: 3 }, { id: '3' }], [3, 4], [4]);
});
