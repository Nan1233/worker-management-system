'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../src/pages/manager/ApprovedReports.tsx'), 'utf8');

test('approved report page load performs only its paginated table request', () => {
  const start = source.indexOf('const load = useCallback(async () => {');
  const end = source.indexOf('}, [date, range, process, shift, searchQuery, page]);', start);
  assert.ok(start >= 0 && end > start);
  const block = source.slice(start, end);
  assert.match(block, /getApprovedReports\(\{ \.\.\.filters, page, pageSize: 20 \}\)/);
  assert.doesNotMatch(block, /Promise\.allSettled|pageSize: 1/);
});

test('KPI count effect excludes page dependency and guards stale results', () => {
  const start = source.indexOf('// KPI counts depend on filters');
  const end = source.indexOf('const filterKey =', start);
  assert.ok(start >= 0 && end > start);
  const block = source.slice(start, end);
  assert.match(block, /Promise\.allSettled/);
  assert.match(block, /if \(cancelled\) return/);
  assert.match(block, /return \(\) => \{ cancelled = true; \}/);
  assert.match(block, /\}, \[date, process, shift, searchQuery\]\);/);
});
