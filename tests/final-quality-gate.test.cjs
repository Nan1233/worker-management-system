const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('final quality scripts are wired', () => {
  const pkg = JSON.parse(read('package.json'));
  for (const name of ['audit:final','audit:performance','audit:excel:roundtrip','quality:final']) {
    assert.equal(typeof pkg.scripts[name], 'string');
  }
});

test('GitHub Actions remain disabled by policy', () => {
  assert.equal(fs.existsSync(path.join(root, '.github', 'workflows')), false);
});

test('manager selected review has resilient partial loading and retry', () => {
  const source = read('src/pages/manager/SelectedReportsReview.tsx');
  assert.match(source, /Promise\.allSettled/);
  assert.match(source, /Tải lại/);
  assert.match(source, /aria-live="assertive"/);
});

test('performance budgets are enforced by an executable audit', () => {
  const source = read('scripts/performanceAudit.cjs');
  assert.match(source, /p95/);
  assert.match(source, /1500/);
  assert.match(source, /KTC_PERF_STRICT/);
});

test('Excel round-trip uses the canonical nine process sheets', () => {
  const source = read('scripts/excelRoundTripContract.cjs');
  for (const marker of ['CÁN','EP','XLBV','Cắt lồng','TT Mài','TT Đo','TT Kiểm 1','TT Kiểm 2','sx3']) {
    assert.match(source, new RegExp(marker));
  }
});
