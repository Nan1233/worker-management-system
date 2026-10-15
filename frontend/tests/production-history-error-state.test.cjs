'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(__dirname, '../src/pages/worker/ProductionHistory.tsx'),
  'utf8',
);

test('history API errors do not also show the no-results empty state', () => {
  assert.match(source, /\{error && <div className="history-error">\{error\}<\/div>\}/);
  assert.match(source, /!error && filteredReports\.length === 0/);
  assert.match(source, /: !error && filteredReports\.length > 0 \?/);
});

test('a successful empty history still shows the no-results message', () => {
  assert.match(source, /<strong>Không tìm thấy báo cáo<\/strong>/);
  assert.match(source, /<p>Thử thay đổi từ khóa hoặc bộ lọc\.<\/p>/);
});
