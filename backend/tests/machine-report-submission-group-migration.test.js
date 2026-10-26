const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('migration 061 adds nullable submission group links without rewriting legacy reports', () => {
  const migrationPath = path.join(__dirname, '..', 'migrations', '061_machine_reports_submission_group_20261026.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');
  assert.match(sql, /ALTER TABLE production_reports_temp\s+ADD COLUMN IF NOT EXISTS submission_group_id VARCHAR\(80\) NULL/i);
  assert.match(sql, /ALTER TABLE production_reports\s+ADD COLUMN IF NOT EXISTS submission_group_id VARCHAR\(80\) NULL/i);
  assert.match(sql, /idx_temp_submission_group/);
  assert.match(sql, /idx_approved_submission_group/);
  assert.doesNotMatch(sql, /\b(?:UPDATE|DELETE|DROP|TRUNCATE)\b/i);
});
