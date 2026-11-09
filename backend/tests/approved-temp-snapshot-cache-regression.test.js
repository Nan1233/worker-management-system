'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../models/productionTempApprovalModel.js'), 'utf8');
const start = source.indexOf('function buildApprovedTempSnapshotOptions(');
const end = source.indexOf('function buildApprovedTempReportVersion(', start);
assert.ok(start >= 0 && end > start, 'approved temp snapshot cache builder must exist');
const ctx = {};
vm.runInNewContext(source.slice(start, end), ctx);
const build = vm.runInNewContext('buildApprovedTempSnapshotOptions', ctx);

test('cached machine lines are passed by identity for the selected temp report', () => {
  const lines = [{ id: 4, machine_code: 'M-1', counted_output: '125.000000' }];
  const cache = new Map([[45, lines], [46, [{ id: 5 }]]]);
  const result = build({ id: 45 }, cache);
  assert.strictEqual(result.machineLines, lines);
  assert.equal(result.machineLines[0].counted_output, '125.000000');
});

test('string report identifier resolves numeric cache key without reading another report', () => {
  const expected = [{ id: 7 }];
  const other = [{ id: 8 }];
  const cache = new Map([[45, expected], [46, other]]);
  const result = build({ id: '45' }, cache);
  assert.strictEqual(result.machineLines, expected);
  assert.notStrictEqual(result.machineLines, other);
});

test('missing cache entry returns null instead of substituting another report lines', () => {
  const cache = new Map([[46, [{ id: 8 }]]]);
  assert.equal(build({ id: 45 }, cache), null);
});

test('cached empty machine list remains a valid snapshot option', () => {
  const empty = [];
  const cache = new Map([[45, empty]]);
  const result = build({ id: 45 }, cache);
  assert.strictEqual(result.machineLines, empty);
});
