const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const e2e = fs.readFileSync(path.join(root, 'scripts/zero-cost/critical-e2e.cjs'), 'utf8');
const workflow = fs.readFileSync(path.join(root, '.github/workflows/quality-gate.yml'), 'utf8');

test('critical E2E covers the required worker flows', () => {
  for (const marker of [
    "'Worker login'", "'Normal report'", "'Duplicate detection'",
    "'Backdate -14'", "'Backdate -15'", "'Future date'",
    "'MAI multi-machine'", "'DO 1:1'", "'EP 1:1'", "'CAN 1:1'",
    "'GC 5/6/7/11 max4'", "'Shared-machine accounting'",
    "'KQD allowlist'", "'manager_processes authorization'",
    "'Approve/reject'", "'Approved edit conflict'",
    "'Excel export data'", "'Excel import real-diff'",
    "'All selectable products have standards'"
  ]) assert.match(e2e, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('quality gate runs the critical E2E contract on test and main', () => {
  assert.match(workflow, /branches:\s*\[main, test\]/);
  assert.match(workflow, /node --test tests\/critical-e2e-contract\.test\.cjs/);
});

test('standards coverage checks active positive standards', () => {
  assert.match(e2e, /product_standards/);
  assert.match(e2e, /standard_output IS NULL OR ps\.standard_output<=0/);
});

test('E2E has deterministic cleanup protection', () => {
  assert.match(e2e, /KTC_E2E_KEEP_DATA/);
  assert.match(e2e, /production_reports_temp/);
  assert.match(e2e, /production_reports/);
});
