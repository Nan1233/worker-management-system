const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const backendRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(backendRoot, '..');
const read = (rel) => fs.readFileSync(path.join(backendRoot, rel), 'utf8');

const migration = read('migrations/022_shared_machine_accounting_20260812.sql');
const reset = read('database/KTC_RESET_FULL_DATABASE_LATEST_20260810.sql');
const design = fs.readFileSync(path.join(repoRoot, 'docs/KTC_WAVE1C_PART2_SHARED_MACHINE_DESIGN_20260812.md'), 'utf8');

test('022 creates physical machine event separately from worker participation', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS machine_production_events/i);
  assert.match(migration, /physical_ok_quantity BIGINT/i);
  assert.match(migration, /physical_ng_quantity BIGINT/i);
  assert.match(migration, /physical_counted_output DECIMAL\(18,6\)/i);
  assert.match(migration, /physical_total_output DECIMAL\(18,6\)/i);
  assert.match(migration, /machine_time_hours DECIMAL\(12,4\)/i);
  assert.match(migration, /standard_output DECIMAL\(18,6\)/i);
  assert.match(migration, /standard_version_id BIGINT/i);
  assert.match(migration, /machine_standard_id BIGINT/i);
  assert.match(migration, /exclude_kqd_from_tt_snapshot TINYINT\(1\) NOT NULL/i);
  assert.match(migration, /created_by BIGINT NOT NULL/i);
});

test('022 links existing worker machine lines to event instead of duplicating worker-credit table', () => {
  assert.match(migration, /ALTER TABLE production_temp_machine_lines[\s\S]*machine_event_id BIGINT NULL/i);
  assert.match(migration, /ALTER TABLE production_report_machine_lines[\s\S]*machine_event_id BIGINT NULL/i);
  assert.doesNotMatch(migration, /CREATE TABLE IF NOT EXISTS machine_event_workers/i);
  assert.match(design, /counted_output` = canonical worker credited output/i);
  assert.match(design, /machine_time_hours` = canonical worker participation time/i);
});

test('022 stores physical defects once with responsible worker', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS machine_production_event_defects/i);
  assert.match(migration, /responsible_worker_id BIGINT NOT NULL/i);
  assert.match(migration, /UNIQUE KEY uq_mped_event_code_worker \(machine_event_id, defect_code, responsible_worker_id\)/i);
});

test('event identity permits multiple products and repeated same-product runs', () => {
  assert.match(migration, /PRIMARY KEY \(id\)/i);
  assert.doesNotMatch(migration, /UNIQUE KEY[^\n]*machine_id[^\n]*work_date[^\n]*shift[^\n]*product_code/i);
  assert.match(design, /Product X run 1 \+ Product X run 2/i);
});

test('design explicitly permits worker credit aggregate to exceed physical output and forbids equal split assumption', () => {
  assert.match(design, /SUM\(worker credited output\).*not constrained to equal machine physical output/is);
  assert.doesNotMatch(design, /credited_output\s*=\s*physical[^\n]*\/\s*(?:workers|4|N)/i);
  assert.match(design, /1000 physical units while A and B each receive 1000 credit/i);
});

test('reset schema contains Wave 1C event structures and machine event links', () => {
  assert.match(reset, /CREATE TABLE IF NOT EXISTS machine_production_events/i);
  assert.match(reset, /CREATE TABLE IF NOT EXISTS machine_production_event_defects/i);
  const tempBlock = reset.match(/CREATE TABLE IF NOT EXISTS production_temp_machine_lines[\s\S]*?\n\);/)?.[0] || '';
  const approvedBlock = reset.match(/CREATE TABLE IF NOT EXISTS production_report_machine_lines[\s\S]*?\n\);/)?.[0] || '';
  assert.match(tempBlock, /machine_event_id BIGINT NULL/i);
  assert.match(approvedBlock, /machine_event_id BIGINT NULL/i);
});
