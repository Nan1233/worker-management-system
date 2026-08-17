const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

test('worker standard display/state no longer rounds authoritative decimal', () => {
  const source = read('src/pages/worker/components/ProcessBasicInfoSection.tsx');
  assert.doesNotMatch(source, /Math\.round\(Number\(selectedProduct\.standard_output/);
  assert.match(source, /String\(Number\(selectedProduct\.standard_output\)\)/);
});

test('manager review/detail/edit preserve decimal standard semantics', () => {
  const review = read('src/pages/manager/SelectedReportsReview.tsx');
  const detail = read('src/pages/manager/ReportDetail.tsx');
  const edit = read('src/pages/manager/EditReport.tsx');
  assert.doesNotMatch(review, /Math\.round\([^\n]*standard_output/);
  assert.doesNotMatch(detail, /Math\.round\([^\n]*standard_output/);
  assert.doesNotMatch(edit, /Math\.round\([^\n]*standard_output/);
  assert.match(edit, /inputMode="decimal"[^>]*readOnly/);
});

test('master-data UI accepts decimal standards instead of integer-only contract', () => {
  const source = read('src/pages/admin/MasterData.tsx');
  assert.doesNotMatch(source, /Định mức \(số nguyên\)|Number\.isInteger\(Number\(form\.standard_output\)\)/);
  assert.match(source, /inputMode=\{field\.key==='standard_output'\?'decimal'/);
});
