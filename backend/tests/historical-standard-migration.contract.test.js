const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const migration = fs.readFileSync(path.join(root,'migrations','019_historical_standard_snapshot_20260812.sql'),'utf8');
const reset = fs.readFileSync(path.join(root,'database','KTC_RESET_FULL_DATABASE_LATEST_20260810.sql'),'utf8');
const approval = fs.readFileSync(path.join(root,'models','productionTempApprovalModel.js'),'utf8');

test('Wave 1A migration persists historical standard identity on parents and machine lines', () => {
  for (const table of ['production_reports_temp','production_reports','production_temp_machine_lines','production_report_machine_lines']) {
    assert.match(migration, new RegExp(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS standard_version_id`, 'i'));
  }
  assert.match(migration,/machine_standard_id/i);
  assert.match(reset,/standard_version_id BIGINT NULL/i);
  assert.match(reset,/machine_standard_id BIGINT NULL/i);
});

test('approval no longer attaches a newly looked-up historical version to copied current value', () => {
  assert.doesNotMatch(approval,/ORDER BY effective_from DESC, version_no DESC LIMIT 1/);
  assert.match(approval,/assertStandardSnapshotConsistency/);
  assert.match(approval,/item\.standard_version_id/);
});

test('historical-standard scanner is read-only and classifies repair candidates', () => {
  const scanner = fs.readFileSync(path.join(root,'scripts','auditHistoricalStandards.js'),'utf8');
  assert.doesNotMatch(scanner,/\bUPDATE\b|\bDELETE\b|\bINSERT\b/i);
  assert.match(scanner,/AUTO_REPAIR_SAFE/);
  assert.match(scanner,/REVIEW_REQUIRED/);
  assert.match(scanner,/UNRESOLVED/);
  assert.match(scanner,/DECIMAL_ROUNDING_CANDIDATE/);
});
