const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migration = fs.readFileSync(path.join(__dirname, '../migrations/021_kqd_policy_snapshot_20260812.sql'), 'utf8');
const reset = fs.readFileSync(path.join(__dirname, '../database/KTC_RESET_FULL_DATABASE_LATEST_20260810.sql'), 'utf8');
const scanner = fs.readFileSync(path.join(__dirname, '../scripts/auditKqdSnapshots.js'), 'utf8');

test('migration 021 adds only parent KQD policy snapshot fields and reset matches', () => {
  assert.match(migration, /production_reports_temp/);
  assert.match(migration, /production_reports/);
  assert.match(migration, /exclude_kqd_from_tt_snapshot\s+TINYINT\(1\)\s+NULL/);
  assert.match(reset, /exclude_kqd_from_tt_snapshot\s+TINYINT\(1\)\s+NULL/);
  assert.equal(fs.existsSync(path.join(__dirname, '../migrations/019_historical_standard_snapshot_20260812.sql')), true);
  assert.equal(fs.existsSync(path.join(__dirname, '../migrations/020_training_percent_snapshot_20260812.sql')), true);
});

test('KQD scanner is read-only and classifies required risks', () => {
  assert.doesNotMatch(scanner, /\bUPDATE\s+/i);
  assert.doesNotMatch(scanner, /\bDELETE\s+/i);
  assert.doesNotMatch(scanner, /\bINSERT\s+/i);
  for (const code of [
    'KQD_PARENT_DETAIL_MISMATCH',
    'KQD_POLICY_UNKNOWN',
    'KQD_EDIT_CORRUPTION_CANDIDATE',
    'KQD_HISTORICAL_POLICY_DRIFT',
    'KQD_FAMILY_CODE_AMBIGUOUS'
  ]) assert.match(scanner, new RegExp(code));
});
